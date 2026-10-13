// Admin-only: one-tap outreach (server functions). All heavy logic lives in lib/outreach-core.ts.
//
// Sending is chunked and resumable so it never hits a serverless timeout:
//   tap → startOutreachSend creates a job and sends the first chunk
//       → the UI keeps calling continueOutreachJob while status === "running"
//       → /cron/outreach (processOutreachJobs) also finishes any job left running.
// Each (campaign, student) pair can be emailed once — unique index on outreachLog — so
// double taps, retries and overlapping cron ticks never double-send.
import { createServerFn } from "@tanstack/react-start";
import { logAdminAction } from "@/lib/team-core";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import {
  countAudience, ensureIndexes, oid, pendingRecipients, previewDraft, runChunk, sendOne, sentCounts, toCampaign, toJob, validateCampaign,
} from "@/lib/outreach-core";
import type { OutreachAudience, OutreachCampaign, OutreachJobView } from "@/lib/outreach-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

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
    return { campaigns: campaigns.map(toCampaign), jobs: jobs.map(toJob), sentByCampaign: await sentCounts(db) };
  });

export const saveOutreachCampaign = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaign: Omit<OutreachCampaign, "lastSentAt" | "id"> & { id?: string } }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, "saveOutreachCampaign", data, "Outreach");
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
    await logAdminAction(data.token, "deleteOutreachCampaign", data, "Outreach");
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
    await logAdminAction(data.token, "startOutreachSend", data, "Outreach");
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
    await logAdminAction(data.token, "sendOutreachToStudent", data, "Outreach");
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


/** Rendered email (exact HTML that students get) for the live preview in the composer. */
export const renderOutreachPreview = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaign: Pick<OutreachCampaign, "subject" | "message" | "assets"> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return previewDraft(data.campaign);
  });

/** "How many students match this audience?" — live badge while editing, nothing saved. */
export const countOutreachAudience = createServerFn({ method: "POST" })
  .validator((data: { token: string; audience: OutreachAudience }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return countAudience(await getDb(), data.audience);
  });

/** Sends the draft to the admin's own email so they see it in a real inbox. Not logged, not counted. */
export const sendOutreachTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaign: Pick<OutreachCampaign, "name" | "subject" | "message" | "assets"> }) => data)
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.token);
    if (!admin.email) throw new Error("Your admin account has no email address.");
    validateCampaign(data.campaign);
    await sendOne(
      { id: "test", lastSentAt: null, audience: { exam: "any", track: "any", nonBuyersOnly: false }, ...data.campaign },
      { uid: admin.uid, fullName: (admin.name as string | undefined) ?? "", email: admin.email },
      { subjectPrefix: "[TEST] " },
    );
    return { email: admin.email };
  });
