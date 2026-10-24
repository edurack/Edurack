// SERVER-ONLY. Plans, grants and the daily drill count behind Edurack Pro.
//
//   proPlans   — what's for sale: { name, price (₹), durationDays, active, blurb?, features? }. Managed from the
//                admin "Edurack Pro" tab; nothing is limited until at least one active plan exists. A plan with
//                no `features` list includes every feature.
//   proSettings — one row { key: "main", freeDrillsPerDay, proOnly: { [feature]: boolean } }: the free-plan rules.
//   proGrants  — one row per successful payment (or admin gift): { uid, planId, features, razorpayPaymentId (unique), startsAt, endsAt }.
//                Buying while Pro is active stacks: the new period starts when the current one ends.
//                Pro is active while any grant has endsAt in the future.
import type { Db } from "@/lib/pyq-server";
import { PRO_FEATURE_KEYS, cleanPlanFeatures, cleanProSettings, istDayRange, type DrillAccess, type ProFeatureKey, type ProPlanPublic, type ProSettings } from "@/lib/pro";

const DAY_MS = 86_400_000;
let indexed = false;

export async function ensureProIndexes(db: Db) {
  if (indexed) return;
  indexed = true;
  try {
    await db.collection("proGrants").createIndex({ razorpayPaymentId: 1 }, { unique: true });
    await db.collection("proGrants").createIndex({ uid: 1, endsAt: -1 });
  } catch (err) {
    console.error("[pro] couldn't create indexes:", err);
  }
}

const validPlan = (p: Record<string, unknown>) =>
  typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 1 && Number.isInteger(p.durationDays) && Number(p.durationDays) >= 1;

/** Plans that can be bought right now, cheapest first. A plan with a bad price or duration is skipped, never half-sold. */
export async function listActivePlans(db: Db): Promise<ProPlanPublic[]> {
  const docs = await db.collection("proPlans").find({ active: true }).toArray();
  return docs
    .filter(validPlan)
    .map((d) => ({ id: String(d._id), name: String(d.name ?? "Edurack Pro"), price: d.price as number, durationDays: d.durationDays as number, blurb: String(d.blurb ?? ""), features: cleanPlanFeatures(d.features) }))
    .sort((a, b) => a.price - b.price);
}

/** The free-plan rules the admin set (defaults until they save any). */
export async function getProSettings(db: Db): Promise<ProSettings> {
  const doc = await db.collection("proSettings").findOne({ key: "main" });
  return cleanProSettings(doc);
}

/** When this student's Pro ends and which features it includes right now. A period stacked for later adds its features once it starts. */
export async function proEntitlements(db: Db, uid: string, now = new Date()): Promise<{ until: Date | null; features: ProFeatureKey[] }> {
  const grants = await db.collection("proGrants").find({ uid, endsAt: { $gt: now } }).toArray();
  if (grants.length === 0) return { until: null, features: [] };
  const until = new Date(Math.max(...grants.map((g) => (g.endsAt as Date).getTime())));
  const have = new Set<ProFeatureKey>();
  for (const g of grants) {
    if ((g.startsAt as Date).getTime() > now.getTime()) continue;
    cleanPlanFeatures(g.features).forEach((k) => have.add(k));
  }
  return { until, features: PRO_FEATURE_KEYS.filter((k) => have.has(k)) };
}

/** When this student's Pro ends, or null if they aren't Pro right now. */
export async function proUntil(db: Db, uid: string, now = new Date()): Promise<Date | null> {
  const g = await db.collection("proGrants").find({ uid, endsAt: { $gt: now } }).sort({ endsAt: -1 }).limit(1).next();
  return g ? (g.endsAt as Date) : null;
}

/** Drills started today (India time), finished or not. Resuming a running drill doesn't start a new one. */
export async function countDrillsToday(db: Db, uid: string, now = new Date()): Promise<number> {
  const { start, end } = istDayRange(now);
  return db.collection("pyqDrills").countDocuments({ uid, startedAt: { $gte: start, $lt: end } });
}

/** The student's unfinished Quick Mock whose clock hasn't run out, if any (same rule startPyqDrill uses to resume). */
async function runningDrill(db: Db, uid: string, now: Date): Promise<DrillAccess["running"]> {
  const d = await db.collection("pyqDrills").find({ uid, submittedAt: null }).sort({ startedAt: -1 }).limit(1).next();
  if (!d) return null;
  const remainingSec = Math.max(0, Math.round(((d.startedAt as Date).getTime() + (d.durationSec as number) * 1000 - now.getTime()) / 1000));
  return remainingSec > 0 ? { drillId: String(d._id), remainingSec } : null;
}

export async function getDrillAccess(db: Db, uid: string, now = new Date()): Promise<DrillAccess> {
  const [plans, settings, ent, running] = await Promise.all([listActivePlans(db), getProSettings(db), proEntitlements(db, uid, now), runningDrill(db, uid, now).catch(() => null)]);
  return {
    running,
    gatingOn: plans.length > 0,
    isPro: ent.until !== null,
    proUntil: ent.until ? ent.until.toISOString() : null,
    usedToday: await countDrillsToday(db, uid, now),
    freeLimit: settings.freeDrillsPerDay,
    plans,
    features: ent.features,
    proOnly: settings.proOnly,
  };
}

/** Records a paid Pro period, once per payment. Returns the date Pro now runs until. */
export async function grantProPlan(
  db: Db,
  p: { uid: string; planId: string; planName: string; durationDays: number; orderId: string; paymentId: string; amount: number; features?: ProFeatureKey[]; extra?: Record<string, unknown> },
  now = new Date(),
): Promise<{ granted: boolean; until: Date }> {
  await ensureProIndexes(db);
  const col = db.collection("proGrants");
  const already = await col.findOne({ razorpayPaymentId: p.paymentId });
  if (already) return { granted: false, until: already.endsAt as Date };

  const current = await proUntil(db, p.uid, now);
  const startsAt = current ?? now;
  const endsAt = new Date(startsAt.getTime() + p.durationDays * DAY_MS);
  try {
    await col.insertOne({
      uid: p.uid,
      planId: p.planId,
      planName: p.planName,
      features: p.features?.length ? p.features : PRO_FEATURE_KEYS,
      ...(p.extra ?? {}),
      durationDays: p.durationDays,
      amount: p.amount,
      razorpayOrderId: p.orderId,
      razorpayPaymentId: p.paymentId,
      startsAt,
      endsAt,
      createdAt: now,
    });
  } catch (err) {
    // A second request for the same payment got there first (the unique index): that one counts.
    if ((err as { code?: number }).code === 11000) {
      const winner = await col.findOne({ razorpayPaymentId: p.paymentId });
      if (winner) return { granted: false, until: winner.endsAt as Date };
    }
    throw err;
  }
  return { granted: true, until: endsAt };
}
