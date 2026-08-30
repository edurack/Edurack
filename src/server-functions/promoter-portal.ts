// Promoter-facing portal functions — Overview, Select Batches, Profile
// stats, payout requests, and support tickets. Entirely separate from
// mentor-portal.ts / admin.ts; the only thing read from another domain is
// mentorshipBatches + batchPromotionSettings (read-only), since a batch
// becomes promotable automatically the moment a mentor sets a promotion
// boost on it (see admin-types.ts: BatchPromotionSettings,
// DEFAULT_BATCH_PROMOTION_PERCENT).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PromotableBatchView,
  PromoterOverviewStats,
  PromoterProfileStats,
  PromoterSaleRecord,
  PromoterSupportTicketInput,
} from "@/lib/promoter-types";
import { DEFAULT_BATCH_PROMOTION_PERCENT } from "@/lib/admin-types";

// ─── Session check (duplicated from promoter-auth.ts, not imported) ───────
// Same HMAC token format promoter-auth.ts signs — this file just verifies
// it independently. Duplicated rather than imported so this stays a
// self-contained file per project convention (see admin.ts's identical
// note about requireSuperAdmin) AND, critically, so TanStack Start's
// client-bundle stripping can actually elide this node:crypto-dependent
// code from the browser build. A cross-file import of a plain (non
// createServerFn) function defeats that stripping — see promoter-auth.ts's
// comment on requirePromoter for the full explanation of why this bit
// Claude the first time around.
function getSessionSecret(): string {
  const secret = process.env.PROMOTER_SESSION_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: PROMOTER_SESSION_SECRET is not set");
  }
  return secret;
}

function verifyPromoterToken(token: string): { promoterId: string } | null {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [promoterId, expiresAtStr, signature] = parts;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${promoterId}.${expiresAtStr}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  if (Date.now() > Number(expiresAtStr)) return null;

  return { promoterId };
}

async function requirePromoter(token: string): Promise<string> {
  const verified = verifyPromoterToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.promoterId;
}

// ─── Select Batches ──────────────────────────────────────────────────────────
// A batch is promotable iff a batchPromotionSettings document exists for
// it (mentor has opted in / boosted it). Joined with this promoter's own
// coupon-request history so each card shows the right state (none /
// pending / approved + code) without a second round trip.
export const listPromotableBatches = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();

    const promotionSettings = await db.collection("batchPromotionSettings").find({}).toArray();
    if (promotionSettings.length === 0) return { batches: [] as PromotableBatchView[] };

    const batchIds = promotionSettings.map((s) => s.batchId as string);
    const { ObjectId } = await import("mongodb");
    const validObjectIds = batchIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

    const [batches, myRequests, purchaseCounts] = await Promise.all([
      db.collection("mentorshipBatches").find({ _id: { $in: validObjectIds } }).toArray(),
      db.collection("promoterCouponRequests").find({ promoterId, batchId: { $in: batchIds } }).toArray(),
      db
        .collection("purchases")
        .aggregate([
          { $match: { itemType: "mentorship", itemId: { $in: batchIds } } },
          { $group: { _id: "$itemId", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const settingsByBatchId = new Map(promotionSettings.map((s) => [s.batchId as string, s]));
    const requestByBatchId = new Map(myRequests.map((r) => [r.batchId as string, r]));
    const purchaseCountByBatchId = new Map(purchaseCounts.map((p) => [p._id as string, p.count as number]));

    const batchesView: PromotableBatchView[] = batches.map((b) => {
      const id = String(b._id);
      const settings = settingsByBatchId.get(id);
      const myRequest = requestByBatchId.get(id);

      return {
        batchId: id,
        batchName: b.name as string,
        thumbnailUrl: (b.thumbnailUrl as string | null) ?? null,
        // Student discount % isn't collected anywhere yet in
        // BatchPromotionSettings — it only tracks the promoter's earning
        // boost. Defaulting to 0 here until a studentDiscountPercent field
        // is added to that type; flag if students should see a discount
        // baked in separately.
        studentDiscountPercent: (settings?.studentDiscountPercent as number) ?? 0,
        promoterEarningPercent: (settings?.promotionPercent as number) ?? DEFAULT_BATCH_PROMOTION_PERCENT,
        studentCount: purchaseCountByBatchId.get(id) ?? 0,
        requestStatus: (myRequest?.status as PromotableBatchView["requestStatus"]) ?? "none",
        couponCode: (myRequest?.couponCode as string | null) ?? null,
      };
    });

    return { batches: batchesView };
  });

export const requestCoupon = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();

    const existing = await db
      .collection("promoterCouponRequests")
      .findOne({ promoterId, batchId: data.batchId, status: { $in: ["pending", "approved"] } });
    if (existing) throw new Error("You've already requested (or been approved for) a coupon on this batch.");

    const settings = await db.collection("batchPromotionSettings").findOne({ batchId: data.batchId });
    if (!settings) throw new Error("This batch isn't open for promotion.");

    const { ObjectId } = await import("mongodb");
    const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(data.batchId) });
    if (!batch) throw new Error("Batch not found.");

    await db.collection("promoterCouponRequests").insertOne({
      promoterId,
      batchId: data.batchId,
      batchName: batch.name as string,
      status: "pending",
      couponCode: null,
      predictedEarningPercent: (settings.promotionPercent as number) ?? DEFAULT_BATCH_PROMOTION_PERCENT,
      requestedAt: new Date(),
      reviewedAt: null,
    });

    return { ok: true };
  });

