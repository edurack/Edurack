// src/server-functions/pro-admin.ts
//
// Admin-side functions for the "Edurack Pro" tab: the plans on sale, the free-plan rules, which features
// are Pro-only, and gifting Pro to a student. Its own file with its own private admin check — same
// convention as blog-admin.ts (requireAdmin must never be imported across server-functions files).
// What students actually get is decided in lib/pro.ts (rules) and lib/pro-server.ts (storage).
import { createServerFn } from "@tanstack/react-start";
import { logAdminAction } from "@/lib/team-core";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { PRO_FEATURE_KEYS, cleanPlanFeatures, cleanProSettings, type ProFeatureKey, type ProSettings } from "@/lib/pro";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

export type ProAdminPlan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  blurb: string;
  features: ProFeatureKey[];
  active: boolean;
  /** False when the price or length can't be sold (the student site skips such plans). */
  valid: boolean;
  sold: number;
  revenue: number;
};

export type ProAdminGrant = {
  id: string;
  uid: string;
  email: string | null;
  planName: string;
  amount: number;
  source: "paid" | "gift";
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type ProAdminOverview = {
  settings: ProSettings;
  plans: ProAdminPlan[];
  stats: { activeStudents: number; totalSales: number; revenue: number };
  recent: ProAdminGrant[];
};

export type ProPlanInput = { name: string; price: number; durationDays: number; blurb: string; features: ProFeatureKey[]; active: boolean };

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : new Date(String(d ?? "")).toISOString());

function cleanPlanInput(raw: ProPlanInput) {
  const name = String(raw?.name ?? "").trim().slice(0, 60);
  if (!name) throw new Error("Give the plan a name.");
  const price = Number(raw.price);
  if (!Number.isInteger(price) || price < 1 || price > 100000) throw new Error("Price must be a whole number of rupees between 1 and 1,00,000.");
  const durationDays = Number(raw.durationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) throw new Error("Length must be a whole number of days between 1 and 3650.");
  const features = cleanPlanFeatures(Array.isArray(raw.features) ? raw.features : []);
  if (features.length === 0) throw new Error("Pick at least one feature for this plan.");
  return { name, price, durationDays, blurb: String(raw.blurb ?? "").trim().slice(0, 160), features, active: raw.active === true };
}

export const getProAdmin = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<ProAdminOverview> => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { getProSettings } = await import("@/lib/pro-server");
    const now = new Date();
    const grants = db.collection("proGrants");
    const [settings, planDocs, byPlan, activeUids, totals, recentDocs] = await Promise.all([
      getProSettings(db),
      db.collection("proPlans").find({}).toArray(),
      grants.aggregate([{ $group: { _id: "$planId", n: { $sum: 1 }, revenue: { $sum: "$amount" } } }]).toArray(),
      grants.distinct("uid", { startsAt: { $lte: now }, endsAt: { $gt: now } }),
      grants.aggregate([{ $group: { _id: null, n: { $sum: 1 }, revenue: { $sum: "$amount" } } }]).toArray(),
      grants.find({}).sort({ createdAt: -1 }).limit(15).toArray(),
    ]);
    const sales = new Map(byPlan.map((r) => [String(r._id), { n: Number(r.n) || 0, revenue: Number(r.revenue) || 0 }]));

    const plans: ProAdminPlan[] = planDocs
      .map((d) => {
        const price = Number(d.price);
        const durationDays = Number(d.durationDays);
        const s = sales.get(String(d._id));
        return {
          id: String(d._id),
          name: String(d.name ?? "Edurack Pro"),
          price: Number.isFinite(price) ? price : 0,
          durationDays: Number.isFinite(durationDays) ? durationDays : 0,
          blurb: String(d.blurb ?? ""),
          features: cleanPlanFeatures(d.features),
          active: d.active === true,
          valid: Number.isFinite(price) && price >= 1 && Number.isInteger(durationDays) && durationDays >= 1,
          sold: s?.n ?? 0,
          revenue: s?.revenue ?? 0,
        };
      })
      .sort((a, b) => a.price - b.price);

    return {
      settings,
      plans,
      stats: { activeStudents: activeUids.length, totalSales: Number(totals[0]?.n) || 0, revenue: Number(totals[0]?.revenue) || 0 },
      recent: recentDocs.map((g) => ({
        id: String(g._id),
        uid: String(g.uid ?? ""),
        email: typeof g.email === "string" ? g.email : null,
        planName: String(g.planName ?? "Edurack Pro"),
        amount: Number(g.amount) || 0,
        source: g.source === "gift" ? ("gift" as const) : ("paid" as const),
        startsAt: iso(g.startsAt),
        endsAt: iso(g.endsAt),
        createdAt: iso(g.createdAt ?? g.startsAt),
      })),
    };
  });

