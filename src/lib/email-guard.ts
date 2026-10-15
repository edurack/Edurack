// SERVER-ONLY. The database side of email safety: the suppression list (addresses that bounced or
// reported spam), webhook event handling, and the recent-send lookup behind the frequency cap.
//
// Applies to MARKETING-type mail (outreach campaigns, streak reminders). It deliberately does NOT block
// OTP / transactional mail: a student who complained about a newsletter still needs their login code.
import { getDb } from "@/lib/mongo";
import { decideSuppression, eventRecipients, normalizeEmail, type ResendEvent, type SuppressionReason } from "@/lib/email-policy";

export type Db = Awaited<ReturnType<typeof getDb>>;
const DAY = 864e5;

let ready = false;
export async function ensureGuardIndexes(db: Db) {
  if (ready) return;
  try {
    await db.collection("emailSuppressions").createIndex({ email: 1 }, { unique: true });
    await db.collection("emailEvents").createIndex({ email: 1, at: -1 });
    await db.collection("emailEvents").createIndex({ at: 1 }, { expireAfterSeconds: 90 * 86400 });
    await db.collection("webhookEvents").createIndex({ at: 1 }, { expireAfterSeconds: 30 * 86400 }); // dedupe window
    await db.collection("outreachLog").createIndex({ uid: 1, sentAt: -1 });
  } catch { /* best-effort */ }
  ready = true;
}

/** Which of these addresses are on the suppression list? (lower-cased) */
export async function suppressedSet(db: Db, emails: string[]): Promise<Set<string>> {
  const list = [...new Set(emails.filter(Boolean).map(normalizeEmail))];
  if (list.length === 0) return new Set();
  const rows = await db.collection("emailSuppressions").find({ email: { $in: list } }, { projection: { email: 1 } }).toArray();
  return new Set(rows.map((r) => r.email as string));
}

export async function addSuppression(db: Db, email: string, reason: SuppressionReason, detail?: string) {
  await db.collection("emailSuppressions").updateOne(
    { email: normalizeEmail(email) },
    { $setOnInsert: { email: normalizeEmail(email), reason, detail: detail ?? null, at: new Date() } },
    { upsert: true },
  );
}

/** uids that were sent a marketing email since `since`, across ALL campaigns. This is the frequency cap. */
export async function recentlyEmailedUids(db: Db, uids: string[], since: Date): Promise<Set<string>> {
  if (uids.length === 0) return new Set();
  const rows = await db.collection("outreachLog").distinct("uid", { uid: { $in: uids }, status: "sent", sentAt: { $gte: since } });
  return new Set(rows as string[]);
}

/**
 * Process one Resend webhook delivery. Resend delivers at-least-once, so the svix-id is recorded and a
 * repeat is ignored. Returns which addresses were newly blocked.
 */
export async function handleResendEvent(db: Db, svixId: string, evt: ResendEvent): Promise<{ duplicate: boolean; blocked: string[] }> {
  await ensureGuardIndexes(db);
  try {
    await db.collection("webhookEvents").insertOne({ _id: svixId as never, at: new Date(), type: evt.type ?? null });
  } catch (e: any) {
    if (e?.code === 11000) return { duplicate: true, blocked: [] };
    throw e;
  }

  const blocked: string[] = [];
  const bounceType = evt.data?.bounce?.type;
  for (const email of eventRecipients(evt)) {
    if (evt.type === "email.bounced" || evt.type === "email.complained") {
      await db.collection("emailEvents").insertOne({
        email, type: evt.type, bounceType: bounceType ?? null,
        // Kept so the admin can see WHICH email bounced and WHY (shown in Email health).
        subType: evt.data?.bounce?.subType ?? null,
        message: evt.data?.bounce?.message?.slice(0, 300) ?? null,
        subject: evt.data?.subject?.slice(0, 120) ?? null,
        emailId: evt.data?.email_id ?? null,
        at: new Date(),
      });
    }
    const bounces30d = evt.type === "email.bounced"
      ? await db.collection("emailEvents").countDocuments({ email, type: "email.bounced", at: { $gte: new Date(Date.now() - 30 * DAY) } })
      : 0;
    const reason = decideSuppression(evt.type, bounceType, bounces30d);
    if (reason) {
      await addSuppression(db, email, reason, evt.data?.bounce?.message?.slice(0, 200));
      blocked.push(email);
    }
  }
  return { duplicate: false, blocked };
}