// "Opted batches" view — every batch this promoter has requested,
// regardless of status, newest first.
export const listMyCouponRequests = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();
    const rows = await db
      .collection("promoterCouponRequests")
      .find({ promoterId })
      .sort({ requestedAt: -1 })
      .toArray();

    return {
      requests: rows.map((r) => ({
        id: String(r._id),
        promoterId,
        batchId: r.batchId as string,
        batchName: r.batchName as string,
        status: r.status as "pending" | "approved" | "rejected",
        couponCode: (r.couponCode as string | null) ?? null,
        predictedEarningPercent: r.predictedEarningPercent as number,
        requestedAt: r.requestedAt instanceof Date ? r.requestedAt.toISOString() : null,
        reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
      })),
    };
  });

// ─── Overview ────────────────────────────────────────────────────────────────
// Sales are recorded in "promoterSales" whenever a student's purchase used
// a promoter's coupon code — that write happens wherever checkout/payment
// confirmation lives (payments.ts), not here; this only reads.
export const getMyOverviewStats = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();

    const [approvedRequestCount, sales] = await Promise.all([
      db.collection("promoterCouponRequests").countDocuments({ promoterId, status: "approved" }),
      db.collection("promoterSales").find({ promoterId }).sort({ purchasedAt: -1 }).toArray(),
    ]);

    const totalEarned = sales.reduce((sum, s) => sum + (s.promoterEarning as number), 0);

    const recentSales: PromoterSaleRecord[] = sales.slice(0, 10).map((s) => ({
      id: String(s._id),
      promoterId,
      studentName: s.studentName as string,
      batchId: s.batchId as string,
      batchName: s.batchName as string,
      batchPrice: s.batchPrice as number,
      studentDiscountAmount: s.studentDiscountAmount as number,
      totalPaid: s.totalPaid as number,
      promoterEarning: s.promoterEarning as number,
      purchasedAt: s.purchasedAt instanceof Date ? s.purchasedAt.toISOString() : null,
    }));

    const stats: PromoterOverviewStats = {
      totalBatchesOpted: approvedRequestCount,
      totalEarned,
      couponUsesCount: sales.length,
      recentSales,
    };

    return { stats };
  });