export const saveProSettings = createServerFn({ method: "POST" })
  .validator((data: { token: string; settings: ProSettings }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, "saveProSettings", data.settings, "Edurack Pro");
    const settings = cleanProSettings(data.settings);
    const db = await getDb();
    await db.collection("proSettings").updateOne({ key: "main" }, { $set: { ...settings, key: "main", updatedAt: new Date() } }, { upsert: true });
    return { settings };
  });

export const saveProPlan = createServerFn({ method: "POST" })
  .validator((data: { token: string; id?: string; plan: ProPlanInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, data.id ? "updateProPlan" : "createProPlan", data.plan, "Edurack Pro");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const plan = cleanPlanInput(data.plan);
    const now = new Date();
    if (data.id) {
      if (!ObjectId.isValid(data.id)) throw new Error("That plan doesn't exist any more.");
      const res = await db.collection("proPlans").updateOne({ _id: new ObjectId(data.id) }, { $set: { ...plan, updatedAt: now } });
      if (res.matchedCount === 0) throw new Error("That plan doesn't exist any more.");
      return { id: data.id };
    }
    const res = await db.collection("proPlans").insertOne({ ...plan, createdAt: now, updatedAt: now });
    return { id: String(res.insertedId) };
  });

export const deleteProPlan = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, "deleteProPlan", { id: data.id }, "Edurack Pro");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    if (!ObjectId.isValid(data.id)) throw new Error("That plan doesn't exist any more.");
    // A plan students have bought stays in the books: switch it off instead of deleting it.
    const bought = await db.collection("proGrants").countDocuments({ planId: data.id });
    if (bought > 0) throw new Error("Students have bought this plan, so it can't be deleted. Switch it off instead.");
    await db.collection("proPlans").deleteOne({ _id: new ObjectId(data.id) });
    return { ok: true };
  });

/** Gives a student a Pro period without a payment: a copy of an existing plan, or a custom length with every feature. Stacks like a purchase. */
export const giftPro = createServerFn({ method: "POST" })
  .validator((data: { token: string; email: string; planId?: string; durationDays: number }) => data)
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.token);
    await logAdminAction(data.token, "giftPro", { email: data.email, planId: data.planId, durationDays: data.durationDays }, "Edurack Pro");
    const email = String(data.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("Enter the student's email.");
    const days = Number(data.durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("Length must be a whole number of days between 1 and 3650.");
    let student;
    try {
      student = await adminAuth.getUserByEmail(email);
    } catch {
      throw new Error("No student account uses that email.");
    }

    const db = await getDb();
    let planName = "Gifted Pro";
    let features: ProFeatureKey[] = [...PRO_FEATURE_KEYS];
    if (data.planId) {
      const { ObjectId } = await import("mongodb");
      if (!ObjectId.isValid(data.planId)) throw new Error("That plan doesn't exist any more.");
      const plan = await db.collection("proPlans").findOne({ _id: new ObjectId(data.planId) });
      if (!plan) throw new Error("That plan doesn't exist any more.");
      planName = `${String(plan.name ?? "Edurack Pro")} (gift)`;
      features = cleanPlanFeatures(plan.features);
    }
    const { grantProPlan } = await import("@/lib/pro-server");
    const { until } = await grantProPlan(db, {
      uid: student.uid,
      planId: data.planId ?? "gift",
      planName,
      durationDays: days,
      orderId: "gift",
      paymentId: `gift_${student.uid}_${Date.now()}`,
      amount: 0,
      features,
      extra: { source: "gift", email, grantedBy: admin.uid },
    });
    return { until: until.toISOString() };
  });

// ─── "NCERT Line by Line is free for Pro" announcement ─────────────────────
// Emails every student whose Pro is active right now, once each (a unique log row per student and announcement),
// so pressing the button again only reaches students who haven't had it yet. Students who unsubscribed or whose
// address bounced are skipped. Each press sends at most PRO_ANNOUNCE_BATCH emails to stay inside the request time limit.
const NCERT_FREE_KEY = "ncert-line-by-line-free";
const PRO_ANNOUNCE_BATCH = 60;

