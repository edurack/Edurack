// SERVER-ONLY. Two practice nudges, sent by an external scheduler hitting /cron/lifecycle-emails every ~10 minutes:
//
//   first_drill   : a student who finished sign-up 20 to 72 hours ago and has not answered a single question yet gets one
//                   "try your first Quick Mock" email.
//   weak_chapter  : a student who practised yesterday and did badly in one chapter (4+ questions, half or fewer right) and has
//                   not practised yet today gets "this chapter cost you marks", with a free practice link and a timed-drill link.
//
// Guard rails (this sends real email to students, many of them minors):
//   - only 17:00 to 21:00 IST, and never in quiet hours;
//   - at most one lifecycle email per student per 2 days, and weak_chapter at most once every 3 days;
//   - skips anyone who unsubscribed from nudges, bounced or reported spam, or whose exam is not live yet (NEET and JEE only);
//   - a unique (uid, kind, key) index makes duplicate or overlapping cron ticks harmless, because the slot is claimed BEFORE sending;
//   - every email carries a signed unsubscribe link (kind "nudges").
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import { isQuietHour } from "@/lib/email-policy";
import { istMinuteOfDay } from "@/lib/streak-reminder-rules";
import { suppressedSet } from "@/lib/email-guard";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { firstDrillEmailHtml, firstDrillSubject, firstName, SITE_URL, weakChapterEmailHtml, weakChapterSubject } from "@/lib/growth-emails";

type Db = Awaited<ReturnType<typeof getDb>>;

const LIVE_EXAMS = new Set(["neet", "jee"]); // keep in step with the exams that are live on the platform
const WINDOW_START_MIN = 17 * 60;
const WINDOW_END_MIN = 21 * 60;
const MAX_PER_RUN = 150;
const MIN_QUESTIONS = 4;
const MAX_ACCURACY = 0.5;

let indexesReady = false;
async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  try {
    await db.collection("lifecycleEmailLog").createIndex({ uid: 1, kind: 1, key: 1 }, { unique: true });
    await db.collection("lifecycleEmailLog").createIndex({ uid: 1, sentAt: -1 });
  } catch {
    /* best-effort */
  }
  indexesReady = true;
}

const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
const titleCase = (key: string) => key.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());

export type LifecycleSweepResult = {
  window: "open" | "closed";
  firstDrill: { candidates: number; sent: number; skipped: number; failed: number };
  weakChapter: { candidates: number; sent: number; skipped: number; failed: number };
  dryRun: boolean;
  preview?: unknown[];
};

