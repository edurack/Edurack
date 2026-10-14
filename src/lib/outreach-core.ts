// SERVER-ONLY core of one-tap outreach. Kept out of server-functions/outreach.ts on purpose:
// that file is imported by the admin UI, and anything plain-exported from it would be bundled
// into the browser (mailer.ts throws there because RESEND_API_KEY doesn't exist client-side).
// The server functions import from here only inside their handlers, so the compiler strips it.
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { firstName, outreachEmailHtml, safeUrl } from "@/lib/growth-emails";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import type { OutreachAudience, OutreachCampaign, OutreachJobView } from "@/lib/outreach-types";
import { classifyRecipients, isQuietHour, normalizeEmail, parseGapDays } from "@/lib/email-policy";
import { ensureGuardIndexes, recentlyEmailedUids, suppressedSet } from "@/lib/email-guard";

export type Db = Awaited<ReturnType<typeof getDb>>;
export const CHUNK = 40; // ≈ 22 s of sending at Resend's 2 req/s — safely inside a serverless timeout
const MAX_AUDIENCE = 5000;

let indexesReady = false;
export async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  try {
    await db.collection("outreachLog").createIndex({ campaignId: 1, uid: 1 }, { unique: true });
    await db.collection("outreachJobs").createIndex({ status: 1, startedAt: -1 });
  } catch { /* best-effort */ }
  await ensureGuardIndexes(db);
  indexesReady = true;
}

// ─── helpers ───────────────────────────────────────────────────────────────
export async function oid(id: string) {
  const { ObjectId } = await import("mongodb");
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid id.");
  return new ObjectId(id);
}

export const toCampaign = (d: any): OutreachCampaign => ({
  id: String(d._id),
  name: d.name,
  subject: d.subject,
  message: d.message,
  assets: d.assets ?? [],
  audience: d.audience,
  lastSentAt: d.lastSentAt instanceof Date ? d.lastSentAt.toISOString() : null,
});

export const toJob = (j: any, waiting?: OutreachJobView["waiting"]): OutreachJobView => ({
  id: String(j._id), campaignId: j.campaignId, status: j.status, total: j.total, sent: j.sent, failed: j.failed,
  startedAt: (j.startedAt as Date).toISOString(),
  ...(waiting ? { waiting } : {}),
});

/** Mongo filter for "who is this campaign for". Respects the marketing opt-out. */
export async function audienceFilter(db: Db, a: OutreachAudience): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [{ email: { $type: "string", $ne: "" } }, { "emailOptOut.marketing": { $ne: true } }];
  if (a.exam !== "any") {
    const exam = { $regex: `^${a.exam}$`, $options: "i" };
    // The app treats a missing targetExam as NEET (see getAdminStudentFullProfile), so match that.
    and.push(a.exam === "neet" ? { $or: [{ targetExam: exam }, { targetExam: { $exists: false } }, { targetExam: "" }] } : { targetExam: exam });
  }
  if (a.track !== "any") and.push({ track: a.track });
  if (a.nonBuyersOnly) {
    const buyers = await db.collection("purchases").distinct("uid");
    and.push({ uid: { $nin: buyers } });
  }
  return { $and: and };
}

export type Recipient = { uid: string; email: string; fullName?: string };

/**
 * Audience members who can be emailed now for this campaign. On top of "not already sent this campaign" it drops
 *  - addresses on the suppression list (bounced / reported spam), and
 *  - students who got ANY marketing email in the last OUTREACH_MIN_GAP_DAYS days (frequency cap; default 3, 0 = off).
 * `pendingCount` counts only the people who will actually be emailed, so a job can finish even with skipped students.
 */
export async function pendingRecipients(db: Db, campaignId: string, a: OutreachAudience, limit: number) {
  const done = new Set((await db.collection("outreachLog").find({ campaignId }, { projection: { uid: 1 } }).toArray()).map((d) => d.uid as string));
  const profiles = await db.collection("profiles").find(await audienceFilter(db, a), { projection: { uid: 1, fullName: 1, email: 1 } }).sort({ _id: 1 }).limit(MAX_AUDIENCE).toArray();
  const notYet = profiles.filter((p) => !done.has(p.uid as string));

  const gapDays = parseGapDays(process.env.OUTREACH_MIN_GAP_DAYS);
  const [blockedEmails, recentUids] = await Promise.all([
    suppressedSet(db, notYet.map((p) => normalizeEmail(p.email as string))),
    gapDays > 0 ? recentlyEmailedUids(db, notYet.map((p) => p.uid as string), new Date(Date.now() - gapDays * 864e5)) : Promise.resolve(new Set<string>()),
  ]);
  const candidates: Recipient[] = notYet.map((p) => ({ uid: p.uid as string, email: p.email as string, fullName: p.fullName as string | undefined }));
  const { eligible, blocked, recent } = classifyRecipients(candidates, blockedEmails, recentUids);
  return {
    total: profiles.length,
    pendingCount: eligible.length,
    batch: eligible.slice(0, limit),
    alreadySent: profiles.length - notYet.length,
    suppressed: blocked.length,
    recent: recent.length,
    gapDays,
  };
}

export function validateCampaign(c: Pick<OutreachCampaign, "name" | "subject" | "message" | "assets">) {
  if (!c.name.trim() || !c.subject.trim() || !c.message.trim()) throw new Error("Name, subject and message are required.");
  if (c.assets.length > 8) throw new Error("Max 8 asset links per email.");
  for (const a of c.assets) if (!a.label.trim() || !safeUrl(a.url)) throw new Error(`Bad asset link: "${a.label || a.url}" (needs a label and an http/https URL).`);
}

