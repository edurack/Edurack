// Admin-side functions for the Promoters section (renders below Mentors in
// the admin dashboard). Deliberately its own file, not appended to
// admin.ts — keeps every promoter-related file independent per project
// convention, and keeps this module's admin auth check self-contained the
// same way mentor-auth.ts duplicates requireSuperAdmin rather than
// importing it from admin.ts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { randomBytes } from "node:crypto";
import type {
  AdminPromoterCouponRequestView,
  AdminPromoterPayoutRequestView,
  PromoterCouponRequestStatus,
  PromoterPayoutRequestStatus,
  PromoterTicketStatus,
} from "@/lib/promoter-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

function randomInviteCode() {
  // Human-typeable: 8 hex chars, uppercased, e.g. "PRM-9F3A2C1B" style.
  return `PRM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// ─── Invites (the "secret code" a promoter later claims at sign-up) ────────

export const createPromoterInvite = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.name.trim()) throw new Error("Enter the promoter's name.");

    const db = await getDb();
    let secretCode = randomInviteCode();

    // Vanishingly unlikely to collide, but check anyway rather than trust
    // randomness blindly for something that gates account creation.
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.collection("promoters").findOne({ secretCode });
      if (!existing) break;
      secretCode = randomInviteCode();
    }

    const result = await db.collection("promoters").insertOne({
      name: data.name.trim(),
      secretCode,
      status: "invited",
      username: null,
      passwordHash: null,
      passwordSalt: null,
      profilePictureUrl: null,
      email: "",
      socialLinks: [],
      upiIds: [],
      createdAt: new Date(),
    });

    return { ok: true, id: String(result.insertedId), secretCode };
  });

export const listPromoters = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("promoters").find({}).sort({ createdAt: -1 }).toArray();

    return {
      // passwordHash/passwordSalt excluded, same as listMentors.
      promoters: rows.map((r) => ({
        id: String(r._id),
        name: r.name as string,
        username: (r.username as string | null) ?? null,
        secretCode: r.secretCode as string,
        status: r.status as "invited" | "active" | "suspended",
        profilePictureUrl: (r.profilePictureUrl as string | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const suspendPromoter = createServerFn({ method: "POST" })
  .validator((data: { token: string; promoterId: string; suspended: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("promoters").updateOne(
      { _id: new ObjectId(data.promoterId) },
      { $set: { status: data.suspended ? "suspended" : "active" } },
    );
    return { ok: true };
  });

// ─── Coupon requests ("Request Coupon" from Select Batches) ────────────────

export const listPromoterCouponRequests = createServerFn({ method: "GET" })
  .validator((data: { token: string; status?: PromoterCouponRequestStatus }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const filter = data.status ? { status: data.status } : {};
    const rows = await db
      .collection("promoterCouponRequests")
      .find(filter)
      .sort({ requestedAt: -1 })
      .toArray();

    const { ObjectId } = await import("mongodb");
    const promoterIds = [...new Set(rows.map((r) => r.promoterId as string))];
    const promoters = promoterIds.length
      ? await db
          .collection("promoters")
          .find({ _id: { $in: promoterIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1, username: 1 } })
          .toArray()
      : [];
    const promoterById = new Map(promoters.map((p) => [String(p._id), p]));

    const requests: AdminPromoterCouponRequestView[] = rows.map((r) => {
      const promoter = promoterById.get(r.promoterId as string);
      return {
        id: String(r._id),
        promoterId: r.promoterId as string,
        promoterName: (promoter?.name as string) ?? "Unknown promoter",
        promoterUsername: (promoter?.username as string) ?? "",
        batchId: r.batchId as string,
        batchName: r.batchName as string,
        status: r.status as PromoterCouponRequestStatus,
        couponCode: (r.couponCode as string | null) ?? null,
        predictedEarningPercent: r.predictedEarningPercent as number,
        requestedAt: r.requestedAt instanceof Date ? r.requestedAt.toISOString() : null,
        reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
      };
    });

    return { requests };
  });

// Approving requires the admin to hand over a coupon code (this is the
// code the promoter's students will actually redeem) — rejecting doesn't
// need one. Both are one function so the review UI can offer a single
// "Approve / Reject" action pair without two separate endpoints drifting
// out of sync on validation.
export const reviewPromoterCouponRequest = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; requestId: string; decision: "approved" | "rejected"; couponCode?: string }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (data.decision === "approved" && !data.couponCode?.trim()) {
      throw new Error("Enter a coupon code to approve this request.");
    }

    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("promoterCouponRequests").updateOne(
      { _id: new ObjectId(data.requestId) },
      {
        $set: {
          status: data.decision,
          couponCode: data.decision === "approved" ? data.couponCode!.trim() : null,
          reviewedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) throw new Error("Request not found.");
    return { ok: true };
  });

// ─── Payout requests (from the Profile page's "Request Payment" button) ────

export const listPromoterPayoutRequests = createServerFn({ method: "GET" })
  .validator((data: { token: string; status?: PromoterPayoutRequestStatus }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const filter = data.status ? { status: data.status } : {};
    const rows = await db
      .collection("promoterPayoutRequests")
      .find(filter)
      .sort({ requestedAt: -1 })
      .toArray();

    const { ObjectId } = await import("mongodb");
    const promoterIds = [...new Set(rows.map((r) => r.promoterId as string))];
    const promoters = promoterIds.length
      ? await db
          .collection("promoters")
          .find({ _id: { $in: promoterIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1, username: 1 } })
          .toArray()
      : [];
    const promoterById = new Map(promoters.map((p) => [String(p._id), p]));

    const requests: AdminPromoterPayoutRequestView[] = rows.map((r) => {
      const promoter = promoterById.get(r.promoterId as string);
      return {
        id: String(r._id),
        promoterId: r.promoterId as string,
        promoterName: (promoter?.name as string) ?? "Unknown promoter",
        promoterUsername: (promoter?.username as string) ?? "",
        requestedPaymentDay: r.requestedPaymentDay as number,
        status: r.status as PromoterPayoutRequestStatus,
        requestedAt: r.requestedAt instanceof Date ? r.requestedAt.toISOString() : null,
        reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
      };
    });

    return { requests };
  });

export const reviewPromoterPayoutRequest = createServerFn({ method: "POST" })
  .validator((data: { token: string; requestId: string; decision: "approved" | "rejected" }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("promoterPayoutRequests").updateOne(
      { _id: new ObjectId(data.requestId) },
      { $set: { status: data.decision, reviewedAt: new Date() } },
    );
    if (result.matchedCount === 0) throw new Error("Request not found.");
    return { ok: true };
  });

// ─── Password reset requests (from the promoter "Forgot password" flow) ────

export const listPromoterPasswordResetRequests = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("promoterPasswordResetRequests")
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      requests: rows.map((r) => ({
        id: String(r._id),
        promoterId: String(r.promoterId),
        username: r.username as string,
        contactNote: (r.contactNote as string) ?? "",
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// Actually resets the password (admin picks a new one and hands it to the
// promoter directly, same manual handoff pattern as generated mentor
// credentials) and marks the request handled in one step.
export const resolvePromoterPasswordReset = createServerFn({ method: "POST" })
  .validator((data: { token: string; requestId: string; newPassword: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (data.newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

    const { ObjectId } = await import("mongodb");
    const { scryptSync, randomBytes: randBytes } = await import("node:crypto");
    const db = await getDb();

    const request = await db.collection("promoterPasswordResetRequests").findOne({ _id: new ObjectId(data.requestId) });
    if (!request) throw new Error("Request not found.");

    const salt = randBytes(16).toString("hex");
    const hash = scryptSync(data.newPassword, salt, 64).toString("hex");

    await db.collection("promoters").updateOne(
      { _id: new ObjectId(String(request.promoterId)) },
      { $set: { passwordHash: hash, passwordSalt: salt } },
    );
    await db.collection("promoterPasswordResetRequests").updateOne(
      { _id: new ObjectId(data.requestId) },
      { $set: { status: "resolved", resolvedAt: new Date() } },
    );

    return { ok: true };
  });

// ─── Support tickets (Help/Support page) ────────────────────────────────────

export const listAllPromoterTicketsAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const rows = await db
      .collection("promoterSupportTickets")
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const { ObjectId } = await import("mongodb");
    const promoterIds = [...new Set(rows.map((r) => r.promoterId as string))];
    const promoters = promoterIds.length
      ? await db
          .collection("promoters")
          .find({ _id: { $in: promoterIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
          .toArray()
      : [];
    const nameByPromoterId = new Map(promoters.map((p) => [String(p._id), p.name as string]));

    return {
      tickets: rows.map((r) => ({
        id: String(r._id),
        promoterId: r.promoterId as string,
        promoterName: nameByPromoterId.get(r.promoterId as string) ?? "Unknown promoter",
        subject: r.subject as string,
        category: r.category as string,
        description: r.description as string,
        status: r.status as PromoterTicketStatus,
        adminResponse: (r.adminResponse as string | null) ?? null,
        respondedAt: r.respondedAt instanceof Date ? r.respondedAt.toISOString() : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const respondToPromoterTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; adminResponse: string; status: PromoterTicketStatus }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("promoterSupportTickets").updateOne(
      { _id: new ObjectId(data.ticketId) },
      {
        $set: {
          adminResponse: data.adminResponse.trim() || null,
          status: data.status,
          respondedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) throw new Error("Ticket not found.");
    return { ok: true };
  });