export async function sendLifecycleEmails(now: Date = new Date(), opts: { dryRun?: boolean } = {}): Promise<LifecycleSweepResult> {
  const result: LifecycleSweepResult = {
    window: "closed",
    firstDrill: { candidates: 0, sent: 0, skipped: 0, failed: 0 },
    weakChapter: { candidates: 0, sent: 0, skipped: 0, failed: 0 },
    dryRun: Boolean(opts.dryRun),
    preview: opts.dryRun ? [] : undefined,
  };
  const minute = istMinuteOfDay(now);
  if (isQuietHour(now) || minute < WINDOW_START_MIN || minute >= WINDOW_END_MIN) return result;
  result.window = "open";

  const db = await getDb();
  await ensureIndexes(db);
  const today = istDayKey(now);
  const yesterday = addDays(today, -1);
  let budget = MAX_PER_RUN;

  /** Sends one email, claiming the (uid, kind, key) slot first. Returns true if it was sent. */
  async function deliver(kind: "first_drill" | "weak_chapter", key: string, uid: string, to: string, subject: string, html: string, bucket: "firstDrill" | "weakChapter") {
    try {
      await db.collection("lifecycleEmailLog").insertOne({ uid, kind, key, status: "sending", sentAt: now });
    } catch (err: any) {
      if (err?.code === 11000) {
        result[bucket].skipped++;
        return false;
      }
      throw err;
    }
    try {
      await sendMail({ to, subject, html });
      await db.collection("lifecycleEmailLog").updateOne({ uid, kind, key }, { $set: { status: "sent", sentAt: new Date() } });
      result[bucket].sent++;
      budget--;
      await new Promise((r) => setTimeout(r, 550)); // Resend default limit is about 2 requests a second
      return true;
    } catch (err) {
      console.error(`[lifecycle-emails] ${kind} send failed uid=${uid}:`, err);
      await db.collection("lifecycleEmailLog").updateOne({ uid, kind, key }, { $set: { status: "failed", error: String(err) } });
      result[bucket].failed++;
      return false;
    }
  }

  /** Students who got a lifecycle email in the last 2 days (any kind), or a weak_chapter email in the last 3 days. */
  async function recentlyNudged(uids: string[]): Promise<{ any: Set<string>; weak: Set<string> }> {
    if (uids.length === 0) return { any: new Set(), weak: new Set() };
    const rows = await db
      .collection("lifecycleEmailLog")
      .find({ uid: { $in: uids }, status: { $in: ["sending", "sent"] }, sentAt: { $gte: new Date(now.getTime() - 3 * 86_400_000) } }, { projection: { uid: 1, kind: 1, sentAt: 1 } })
      .toArray();
    const twoDays = now.getTime() - 2 * 86_400_000;
    const any = new Set<string>();
    const weak = new Set<string>();
    for (const r of rows) {
      const at = r.sentAt instanceof Date ? r.sentAt.getTime() : 0;
      if (at >= twoDays) any.add(r.uid as string);
      if (r.kind === "weak_chapter") weak.add(r.uid as string);
    }
    return { any, weak };
  }

  // ── 1. First-drill nudge ────────────────────────────────────────────────
  const fresh = await db
    .collection("profiles")
    .find(
      {
        createdAt: { $gte: new Date(now.getTime() - 72 * 3_600_000), $lte: new Date(now.getTime() - 20 * 3_600_000) },
        email: { $type: "string", $ne: "" },
        "emailOptOut.nudges": { $ne: true },
        targetExam: { $ne: "" },
      },
      { projection: { uid: 1, fullName: 1, email: 1, targetExam: 1 } },
    )
    .limit(500)
    .toArray();
  const freshLive = fresh.filter((p) => LIVE_EXAMS.has(String(p.targetExam).toLowerCase()));
  if (freshLive.length > 0) {
    const uids = freshLive.map((p) => p.uid as string);
    const practised = new Set((await db.collection("practiceProgress").distinct("uid", { uid: { $in: uids } })) as string[]);
    const blocked = await suppressedSet(db, freshLive.map((p) => String(p.email)));
    const recent = await recentlyNudged(uids);
    for (const p of freshLive) {
      const uid = p.uid as string;
      if (budget <= 0) break;
      if (practised.has(uid) || recent.any.has(uid) || blocked.has(String(p.email).trim().toLowerCase())) continue;
      result.firstDrill.candidates++;
      const exam = String(p.targetExam).toLowerCase();
      const name = firstName(p.fullName as string);
      const examLabel = exam.toUpperCase();
      const drillUrl = `${SITE_URL}/pyq-drill?${new URLSearchParams({ exam, src: "email" }).toString()}`;
      if (opts.dryRun) {
        result.preview!.push({ kind: "first_drill", uid, email: p.email, exam });
        continue;
      }
      await deliver("first_drill", "once", uid, p.email as string, firstDrillSubject({ name, examLabel }), firstDrillEmailHtml({ name, examLabel, drillUrl, unsubscribeUrl: unsubscribeUrl(uid, "nudges") }), "firstDrill");
    }
  }

  // ── 2. Weak-chapter follow-up ───────────────────────────────────────────
  if (budget > 0) {
    const rows = await db
      .collection("practiceProgress")
      .aggregate([
        { $match: { attempts: { $gt: 0 }, updatedAt: { $gte: istDayStart(yesterday), $lt: istDayStart(today) } } },
        { $group: { _id: { uid: "$uid", subject: "$subject", chapterKey: "$chapterKey" }, answered: { $sum: 1 }, correct: { $sum: { $cond: [{ $eq: ["$correct", true] }, 1, 0] } } } },
        { $match: { answered: { $gte: MIN_QUESTIONS } } },
        { $addFields: { accuracy: { $divide: ["$correct", "$answered"] } } },
        { $match: { accuracy: { $lte: MAX_ACCURACY } } },
        { $sort: { accuracy: 1, answered: -1 } },
        { $limit: 3000 },
      ])
      .toArray();
    // Worst chapter per student (rows are already sorted worst first).
    const worst = new Map<string, { subject: string; chapterKey: string; answered: number; correct: number }>();
    for (const r of rows) {
      const uid = r._id.uid as string;
      if (!worst.has(uid)) worst.set(uid, { subject: String(r._id.subject ?? ""), chapterKey: String(r._id.chapterKey ?? ""), answered: r.answered as number, correct: r.correct as number });
    }
    const uids = [...worst.keys()];
    if (uids.length > 0) {
      const activeToday = new Set((await db.collection("practiceProgress").distinct("uid", { uid: { $in: uids }, updatedAt: { $gte: istDayStart(today) } })) as string[]);
      const profiles = await db
        .collection("profiles")
        .find({ uid: { $in: uids }, email: { $type: "string", $ne: "" }, "emailOptOut.nudges": { $ne: true } }, { projection: { uid: 1, fullName: 1, email: 1, targetExam: 1 } })
        .toArray();
      const blocked = await suppressedSet(db, profiles.map((p) => String(p.email)));
      const recent = await recentlyNudged(uids);
      for (const p of profiles) {
        const uid = p.uid as string;
        if (budget <= 0) break;
        const exam = String(p.targetExam ?? "").toLowerCase();
        const w = worst.get(uid);
        if (!w || !w.chapterKey || !w.subject || !LIVE_EXAMS.has(exam)) continue;
        if (activeToday.has(uid) || recent.any.has(uid) || recent.weak.has(uid) || blocked.has(String(p.email).trim().toLowerCase())) continue;
        result.weakChapter.candidates++;
        const name = firstName(p.fullName as string);
        const chapter = titleCase(w.chapterKey);
        const qs = (extra: Record<string, string>) => new URLSearchParams({ exam, subject: w.subject, chapter, ...extra }).toString();
        const practiceUrl = `${SITE_URL}/pyq?${qs({ practice: "true" })}`;
        const drillUrl = `${SITE_URL}/pyq-drill?${qs({ src: "email" })}`;
        if (opts.dryRun) {
          result.preview!.push({ kind: "weak_chapter", uid, email: p.email, chapter, subject: w.subject, answered: w.answered, correct: w.correct });
          continue;
        }
        await deliver(
          "weak_chapter",
          today,
          uid,
          p.email as string,
          weakChapterSubject({ name, chapter }),
          weakChapterEmailHtml({ name, chapter, subject: w.subject, answered: w.answered, correct: w.correct, practiceUrl, drillUrl, unsubscribeUrl: unsubscribeUrl(uid, "nudges") }),
          "weakChapter",
        );
      }
    }
  }
  return result;
}