export async function sendOne(c: OutreachCampaign, p: { uid: string; fullName?: string; email: string }, opts: { subjectPrefix?: string } = {}) {
  const name = firstName(p.fullName);
  await sendMail({
    to: p.email,
    subject: (opts.subjectPrefix ?? "") + c.subject.replace(/\{\{name\}\}/g, name),
    html: outreachEmailHtml({
      name,
      message: c.message.replace(/\{\{name\}\}/g, name),
      assets: c.assets,
      unsubscribeUrl: unsubscribeUrl(p.uid, "marketing"),
    }),
  });
}

/** Send up to CHUNK pending emails of a job. Guarded by a short lock so UI + cron can't overlap. */
export async function runChunk(db: Db, jobId: string): Promise<OutreachJobView> {
  const _id = await oid(jobId);
  const now = new Date();
  // Quiet hours (22:00–08:00 IST): don't email students at night. The job stays "running" and /cron/outreach
  // picks it up after 08:00.
  if (isQuietHour(now)) {
    const waiting = await db.collection("outreachJobs").findOne({ _id });
    if (waiting && waiting.status === "running") return toJob(waiting, "quiet_hours");
  }
  const job = await db.collection("outreachJobs").findOneAndUpdate(
    { _id, status: "running", $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + 90_000) } },
    { returnDocument: "after" },
  );
  if (!job) return toJob(await db.collection("outreachJobs").findOne({ _id })); // done or another worker has it

  try {
    const campaignDoc = await db.collection("outreachCampaigns").findOne({ _id: await oid(job.campaignId) });
    if (!campaignDoc) throw new Error("Campaign was deleted.");
    const campaign = toCampaign(campaignDoc);
    const { batch } = await pendingRecipients(db, job.campaignId, campaign.audience, CHUNK);

    let sent = 0, failed = 0;
    for (const p of batch) {
      try {
        await db.collection("outreachLog").insertOne({ campaignId: job.campaignId, uid: p.uid, email: p.email, status: "sending", jobId, createdAt: new Date() });
      } catch (e: any) {
        if (e?.code === 11000) continue; // someone already handled this student
        throw e;
      }
      try {
        await sendOne(campaign, { uid: p.uid as string, fullName: p.fullName as string, email: p.email as string });
        await db.collection("outreachLog").updateOne({ campaignId: job.campaignId, uid: p.uid }, { $set: { status: "sent", sentAt: new Date() } });
        sent++;
      } catch (err) {
        await db.collection("outreachLog").updateOne({ campaignId: job.campaignId, uid: p.uid }, { $set: { status: "failed", error: String(err) } });
        failed++;
      }
      await new Promise((r) => setTimeout(r, 550));
    }

    const remaining = (await pendingRecipients(db, job.campaignId, campaign.audience, 1)).pendingCount;
    const finished = batch.length === 0 || remaining === 0;
    const updated = await db.collection("outreachJobs").findOneAndUpdate(
      { _id },
      { $inc: { sent, failed }, $set: { lockedUntil: null, ...(finished ? { status: "done", finishedAt: new Date() } : {}) } },
      { returnDocument: "after" },
    );
    if (finished) await db.collection("outreachCampaigns").updateOne({ _id: await oid(job.campaignId) }, { $set: { lastSentAt: new Date() } });
    return toJob(updated);
  } catch (err) {
    await db.collection("outreachJobs").updateOne({ _id }, { $set: { lockedUntil: null } });
    throw err;
  }
}

/** For /cron/outreach — finishes any job whose browser tab was closed mid-send. */
export async function processOutreachJobs() {
  const db = await getDb();
  await ensureIndexes(db);
  const running = await db.collection("outreachJobs").find({ status: "running" }).limit(5).toArray();
  const out: OutreachJobView[] = [];
  for (const j of running) out.push(await runChunk(db, String(j._id)));
  return { jobs: out };
}

/** Everything the composer needs before anything is saved or sent. */
export async function previewDraft(c: Pick<OutreachCampaign, "subject" | "message" | "assets">, sampleName = "Aarav") {
  const html = outreachEmailHtml({
    name: sampleName,
    message: c.message.replace(/\{\{name\}\}/g, sampleName),
    assets: c.assets,
    unsubscribeUrl: "#",
  });
  return { subject: c.subject.replace(/\{\{name\}\}/g, sampleName), html };
}

export async function countAudience(db: Db, a: OutreachAudience) {
  const filter = await audienceFilter(db, a);
  const [total, sample] = await Promise.all([
    db.collection("profiles").countDocuments(filter),
    db.collection("profiles").find(filter, { projection: { fullName: 1, email: 1 } }).sort({ _id: -1 }).limit(3).toArray(),
  ]);
  return { total: Math.min(total, MAX_AUDIENCE), sample: sample.map((p) => ({ name: (p.fullName as string) || "—", email: p.email as string })) };
}

/** Emails per campaign (from the idempotency log) so the UI can show real numbers. */
export async function sentCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db.collection("outreachLog").aggregate([{ $match: { status: "sent" } }, { $group: { _id: "$campaignId", n: { $sum: 1 } } }]).toArray();
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n as number]));
}
