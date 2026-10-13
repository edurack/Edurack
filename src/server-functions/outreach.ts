// Admin-only: one-tap outreach. An admin saves a campaign (subject, message, PDF/asset
// links, audience) once; after that, sending it is a single tap.
//
// Sending is chunked and resumable so it never hits a serverless timeout:
//   tap → startOutreachSend creates a job and sends the first chunk
//       → the UI keeps calling continueOutreachJob while status === "running"
//       → /cron/outreach (processOutreachJobs) also finishes any job left running.
// Each (campaign, student) pair can be emailed once — unique index on outreachLog — so
// double taps, retries and overlapping cron ticks never double-send.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { firstName, outreachEmailHtml, safeUrl } from "@/lib/growth-emails";
import type { OutreachAudience, OutreachCampaign, OutreachJobView } from "@/lib/outreach-types";

type Db = Awaited<ReturnType<typeof getDb>>;
const CHUNK = 40; // ≈ 22 s of sending at Resend's 2 req/s — safely inside a serverless timeout
const MAX_AUDIENCE = 5000;

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

let indexesReady = false;
async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  try {
    await db.collection("outreachLog").createIndex({ campaignId: 1, uid: 1 }, { unique: true });
    await db.collection("outreachJobs").createIndex({ status: 1, startedAt: -1 });
  } catch { /* best-effort */ }
  indexesReady = true;
}

// ─── helpers ───────────────────────────────────────────────────────────────
async function oid(id: string) {
  const { ObjectId } = await import("mongodb");
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid id.");
  return new ObjectId(id);
}

const toCampaign = (d: any): OutreachCampaign => ({
  id: String(d._id),
  name: d.name,
  subject: d.subject,
  message: d.message,
  assets: d.assets ?? [],
  audience: d.audience,
  lastSentAt: d.lastSentAt instanceof Date ? d.lastSentAt.toISOString() : null,
});

const toJob = (j: any): OutreachJobView => ({
  id: String(j._id), campaignId: j.campaignId, status: j.status, total: j.total, sent: j.sent, failed: j.failed,
  startedAt: (j.startedAt as Date).toISOString(),
});

/** Mongo filter for "who is this campaign for". Respects the marketing opt-out. */
async function audienceFilter(db: Db, a: OutreachAudience): Promise<Record<string, unknown>> {
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

/** Audience members not yet emailed for this campaign. */
async function pendingRecipients(db: Db, campaignId: string, a: OutreachAudience, limit: number) {
  const done = new Set((await db.collection("outreachLog").find({ campaignId }, { projection: { uid: 1 } }).toArray()).map((d) => d.uid as string));
  const profiles = await db.collection("profiles").find(await audienceFilter(db, a), { projection: { uid: 1, fullName: 1, email: 1 } }).sort({ _id: 1 }).limit(MAX_AUDIENCE).toArray();
  const pending = profiles.filter((p) => !done.has(p.uid as string));
  return { total: profiles.length, pendingCount: pending.length, batch: pending.slice(0, limit) };
}

function validateCampaign(c: Pick<OutreachCampaign, "name" | "subject" | "message" | "assets">) {
  if (!c.name.trim() || !c.subject.trim() || !c.message.trim()) throw new Error("Name, subject and message are required.");
  if (c.assets.length > 8) throw new Error("Max 8 asset links per email.");
  for (const a of c.assets) if (!a.label.trim() || !safeUrl(a.url)) throw new Error(`Bad asset link: "${a.label || a.url}" (needs a label and an http/https URL).`);
}

async function sendOne(c: OutreachCampaign, p: { uid: string; fullName?: string; email: string }) {
  // Dynamic imports keep these server-only modules (RESEND_API_KEY check, node:crypto) out of the
  // browser bundle — processOutreachJobs is a plain export, so a static import would leak them.
  const { sendMail } = await import("@/lib/mailer");
  const { unsubscribeUrl } = await import("@/lib/unsubscribe");
  const name = firstName(p.fullName);
  await sendMail({
    to: p.email,
    subject: c.subject.replace(/\{\{name\}\}/g, name),
    html: outreachEmailHtml({
      name,
      message: c.message.replace(/\{\{name\}\}/g, name),
      assets: c.assets,
      unsubscribeUrl: unsubscribeUrl(p.uid, "marketing"),
    }),
  });
}

/** Send up to CHUNK pending emails of a job. Guarded by a short lock so UI + cron can't overlap. */
async function runChunk(db: Db, jobId: string): Promise<OutreachJobView> {
  const _id = await oid(jobId);
  const now = new Date();
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

// ─── server functions ──────────────────────────────────────────────────────
export const listOutreachCampaigns = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await ensureIndexes(db);
    const [campaigns, jobs] = await Promise.all([
      db.collection("outreachCampaigns").find({}).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("outreachJobs").find({}).sort({ startedAt: -1 }).limit(50).toArray(),
    ]);
    return { campaigns: campaigns.map(toCampaign), jobs: jobs.map(toJob) };
  });

export const saveOutreachCampaign = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaign: Omit<OutreachCampaign, "lastSentAt" | "id"> & { id?: string } }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const c = data.campaign;
    validateCampaign(c);
    const db = await getDb();
    const doc = {
      name: c.name.trim(), subject: c.subject.trim(), message: c.message.trim(),
      assets: c.assets.map((a) => ({ label: a.label.trim(), url: a.url.trim() })),
      audience: c.audience, updatedAt: new Date(),
    };
    if (c.id) {
      await db.collection("outreachCampaigns").updateOne({ _id: await oid(c.id) }, { $set: doc });
      return { id: c.id };
    }
    const r = await db.collection("outreachCampaigns").insertOne({ ...doc, createdAt: new Date(), lastSentAt: null });
    return { id: String(r.insertedId) };
  });

export const deleteOutreachCampaign = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await db.collection("outreachCampaigns").deleteOne({ _id: await oid(data.campaignId) });
    return { ok: true };
  });

/** "Who would get this if I tapped Send right now?" — shown on the confirm step. */
export const previewOutreachAudience = createServerFn({ method: "GET" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const doc = await db.collection("outreachCampaigns").findOne({ _id: await oid(data.campaignId) });
    if (!doc) throw new Error("Campaign not found.");
    const { total, pendingCount, batch } = await pendingRecipients(db, data.campaignId, doc.audience, 5);
    return { inAudience: total, willReceive: pendingCount, alreadySent: total - pendingCount, sample: batch.map((p) => ({ name: (p.fullName as string) || "—", email: p.email as string })) };
  });

export const startOutreachSend = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }): Promise<OutreachJobView> => {
    await requireAdmin(data.token);
    const db = await getDb();
    await ensureIndexes(db);
    const existing = await db.collection("outreachJobs").findOne({ campaignId: data.campaignId, status: "running" });
    if (existing) return runChunk(db, String(existing._id)); // double-tap → resume, never a second job
    const doc = await db.collection("outreachCampaigns").findOne({ _id: await oid(data.campaignId) });
    if (!doc) throw new Error("Campaign not found.");
    const { pendingCount } = await pendingRecipients(db, data.campaignId, doc.audience, 1);
    if (pendingCount === 0) throw new Error("Nobody left to email — everyone in this audience already got it.");
    const r = await db.collection("outreachJobs").insertOne({
      campaignId: data.campaignId, status: "running", total: pendingCount, sent: 0, failed: 0, startedAt: new Date(), lockedUntil: null,
    });
    return runChunk(db, String(r.insertedId));
  });

export const continueOutreachJob = createServerFn({ method: "POST" })
  .validator((data: { token: string; jobId: string }) => data)
  .handler(async ({ data }): Promise<OutreachJobView> => {
    await requireAdmin(data.token);
    return runChunk(await getDb(), data.jobId);
  });

/** One student, one tap (from the student drawer). Ignores audience rules, still honours the opt-out. */
export const sendOutreachToStudent = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; uid: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await ensureIndexes(db);
    const [cDoc, p] = await Promise.all([
      db.collection("outreachCampaigns").findOne({ _id: await oid(data.campaignId) }),
      db.collection("profiles").findOne({ uid: data.uid }, { projection: { uid: 1, fullName: 1, email: 1, emailOptOut: 1 } }),
    ]);
    if (!cDoc) throw new Error("Campaign not found.");
    if (!p?.email) throw new Error("This student has no email on file.");
    if (p.emailOptOut?.marketing) throw new Error("This student unsubscribed from Edurack emails.");
    try {
      await db.collection("outreachLog").insertOne({ campaignId: data.campaignId, uid: data.uid, email: p.email, status: "sending", createdAt: new Date() });
    } catch (e: any) {
      if (e?.code === 11000) throw new Error("This student already received this campaign.");
      throw e;
    }
    try {
      await sendOne(toCampaign(cDoc), { uid: data.uid, fullName: p.fullName as string, email: p.email as string });
      await db.collection("outreachLog").updateOne({ campaignId: data.campaignId, uid: data.uid }, { $set: { status: "sent", sentAt: new Date() } });
      return { ok: true, email: p.email as string };
    } catch (err) {
      // Free the slot so the admin can retry after fixing the cause.
      await db.collection("outreachLog").deleteOne({ campaignId: data.campaignId, uid: data.uid });
      throw err;
    }
  });