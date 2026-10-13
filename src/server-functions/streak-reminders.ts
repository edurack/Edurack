// SERVER-ONLY. Automatic "save your streak" emails.
//
// Called every ~10 minutes by an external scheduler hitting /cron/streak-reminders.
// Each run: find students whose streak is alive but not yet extended today, work
// out the clock time they last practised (IST), and email them once that time has
// arrived today. At most one reminder per student per IST day (unique index on
// streakReminderLog), so overlapping/doubled cron ticks are harmless.
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import { formatIstMinute, hoursLeftToday, isReminderDue, reminderMinuteFor } from "@/lib/streak-reminder-rules";
import { firstName, SITE_URL, streakReminderEmailHtml, streakReminderSubject } from "@/lib/growth-emails";
import { unsubscribeUrl } from "@/lib/unsubscribe";

type Db = Awaited<ReturnType<typeof getDb>>;

let indexesReady = false;
async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  try {
    await db.collection("streakReminderLog").createIndex({ uid: 1, day: 1 }, { unique: true });
    await db.collection("practiceStreaks").createIndex({ lastDay: 1 });
  } catch {
    /* best-effort */
  }
  indexesReady = true;
}

const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

/** What they did on their last practice day, from the notebook. Latest-state per question, which is accurate for "how many did they answer that day". */
async function lastSessionSummary(db: Db, uid: string, lastDay: string) {
  const from = istDayStart(lastDay);
  const to = istDayStart(addDays(lastDay, 1));
  const docs = await db
    .collection("practiceProgress")
    .find({ uid, attempts: { $gt: 0 }, updatedAt: { $gte: from, $lt: to } }, { projection: { subject: 1, chapterKey: 1, correct: 1, updatedAt: 1 } })
    .toArray();
  if (docs.length === 0) return { summary: null, latestAt: null as Date | null };
  const bySubject = new Map<string, number>();
  for (const d of docs) bySubject.set(String(d.subject), (bySubject.get(String(d.subject)) ?? 0) + 1);
  const topSubject = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const latestAt = docs.reduce<Date | null>((m, d) => (d.updatedAt instanceof Date && (!m || d.updatedAt > m) ? d.updatedAt : m), null);
  return {
    summary: { answered: docs.length, correct: docs.filter((d) => d.correct === true).length, topSubject },
    latestAt,
  };
}

export type StreakSweepResult = { checked: number; due: number; sent: number; skipped: number; failed: number; dryRun: boolean; preview?: unknown[] };

export async function sendStreakReminders(now: Date = new Date(), opts: { dryRun?: boolean } = {}): Promise<StreakSweepResult> {
  const db = await getDb();
  await ensureIndexes(db);

  const today = istDayKey(now);
  const yesterday = addDays(today, -1);
  const minStreak = Number(process.env.STREAK_REMINDER_MIN_DAYS ?? 1);
  const leadMinutes = Number(process.env.STREAK_REMINDER_LEAD_MINUTES ?? 0); // 0 = exactly their usual time

  const streaks = await db.collection("practiceStreaks").find({ lastDay: yesterday, current: { $gte: minStreak } }).limit(2000).toArray();
  const result: StreakSweepResult = { checked: streaks.length, due: 0, sent: 0, skipped: 0, failed: 0, dryRun: Boolean(opts.dryRun), preview: opts.dryRun ? [] : undefined };
  if (streaks.length === 0) return result;

  // Cheap pass first: students whose reminder time hasn't arrived yet cost nothing more.
  const candidates: { s: (typeof streaks)[number]; lastAt: Date | null }[] = [];
  for (const s of streaks) {
    const lastAt = s.lastPracticedAt instanceof Date ? s.lastPracticedAt : null;
    // Old streak docs (before lastPracticedAt existed) fall through to the DB lookup below.
    if (lastAt && !isReminderDue({ current: Number(s.current), lastDay: s.lastDay as string }, lastAt, now, { minStreak, leadMinutes })) continue;
    candidates.push({ s, lastAt });
  }
  if (candidates.length === 0) return result;

  const profiles = await db
    .collection("profiles")
    .find({ uid: { $in: candidates.map((c) => c.s.uid as string) } }, { projection: { uid: 1, fullName: 1, email: 1, emailOptOut: 1 } })
    .toArray();
  const profileByUid = new Map(profiles.map((p) => [p.uid as string, p]));

  for (const { s, lastAt } of candidates) {
    const uid = s.uid as string;
    const profile = profileByUid.get(uid);
    if (!profile?.email || profile.emailOptOut?.streak) {
      result.skipped++;
      continue;
    }

    const { summary, latestAt } = await lastSessionSummary(db, uid, yesterday);
    const effectiveLast = lastAt ?? latestAt;
    if (!isReminderDue({ current: Number(s.current), lastDay: s.lastDay as string }, effectiveLast, now, { minStreak, leadMinutes })) continue;
    result.due++;

    if (opts.dryRun) {
      result.preview!.push({ uid, email: profile.email, streak: s.current, sendsAt: formatIstMinute(reminderMinuteFor(effectiveLast, leadMinutes)), lastSession: summary });
      continue;
    }

    // Claim today's slot BEFORE sending: a duplicate-key error means another tick already handled this student.
    try {
      await db.collection("streakReminderLog").insertOne({ uid, day: today, status: "sending", streak: s.current, createdAt: now });
    } catch (err: any) {
      if (err?.code === 11000) {
        result.skipped++;
        continue;
      }
      throw err;
    }

    const name = firstName(profile.fullName as string);
    try {
      await sendMail({
        to: profile.email as string,
        subject: streakReminderSubject({ name, streakDays: Number(s.current) }),
        html: streakReminderEmailHtml({
          name,
          streakDays: Number(s.current),
          hoursLeft: hoursLeftToday(now),
          lastSession: summary,
          practiceUrl: `${SITE_URL}/pyq`,
          unsubscribeUrl: unsubscribeUrl(uid, "streak"),
        }),
      });
      await db.collection("streakReminderLog").updateOne({ uid, day: today }, { $set: { status: "sent", sentAt: new Date() } });
      result.sent++;
    } catch (err) {
      console.error(`[streak-reminders] send failed uid=${uid}:`, err);
      await db.collection("streakReminderLog").updateOne({ uid, day: today }, { $set: { status: "failed", error: String(err) } });
      result.failed++;
    }
    await new Promise((r) => setTimeout(r, 550)); // Resend default limit ≈ 2 req/s
  }
  return result;
}
