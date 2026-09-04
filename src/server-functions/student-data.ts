// Server functions for the student's own account-wide views: real purchase
// history (Transaction History + My Purchases page), per-batch performance
// aggregation (Profile page), and platform-level support tickets (Help page,
// as opposed to the per-batch tickets in batch-hub.ts).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

// ─── Purchase history (used by both Profile's Transaction History section
// and the dedicated "My Purchases" page) ────────────────────────────────────
export const getMyPurchases = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const purchases = await db
      .collection("purchases")
      .find({ uid: decoded.uid })
      .sort({ purchasedAt: -1 })
      .toArray();

    const bundleIds = purchases.filter((p) => p.itemType === "bundle").map((p) => new ObjectId(p.itemId as string));
    const mentorshipIds = purchases
      .filter((p) => p.itemType === "mentorship")
      .map((p) => new ObjectId(p.itemId as string));
    const mentorTestIds = purchases
      .filter((p) => p.itemType === "mentorTest")
      .map((p) => new ObjectId(p.itemId as string));

    const [bundles, mentorshipBatches, testCoreDocs, soldTestDocs] = await Promise.all([
      bundleIds.length > 0 ? db.collection("bundles").find({ _id: { $in: bundleIds } }).toArray() : [],
      mentorshipIds.length > 0
        ? db.collection("mentorshipBatches").find({ _id: { $in: mentorshipIds } }).toArray()
        : [],
      // A "mentorTest" purchase can point at either the old Test Series
      // testCores collection or the newer standalone soldTests collection
      // — same dual-source pattern already used in payments.ts's
      // lookupItemPriceAndTitle. Check both; an itemId only ever exists
      // in one of them.
      mentorTestIds.length > 0 ? db.collection("testCores").find({ _id: { $in: mentorTestIds } }).toArray() : [],
      mentorTestIds.length > 0 ? db.collection("soldTests").find({ _id: { $in: mentorTestIds } }).toArray() : [],
    ]);
    const bundleById = new Map(bundles.map((b) => [String(b._id), b]));
    const mentorshipById = new Map(mentorshipBatches.map((b) => [String(b._id), b]));
    const testCoreById = new Map(testCoreDocs.map((t) => [String(t._id), t]));
    const soldTestById = new Map(soldTestDocs.map((t) => [String(t._id), t]));

    return {
      purchases: purchases.map((p) => {
        if (p.itemType === "mentorTest") {
          const testCore = testCoreById.get(p.itemId as string);
          const soldTest = soldTestById.get(p.itemId as string);
          const title = testCore
            ? (testCore.name as string)
            : soldTest
              ? (soldTest.name as string)
              : "Item no longer available";
          return {
            itemType: "mentorTest" as const,
            itemId: p.itemId as string,
            title,
            track: null,
            thumbnailUrl: null,
            amount: p.amount as number,
            razorpayPaymentId: p.razorpayPaymentId as string,
            purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
          };
        }

        const item =
          p.itemType === "bundle" ? bundleById.get(p.itemId as string) : mentorshipById.get(p.itemId as string);
        return {
          itemType: p.itemType as "bundle" | "mentorship",
          itemId: p.itemId as string,
          title: item ? ((p.itemType === "bundle" ? item.title : item.name) as string) : "Item no longer available",
          track: (item?.track as string) ?? null,
          thumbnailUrl: (item?.thumbnailUrl as string | null) ?? null,
          amount: p.amount as number,
          razorpayPaymentId: p.razorpayPaymentId as string,
          purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
        };
      }),
    };
  });
// ─── Per-batch performance summary (Profile page) ──────────────────────────
export const getMyBatchPerformance = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const purchasedBundles = await db
      .collection("purchases")
      .find({ uid: decoded.uid, itemType: "bundle" })
      .toArray();
    if (purchasedBundles.length === 0) return { batches: [] };

    const bundleIds = purchasedBundles.map((p) => p.itemId as string);
    const bundles = await db
      .collection("bundles")
      .find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));

    const attempts = await db
      .collection("testAttempts")
      .find({ uid: decoded.uid, bundleId: { $in: bundleIds } })
      .toArray();

    const byBundleId = new Map<
      string,
      { testIds: Set<string>; attemptCount: number; totalPercent: number; bestPercent: number }
    >();

    for (const a of attempts) {
      const bundleId = a.bundleId as string;
      const entry = byBundleId.get(bundleId) ?? {
        testIds: new Set<string>(),
        attemptCount: 0,
        totalPercent: 0,
        bestPercent: 0,
      };
      entry.testIds.add(a.testId as string);
      entry.attemptCount += 1;
      const percent = a.totalMarks > 0 ? (a.score / a.totalMarks) * 100 : 0;
      entry.totalPercent += percent;
      entry.bestPercent = Math.max(entry.bestPercent, percent);
      byBundleId.set(bundleId, entry);
    }

    return {
      batches: bundleIds.map((bundleId) => {
        const stats = byBundleId.get(bundleId);
        return {
          bundleId,
          bundleTitle: bundleTitleById.get(bundleId) ?? "Bundle",
          testsAttempted: stats?.testIds.size ?? 0,
          totalAttempts: stats?.attemptCount ?? 0,
          averagePercent: stats ? Math.round(stats.totalPercent / stats.attemptCount) : 0,
          bestPercent: stats ? Math.round(stats.bestPercent) : 0,
        };
      }),
    };
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

export const listMyAllTickets = createServerFn({ method: "GET" })
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

export const listMyPlatformTickets = createServerFn({ method: "GET" })
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