// ─── Profile stats (joined date, monthly breakdown) ─────────────────────────
export const getMyProfileStats = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const [promoter, approvedRequestCount, sales] = await Promise.all([
      db.collection("promoters").findOne({ _id: new ObjectId(promoterId) }),
      db.collection("promoterCouponRequests").countDocuments({ promoterId, status: "approved" }),
      db.collection("promoterSales").find({ promoterId }).toArray(),
    ]);
    if (!promoter) throw new Error("Promoter account not found.");

    const totalEarned = sales.reduce((sum, s) => sum + (s.promoterEarning as number), 0);

    const monthlyMap = new Map<string, number>();
    for (const s of sales) {
      if (!(s.purchasedAt instanceof Date)) continue;
      const month = `${s.purchasedAt.getFullYear()}-${String(s.purchasedAt.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + (s.promoterEarning as number));
    }
    const monthly = Array.from(monthlyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, amountEarned]) => ({ month, amountEarned }));

    const stats: PromoterProfileStats = {
      joinedAt: promoter.claimedAt instanceof Date ? promoter.claimedAt.toISOString() : null,
      totalBatchesOpted: approvedRequestCount,
      totalEarned,
      monthly,
    };

    return { stats };
  });

// ─── Payout ("Request Payment") ──────────────────────────────────────────────
// One-time setup: the promoter picks their recurring payment day once
// (anchored to their join-date anniversary, per the spec's "joined Jan 23
// -> next payment Feb 23" example), admin approves or rejects it. A
// promoter with an existing pending/approved request can't file another —
// they'd need admin to reject the old one first.
export const requestPromoterPayout = createServerFn({ method: "POST" })
  .validator((data: { token: string; requestedPaymentDay: number }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    if (data.requestedPaymentDay < 1 || data.requestedPaymentDay > 31) {
      throw new Error("Enter a valid day of the month.");
    }

    const db = await getDb();
    const existing = await db
      .collection("promoterPayoutRequests")
      .findOne({ promoterId, status: { $in: ["pending", "approved"] } });
    if (existing) throw new Error("You already have a payout schedule pending or approved.");

    await db.collection("promoterPayoutRequests").insertOne({
      promoterId,
      requestedPaymentDay: data.requestedPaymentDay,
      status: "pending",
      requestedAt: new Date(),
      reviewedAt: null,
    });

    return { ok: true };
  });

export const getMyPayoutStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();
    const request = await db
      .collection("promoterPayoutRequests")
      .findOne({ promoterId }, { sort: { requestedAt: -1 } });

    if (!request) return { request: null };

    return {
      request: {
        id: String(request._id),
        requestedPaymentDay: request.requestedPaymentDay as number,
        status: request.status as "pending" | "approved" | "rejected",
        requestedAt: request.requestedAt instanceof Date ? request.requestedAt.toISOString() : null,
        reviewedAt: request.reviewedAt instanceof Date ? request.reviewedAt.toISOString() : null,
      },
    };
  });

// ─── Support tickets (Help/Support) ─────────────────────────────────────────

export const submitPromoterTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticket: PromoterSupportTicketInput }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const { subject, category, description } = data.ticket;

    if (!subject.trim()) throw new Error("Enter a subject.");
    if (!description.trim()) throw new Error("Describe the issue.");

    const db = await getDb();
    const result = await db.collection("promoterSupportTickets").insertOne({
      promoterId,
      subject: subject.trim(),
      category,
      description: description.trim(),
      status: "Open",
      adminResponse: null,
      respondedAt: null,
      createdAt: new Date(),
    });

    return { ok: true, id: String(result.insertedId) };
  });

export const listMyPromoterTickets = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const db = await getDb();
    const rows = await db
      .collection("promoterSupportTickets")
      .find({ promoterId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      tickets: rows.map((r) => ({
        id: String(r._id),
        subject: r.subject as string,
        category: r.category as string,
        description: r.description as string,
        status: r.status as "Open" | "In Progress" | "Resolved",
        adminResponse: (r.adminResponse as string | null) ?? null,
        respondedAt: r.respondedAt instanceof Date ? r.respondedAt.toISOString() : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });