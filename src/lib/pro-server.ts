// SERVER-ONLY. Plans, grants and the daily drill count behind Edurack Pro.
//
//   proPlans   — what's for sale: { name, price (₹), durationDays, active, blurb? }. Added by the team in the
//                database; nothing is limited until at least one active plan exists.
//   proGrants  — one row per successful payment: { uid, planId, razorpayPaymentId (unique), startsAt, endsAt }.
//                Buying while Pro is active stacks: the new period starts when the current one ends.
//                Pro is active while any grant has endsAt in the future.
import type { Db } from "@/lib/pyq-server";
import { FREE_DRILLS_PER_DAY, istDayRange, type DrillAccess, type ProPlanPublic } from "@/lib/pro";

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
    .map((d) => ({ id: String(d._id), name: String(d.name ?? "Edurack Pro"), price: d.price as number, durationDays: d.durationDays as number, blurb: String(d.blurb ?? "") }))
    .sort((a, b) => a.price - b.price);
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

export async function getDrillAccess(db: Db, uid: string, now = new Date()): Promise<DrillAccess> {
  const plans = await listActivePlans(db);
  const until = await proUntil(db, uid, now);
  return {
    gatingOn: plans.length > 0,
    isPro: until !== null,
    proUntil: until ? until.toISOString() : null,
    usedToday: await countDrillsToday(db, uid, now),
    freeLimit: FREE_DRILLS_PER_DAY,
    plans,
  };
}

/** Records a paid Pro period, once per payment. Returns the date Pro now runs until. */
export async function grantProPlan(
  db: Db,
  p: { uid: string; planId: string; planName: string; durationDays: number; orderId: string; paymentId: string; amount: number },
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