export type ProAnnounceResult = { activePro: number; alreadySent: number; skipped: number; toSend: number; sent: number; failed: number; remaining: number; dryRun: boolean };

export const sendProNcertAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; dryRun?: boolean }) => data)
  .handler(async ({ data }): Promise<ProAnnounceResult> => {
    await requireAdmin(data.token);
    const dryRun = data.dryRun === true;
    await logAdminAction(data.token, "sendProNcertAnnouncement", { dryRun }, "Edurack Pro");
    const db = await getDb();
    const now = new Date();
    const log = db.collection("proAnnouncementLog");
    try {
      await log.createIndex({ key: 1, uid: 1 }, { unique: true });
    } catch {
      /* best-effort: the unique index is what makes a double click harmless, but sending still works without it */
    }

    const uids = ((await db.collection("proGrants").distinct("uid", { startsAt: { $lte: now }, endsAt: { $gt: now } })) as unknown[]).filter((u): u is string => typeof u === "string");
    const done = new Set((await log.find({ key: NCERT_FREE_KEY, uid: { $in: uids }, status: "sent" }, { projection: { uid: 1 } }).toArray()).map((r) => String(r.uid)));
    const pending = uids.filter((u) => !done.has(u));

    const profiles = pending.length
      ? await db.collection("profiles").find({ uid: { $in: pending }, email: { $type: "string", $ne: "" } }, { projection: { uid: 1, fullName: 1, email: 1, emailOptOut: 1 } }).toArray()
      : [];
    const { suppressedSet } = await import("@/lib/email-guard");
    const blocked = await suppressedSet(db, profiles.map((p) => String(p.email)));
    const sendable = profiles.filter((p) => !p.emailOptOut?.marketing && !blocked.has(String(p.email).trim().toLowerCase()));
    const result: ProAnnounceResult = { activePro: uids.length, alreadySent: done.size, skipped: pending.length - sendable.length, toSend: sendable.length, sent: 0, failed: 0, remaining: sendable.length, dryRun };
    if (dryRun || sendable.length === 0) return result;

    const { sendMail } = await import("@/lib/mailer");
    const { SITE_URL, firstName, proNcertFreeEmailHtml, proNcertFreeSubject } = await import("@/lib/growth-emails");
    const { unsubscribeUrl } = await import("@/lib/unsubscribe");
    for (const p of sendable.slice(0, PRO_ANNOUNCE_BATCH)) {
      const uid = String(p.uid);
      // Claim this student first: a duplicate-key error means another press already sent (or is sending) theirs.
      try {
        await log.insertOne({ key: NCERT_FREE_KEY, uid, status: "sending", createdAt: new Date() });
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          const row = await log.findOne({ key: NCERT_FREE_KEY, uid });
          const stale = row?.status === "sending" && Date.now() - new Date(row.createdAt as Date).getTime() > 10 * 60_000; // a press that died mid-send
          if (row?.status !== "failed" && !stale) continue; // already sent, or being sent by another press
          await log.updateOne({ key: NCERT_FREE_KEY, uid }, { $set: { status: "sending", retriedAt: new Date() } });
        } else {
          throw err;
        }
      }
      const name = firstName(p.fullName as string);
      try {
        await sendMail({
          to: String(p.email),
          subject: proNcertFreeSubject({ name }),
          html: proNcertFreeEmailHtml({ name, drillUrl: `${SITE_URL}/pyq-drill?src=email&build=true`, unsubscribeUrl: unsubscribeUrl(uid, "marketing") }),
        });
        await log.updateOne({ key: NCERT_FREE_KEY, uid }, { $set: { status: "sent", sentAt: new Date() } });
        result.sent++;
      } catch (err) {
        console.error(`[pro-announce] send failed uid=${uid}:`, err);
        await log.updateOne({ key: NCERT_FREE_KEY, uid }, { $set: { status: "failed", error: String(err) } });
        result.failed++;
      }
      await new Promise((r) => setTimeout(r, 550)); // Resend default limit ≈ 2 requests a second
    }
    result.remaining = Math.max(0, sendable.length - result.sent);
    return result;
  });
