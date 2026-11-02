// SERVER-ONLY. One reminder email to a student who started paying for Edurack Pro and didn't finish.
//
// createRazorpayOrder writes a `proCheckouts` row each time a student starts a Pro checkout. Each run of
// /cron/checkout-reminders looks at checkouts that are at least CHECKOUT_REMINDER_MIN_MINUTES old (default 60)
// and at most CHECKOUT_REMINDER_MAX_HOURS old (default 36), and emails the student once if they have not bought
// Pro since. Run it every 15-30 minutes and the email goes out about an hour after they stopped; run it once a
// day (Vercel Hobby) and it goes out at the first run after that hour. Either way a student gets at most one
// reminder a week (unique index on checkoutReminderLog), so overlapping or doubled runs are harmless.
//
// It respects the same rules as the other emails: the "marketing" unsubscribe, bounced and complained
// addresses, and the 22:00-08:00 IST quiet hours (a checkout that is still inside the window is picked up on a
// later run).
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { suppressedSet } from "@/lib/email-guard";
import { isQuietHour } from "@/lib/email-policy";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { proUntil } from "@/lib/pro-server";
import { SITE_URL, checkoutReminderEmailHtml, checkoutReminderSubject, firstName } from "@/lib/growth-emails";

type Db = Awaited<ReturnType<typeof getDb>>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let indexesReady = false;
async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  indexesReady = true;
  try {
    // Also expires old checkouts after 30 days, so the collection stays small.
    await db.collection("proCheckouts").createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
    await db.collection("checkoutReminderLog").createIndex({ uid: 1, bucket: 1 }, { unique: true });
  } catch (err) {
    console.error("[checkout-reminders] couldn't create indexes:", err);
  }
}

export type CheckoutSweepResult = { checked: number; sent: number; skipped: number; failed: number; quietHours: boolean; dryRun: boolean; preview?: unknown[] };

export async function sendCheckoutReminders(now: Date = new Date(), opts: { dryRun?: boolean } = {}): Promise<CheckoutSweepResult> {
  const db = await getDb();
  await ensureIndexes(db);
  const result: CheckoutSweepResult = { checked: 0, sent: 0, skipped: 0, failed: 0, quietHours: false, dryRun: Boolean(opts.dryRun), preview: opts.dryRun ? [] : undefined };
  if (isQuietHour(now)) {
    result.quietHours = true;
    return result;
  }

  const minMinutes = Number(process.env.CHECKOUT_REMINDER_MIN_MINUTES ?? 60);
  const maxHours = Number(process.env.CHECKOUT_REMINDER_MAX_HOURS ?? 36);
  const newest = new Date(now.getTime() - minMinutes * 60_000);
  const oldest = new Date(now.getTime() - maxHours * 3_600_000);

  const rows = await db
    .collection("proCheckouts")
    .find({ createdAt: { $gte: oldest, $lte: newest }, reminderStatus: null })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
  if (rows.length === 0) return result;

  // One candidate per student: their latest checkout.
  const latestByUid = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latestByUid.has(String(r.uid))) latestByUid.set(String(r.uid), r);
  result.checked = latestByUid.size;

  const uids = [...latestByUid.keys()];
  const profiles = await db.collection("profiles").find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1, email: 1, emailOptOut: 1 } }).toArray();
  const profileByUid = new Map(profiles.map((p) => [String(p.uid), p]));
  const blocked = await suppressedSet(db, profiles.map((p) => String(p.email ?? "")));

  const markDone = (uid: string, status: "sent" | "paid" | "skipped" | "failed") =>
    opts.dryRun ? Promise.resolve() : db.collection("proCheckouts").updateMany({ uid, reminderStatus: null, createdAt: { $lte: newest } }, { $set: { reminderStatus: status, reminderAt: new Date() } });

  for (const [uid, checkout] of latestByUid) {
    // Bought since (or Pro is running right now): nothing to remind about.
    const boughtSince = await db.collection("proGrants").findOne({ uid, createdAt: { $gte: checkout.createdAt as Date } }, { projection: { _id: 1 } });
    if (boughtSince || (await proUntil(db, uid, now))) {
      await markDone(uid, "paid");
      result.skipped++;
      continue;
    }

    const profile = profileByUid.get(uid);
    const email = String(profile?.email ?? "").trim();
    if (!email || profile?.emailOptOut?.marketing || blocked.has(email.toLowerCase())) {
      await markDone(uid, "skipped");
      result.skipped++;
      continue;
    }

    const name = firstName(profile?.fullName as string);
    const planName = String(checkout.planName ?? "Edurack Pro");
    const amount = Number(checkout.amount ?? 0);

    if (opts.dryRun) {
      result.preview!.push({ uid, email, planName, amount, startedAt: checkout.createdAt });
      continue;
    }

    // Claim this week's slot BEFORE sending: a duplicate-key error means this student was already reminded.
    try {
      await db.collection("checkoutReminderLog").insertOne({ uid, bucket: Math.floor(now.getTime() / WEEK_MS), status: "sending", createdAt: now });
    } catch (err: any) {
      if (err?.code === 11000) {
        await markDone(uid, "skipped");
        result.skipped++;
        continue;
      }
      throw err;
    }

    try {
      await sendMail({
        to: email,
        subject: checkoutReminderSubject({ name, planName }),
        html: checkoutReminderEmailHtml({
          name,
          planName,
          amount,
          proUrl: `${SITE_URL}/pro?utm_source=email&utm_medium=checkout_reminder`,
          refundUrl: `${SITE_URL}/legal/refund`,
          helpUrl: `${SITE_URL}/help`,
          unsubscribeUrl: unsubscribeUrl(uid, "marketing"),
        }),
      });
      await db.collection("checkoutReminderLog").updateOne({ uid, bucket: Math.floor(now.getTime() / WEEK_MS) }, { $set: { status: "sent", sentAt: new Date() } });
      await markDone(uid, "sent");
      result.sent++;
    } catch (err) {
      console.error(`[checkout-reminders] send failed uid=${uid}:`, err);
      await db.collection("checkoutReminderLog").updateOne({ uid, bucket: Math.floor(now.getTime() / WEEK_MS) }, { $set: { status: "failed", error: String(err) } });
      await markDone(uid, "failed");
      result.failed++;
    }
    await new Promise((r) => setTimeout(r, 550)); // Resend default limit is about 2 requests a second
  }
  return result;
}
