// Server functions for the student's own account-wide views: real purchase
// history (Transaction History + My Purchases page), per-batch performance
// aggregation (Profile page), and platform-level support tickets (Help page,
// as opposed to the per-batch tickets in batch-hub.ts).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { loadMyBatchPerformance, loadMyPurchases } from "@/lib/dashboard-core";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

// ─── Purchase history (used by both Profile's Transaction History section
// and the dedicated "My Purchases" page) ────────────────────────────────────
export const getMyPurchases = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    return loadMyPurchases(db, decoded.uid);
  });
// ─── Per-batch performance summary (Profile page) ──────────────────────────
export const getMyBatchPerformance = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    return loadMyBatchPerformance(db, decoded.uid);
  });

// ─── Platform-level Help tickets (general queries, not tied to a batch) ────
export const submitPlatformTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; subject: string; message: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const profile = await db.collection("profiles").findOne({ uid: decoded.uid });

    await db.collection("supportTickets").insertOne({
      uid: decoded.uid,
      itemType: "platform",
      itemId: null,
      subject: data.subject,
      message: data.message,
      status: "open",
      studentName: (profile?.fullName as string) || decoded.name || "Student",
      studentEmail: decoded.email ?? null,
      studentMobile: (profile?.mobile as string) ?? null,
      adminReply: null,
      repliedAt: null,
      rating: null,
      ratedAt: null,
      createdAt: new Date(),
    });
    return { ok: true };
  });

export const listMyAllTickets = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const rows = await db.collection("supportTickets").find({ uid: decoded.uid }).sort({ createdAt: -1 }).toArray();

    const bundleIds = rows.filter((t) => t.itemType === "bundle" && t.itemId).map((t) => new ObjectId(t.itemId as string));
    const mentorshipIds = rows
      .filter((t) => t.itemType === "mentorship" && t.itemId)
      .map((t) => new ObjectId(t.itemId as string));

    const [bundles, mentorshipBatches] = await Promise.all([
      bundleIds.length ? db.collection("bundles").find({ _id: { $in: bundleIds } }).toArray() : [],
      mentorshipIds.length
        ? db.collection("mentorshipBatches").find({ _id: { $in: mentorshipIds } }).toArray()
        : [],
    ]);
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
    const mentorshipTitleById = new Map(mentorshipBatches.map((b) => [String(b._id), b.name as string]));

    return {
      tickets: rows.map((t) => {
        const source =
          t.itemType === "bundle"
            ? { type: "bundle" as const, itemTitle: bundleTitleById.get(t.itemId as string) ?? "Test series" }
            : t.itemType === "mentorship"
              ? { type: "mentorship" as const, itemTitle: mentorshipTitleById.get(t.itemId as string) ?? "Mentorship batch" }
              : { type: "platform" as const };

        return {
          id: String(t._id),
          subject: t.subject as string,
          message: t.message as string,
          status: (t.status as string) ?? "open",
          source,
          adminReply: (t.adminReply as string) ?? null,
          repliedAt: t.repliedAt instanceof Date ? t.repliedAt.toISOString() : null,
          rating: (t.rating as number) ?? null,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : null,
        };
      }),
    };
  });

export const rateTicketResponse = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; rating: number }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
      throw new Error("Rating must be a whole number between 1 and 5.");
    }

    const ticket = await db.collection("supportTickets").findOne({ _id: new ObjectId(data.ticketId) });
    if (!ticket) throw new Error("Ticket not found.");
    if (ticket.uid !== decoded.uid) throw new Error("You don't have access to this ticket.");
    if (!ticket.adminReply) throw new Error("This ticket hasn't been replied to yet.");

    await db.collection("supportTickets").updateOne(
      { _id: new ObjectId(data.ticketId) },
      { $set: { rating: data.rating, ratedAt: new Date() } },
    );
    return { ok: true };
  });

export const listMyPlatformTickets = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const rows = await db
      .collection("supportTickets")
      .find({ uid: decoded.uid, itemType: "platform" })
      .sort({ createdAt: -1 })
      .toArray();
    return {
      tickets: rows.map((r) => ({
        id: String(r._id),
        subject: r.subject as string,
        message: r.message as string,
        status: r.status as string,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });