// Two mentor-portal features that share no logic but were asked for
// together on the Overview page: (1) the per-batch promotion boost a
// mentor can raise when promoters aren't picking up their batch, and (2)
// the earnings/commission breakdown of what they've actually sold.
//
// Session verification duplicated from mentor-portal.ts rather than
// imported, matching this codebase's existing convention (see that file's
// own comment on why) — the only shared contract is the token format.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_BATCH_PROMOTION_PERCENT,
  MAX_BATCH_PROMOTION_PERCENT,
  PLATFORM_COMMISSION_PERCENT,
  type BatchPromotionSettings,
  type MentorEarningsOverview,
  type MonthlyEarningsPoint,
  type StudentPurchaseRecord,
  type TestSeriesAccessStatus,
} from "@/lib/admin-types";

function getSessionSecret(): string {
  const secret = process.env.MENTOR_SESSION_SECRET;
  if (!secret) throw new Error("Server misconfigured: MENTOR_SESSION_SECRET is not set");
  return secret;
}

function verifyMentorToken(token: string): { mentorId: string } | null {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [mentorId, expiresAtStr, signature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(`${mentorId}.${expiresAtStr}`).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  if (Date.now() > Number(expiresAtStr)) return null;
  return { mentorId };
}

async function requireMentor(token: string): Promise<string> {
  const verified = verifyMentorToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.mentorId;
}

async function requireOwnsBatch(mentorId: string, batchId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(batchId) });
  if (!batch) throw new Error("Batch not found.");
  if (batch.assignedMentorId !== mentorId) throw new Error("You are not the assigned mentor for this batch.");
  return batch;
}

// ─── Batch Promotion Boost ──────────────────────────────────────────────────
export const getBatchPromotionSettings = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const row = await db.collection("batchPromotionSettings").findOne({ batchId: data.batchId });

    const settings: BatchPromotionSettings = {
      batchId: data.batchId,
      mentorId,
      promotionPercent: (row?.promotionPercent as number) ?? DEFAULT_BATCH_PROMOTION_PERCENT,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
    return { settings };
  });

export const setBatchPromotionPercent = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; promotionPercent: number }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    if (data.promotionPercent < DEFAULT_BATCH_PROMOTION_PERCENT) {
      throw new Error(`The promotion percentage can't go below the platform default of ${DEFAULT_BATCH_PROMOTION_PERCENT}%.`);
    }
    if (data.promotionPercent > MAX_BATCH_PROMOTION_PERCENT) {
      throw new Error(`The promotion percentage can't exceed ${MAX_BATCH_PROMOTION_PERCENT}%.`);
    }

    const db = await getDb();
    await db.collection("batchPromotionSettings").updateOne(
      { batchId: data.batchId },
      { $set: { batchId: data.batchId, mentorId, promotionPercent: data.promotionPercent, updatedAt: new Date() } },
      { upsert: true },
    );
    return { ok: true };
  });

// ─── Earnings Overview ──────────────────────────────────────────────────────
// Platform commission is a flat, non-negotiable 15% on every mentorship
// batch sale — separate from (and unaffected by) the promoter-facing boost
// percentage above, which comes out of the mentor's own share, not the
// platform's cut. Net earned = amount - (amount * 15%).
export const getMentorEarningsOverview = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const batches = await db.collection("mentorshipBatches").find({ assignedMentorId: mentorId }).toArray();
    if (batches.length === 0) {
      const empty: MentorEarningsOverview = { totalNetEarned: 0, totalGross: 0, monthly: [], purchases: [] };
      return { overview: empty };
    }

    const batchIds = batches.map((b) => String(b._id));
    const batchNameById = new Map(batches.map((b) => [String(b._id), b.name as string]));

    const purchaseRows = await db
      .collection("purchases")
      .find({ itemType: "mentorship", itemId: { $in: batchIds } })
      .sort({ purchasedAt: -1 })
      .toArray();

    const studentUids = [...new Set(purchaseRows.map((p) => p.uid as string))];
    const profiles =
      studentUids.length > 0
        ? await db
            .collection("profiles")
            .find({ uid: { $in: studentUids } }, { projection: { uid: 1, fullName: 1 } })
            .toArray()
        : [];
    const nameByUid = new Map(profiles.map((p) => [p.uid as string, (p.fullName as string) || "Student"]));

    const purchases: StudentPurchaseRecord[] = purchaseRows.map((p) => {
      const amount = p.amount as number;
      const platformCommission = Math.round(amount * (PLATFORM_COMMISSION_PERCENT / 100));
      return {
        studentUid: p.uid as string,
        studentName: nameByUid.get(p.uid as string) ?? "Student",
        batchId: p.itemId as string,
        batchName: batchNameById.get(p.itemId as string) ?? "Batch",
        amount,
        platformCommission,
        netEarned: amount - platformCommission,
        purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
      };
    });

    const monthlyMap = new Map<string, MonthlyEarningsPoint>();
    for (const p of purchases) {
      if (!p.purchasedAt) continue;
      const month = p.purchasedAt.slice(0, 7); // "YYYY-MM"
      const entry = monthlyMap.get(month) ?? { month, grossAmount: 0, platformCommission: 0, netEarned: 0, purchaseCount: 0 };
      entry.grossAmount += p.amount;
      entry.platformCommission += p.platformCommission;
      entry.netEarned += p.netEarned;
      entry.purchaseCount += 1;
      monthlyMap.set(month, entry);
    }
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    const overview: MentorEarningsOverview = {
      totalNetEarned: purchases.reduce((sum, p) => sum + p.netEarned, 0),
      totalGross: purchases.reduce((sum, p) => sum + p.amount, 0),
      monthly,
      purchases,
    };

    return { overview };
  });

// ─── Test Series Access Status / Request ────────────────────────────────────
// "Already allowed" comes from the mentor's own onboarding submission
// (wantsToSellTestSeries, see mentor-onboarding.ts). If that was never
// set true, a mentor can file a request here instead — admin grants it by
// flipping testSeriesAdminGranted on this same document, which is outside
// the scope of this file (an admin-side action, same pattern as
// markMentorProfileCreated in mentor-onboarding.ts).
export const getTestSeriesAccessStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();

    // mentorOnboardingDetails is keyed by applicationId, not mentorId — a
    // real link from mentor -> their original application isn't modeled
    // anywhere in what's been shared, so this reads via
    // mentorOnboardingDetails.mentorProfileId (set by
    // markMentorProfileCreated once admin creates the login) if present,
    // falling back to a mentor-scoped request record for everything else.
    const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId });
    const request = await db.collection("testSeriesAccessRequests").findOne({ mentorId });

    let status: TestSeriesAccessStatus;
    if (onboarding?.wantsToSellTestSeries) {
      status = { hasAccess: true, source: "onboarding", requested: false, requestedAt: null };
    } else if (request?.adminGranted) {
      status = { hasAccess: true, source: "admin_granted", requested: true, requestedAt: request.requestedAt instanceof Date ? request.requestedAt.toISOString() : null };
    } else {
      status = {
        hasAccess: false,
        source: "none",
        requested: Boolean(request),
        requestedAt: request?.requestedAt instanceof Date ? request.requestedAt.toISOString() : null,
      };
    }
    return { status };
  });

export const requestTestSeriesAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();

    const existing = await db.collection("testSeriesAccessRequests").findOne({ mentorId });
    if (existing) return { ok: true, alreadyRequested: true };

    await db.collection("testSeriesAccessRequests").insertOne({
      mentorId,
      adminGranted: false,
      requestedAt: new Date(),
    });
    return { ok: true, alreadyRequested: false };
  });