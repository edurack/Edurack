// SERVER-ONLY. Never import this from a component or client-side file.
//
// The data behind the student dashboard, as plain functions that take an
// already-authenticated uid / db handle. They hold the logic that used to live
// inline in the individual server functions (getProfile, listPublicBundles,
// listPublicMentorshipBatches, listPublicMentors, listPublicSoldTests,
// getMyPurchases, getMyBatchPerformance, listOpenMentorSessions,
// listMyBookedSessions). Those server functions now delegate here, and
// server-functions/dashboard.ts calls the same functions from ONE request, so
// there is exactly one copy of each query.
//
// This repo's rule is that server-function files never import from each
// other — shared server code lives in lib/ (same as pyq-server.ts).
//
// Nothing here verifies a token: callers MUST authenticate first and pass the
// verified uid.
import { testScorePercent } from "@/lib/practice-stats";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { expandOfferingToSlots } from "@/lib/session-slots";
import { rowToOffering } from "@/lib/session-rows";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";

export type Db = Awaited<ReturnType<typeof getDb>>;

type Track = "Dropper" | "11th" | "12th" | "";

export function discountPercent(selling: number, crossed: number): number {
  if (!crossed || crossed <= 0) return 0;
  return Math.round(((crossed - selling) / crossed) * 100);
}

export function shouldShowBundleForAStudent(bundleExam: string, bundleDomainSubject: string | null, studentDomainSubjects: Set<string>) {
  if (bundleExam !== "cuet" || !bundleDomainSubject) return true;
  return studentDomainSubjects.size === 0 || studentDomainSubjects.has(bundleDomainSubject);
}

// ─── Profile ────────────────────────────────────────────────────────────────
export async function loadProfile(db: Db, uid: string) {
  const doc = await db.collection("profiles").findOne({ uid });

  if (!doc) {
    return { profile: null };
  }

  // Strip Mongo-specific types (ObjectId, Date) that the client/server RPC
  // serializer (seroval) can't handle — return a plain, JSON-safe object.
  const profile = {
    uid: doc.uid as string,
    email: (doc.email as string | null) ?? null,
    fullName: (doc.fullName as string) ?? "",
    mobile: (doc.mobile as string) ?? "",
    // Whether they ticked the optional "offers and updates on WhatsApp/SMS" box (see mobileConsent in server-functions/profile.ts).
    marketingOptIn: (doc.mobileConsent as { marketing?: boolean } | undefined)?.marketing === true,
    city: (doc.city as string) ?? "",
    currentClass: (doc.currentClass as string) ?? "",
    board: (doc.board as string) ?? "",
    targetExam: (doc.targetExam as string) ?? "",
    track: (doc.track as Track) ?? "",
    targetYear: typeof doc.targetYear === "number" ? (doc.targetYear as number) : null,
    cuetDomainSubjects: (doc.cuetDomainSubjects as string[]) ?? [],
    provider: (doc.provider as string) ?? null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : null,
    lastLoginAt: doc.lastLoginAt instanceof Date ? doc.lastLoginAt.toISOString() : null,
  };

  return { profile };
}

// ─── Catalog ────────────────────────────────────────────────────────────────
export async function listBundlesForStudent(db: Db, studentDomainSubjects: Set<string>) {
  // Mentor batch-series bundles are internal containers, not sellable
  // products — a mentor's own test-series tests live here, but this
  // bundle itself must never appear in any student-facing browse list.
  const rows = await db.collection("bundles").find({ kind: { $ne: "mentorBatchSeries" } }).sort({ createdAt: -1 }).toArray();

  return {
    bundles: rows
      .filter((r) => shouldShowBundleForAStudent(r.exam as string, (r.domainSubject as string | null) ?? null, studentDomainSubjects))
      .map((r) => ({
        id: String(r._id),
        title: r.title as string,
        track: r.track as string,
        exam: (r.exam as string) ?? "neet",
        domainSubject: (r.domainSubject as string | null) ?? null,
        features: (r.features as string[]) ?? [],
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        discountPercent: discountPercent(r.sellingPrice as number, r.crossedPrice as number),
        expiryDate: r.expiryDate as string,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
      })),
  };
}

export async function listMentorshipBatches(db: Db) {
  const [batches, mentors] = await Promise.all([
    db.collection("mentorshipBatches").find({}).sort({ createdAt: -1 }).toArray(),
    db.collection("mentors").find({}, { projection: { name: 1 } }).toArray(),
  ]);

  const mentorNameById = new Map(mentors.map((m) => [String(m._id), m.name as string]));

  return {
    batches: batches.map((b) => ({
      id: String(b._id),
      name: b.name as string,
      track: b.track as string,
      exam: (b.exam as string) ?? "neet",
      highlights: (b.highlights as string[]) ?? [],
      sellingPrice: b.sellingPrice as number,
      crossedPrice: b.crossedPrice as number,
      discountPercent: discountPercent(b.sellingPrice as number, b.crossedPrice as number),
      thumbnailUrl: (b.thumbnailUrl as string | null) ?? null,
      mentorName: b.assignedMentorId ? (mentorNameById.get(b.assignedMentorId as string) ?? null) : null,
    })),
  };
}

export async function listMentorDirectory(db: Db) {
  const batches = await db.collection("mentorshipBatches").find({ assignedMentorId: { $ne: null } }).toArray();
  const mentorIds = [...new Set(batches.map((b) => b.assignedMentorId as string))];
  if (mentorIds.length === 0) return { mentors: [] };

  const { ObjectId } = await import("mongodb");
  const mentors = await db
    .collection("mentors")
    .find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } })
    .toArray();

  // Aggregate rating across every session per mentor, same approach as
  // getPublicMentorFullProfile, so the directory card can show a rating
  // at a glance without a separate round trip per mentor.
  const sessions = await db.collection("mentorshipSessions").find({ mentorId: { $in: mentorIds } }).toArray();
  const sessionIdsByMentor = new Map<string, string[]>();
  for (const s of sessions) {
    const list = sessionIdsByMentor.get(s.mentorId as string) ?? [];
    list.push(String(s._id));
    sessionIdsByMentor.set(s.mentorId as string, list);
  }
  const allSessionIds = sessions.map((s) => String(s._id));
  const reviews =
    allSessionIds.length > 0
      ? await db.collection("sessionReviews").find({ sessionId: { $in: allSessionIds } }).toArray()
      : [];

  const batchesByMentor = new Map<string, { id: string; name: string; track: string }[]>();
  for (const b of batches) {
    const mid = b.assignedMentorId as string;
    const list = batchesByMentor.get(mid) ?? [];
    list.push({ id: String(b._id), name: b.name as string, track: b.track as string });
    batchesByMentor.set(mid, list);
  }

  return {
    mentors: mentors.map((m) => {
      const mentorId = String(m._id);
      const mySessionIds = new Set(sessionIdsByMentor.get(mentorId) ?? []);
      const myReviews = reviews.filter((r) => mySessionIds.has(r.sessionId as string));
      const avgRating =
        myReviews.length > 0 ? myReviews.reduce((sum, r) => sum + (r.rating as number), 0) / myReviews.length : null;

      return {
        id: mentorId,
        name: m.name as string,
        // NOTE: left untouched here deliberately — this directory backs the
        // logged-in in-app browse UI, which may render these photos larger
        // than the landing page's 56px avatar. If that screen also shows
        // small thumbnails, apply toResizedSupabaseImageUrl(..., size) here
        // the same way it's applied below in listMentorsForLanding.
        profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
        yearOfStudy: (m.yearOfStudy as string) ?? "",
        aboutText: (m.aboutText as string) ?? "",
        avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
        reviewCount: myReviews.length,
        batches: batchesByMentor.get(mentorId) ?? [],
        searchText: `${m.name as string} ${(m.aboutText as string) ?? ""} ${(batchesByMentor.get(mentorId) ?? []).map((b) => b.name).join(" ")}`.toLowerCase(),
      };
    }),
  };
}

// Only genuinely ready tests are ever listed: status "live" (admin approved
// a price) AND fully ingested (every question actually added).
export async function listLiveSoldTests(db: Db) {
  const { ObjectId } = await import("mongodb");

  const tests = await db.collection("soldTests").find({ status: "live" }).sort({ createdAt: -1 }).toArray();
  if (tests.length === 0) return { tests: [] };

  const testIds = tests.map((t) => String(t._id));
  const questionCounts = await db
    .collection("questions")
    .aggregate([{ $match: { testId: { $in: testIds } } }, { $group: { _id: "$testId", count: { $sum: 1 } } }])
    .toArray();
  const addedByTestId = new Map(questionCounts.map((r) => [r._id as string, r.count as number]));
  const ready = tests.filter((t) => (addedByTestId.get(String(t._id)) ?? 0) >= (t.totalQuestions as number));
  if (ready.length === 0) return { tests: [] };

  const mentorIds = [...new Set(ready.map((t) => t.mentorId as string))];
  const mentors = mentorIds.length
    ? await db.collection("mentors").find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray()
    : [];
  const nameByMentorId = new Map(mentors.map((m) => [String(m._id), m.name as string]));

  return {
    tests: ready.map((t) => ({
      id: String(t._id),
      name: t.name as string,
      mentorName: nameByMentorId.get(t.mentorId as string) ?? "Edurack Mentor",
      totalQuestions: t.totalQuestions as number,
      durationMinutes: t.durationMinutes as number,
      subjects: (t.subjects as string[]) ?? [],
      price: t.approvedPrice as number,
    })),
  };
}

// ─── The student's own purchases / performance ─────────────────────────────
export async function loadMyPurchases(db: Db, uid: string) {
  const { ObjectId } = await import("mongodb");

  const purchases = await db
    .collection("purchases")
    .find({ uid })
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
}

export async function loadMyBatchPerformance(db: Db, uid: string) {
  const { ObjectId } = await import("mongodb");

  const purchasedBundles = await db
    .collection("purchases")
    .find({ uid, itemType: "bundle" })
    .toArray();
  if (purchasedBundles.length === 0) return { batches: [] };

  const bundleIds = purchasedBundles.map((p) => p.itemId as string);
  const bundles = await db
    .collection("bundles")
    .find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
  const examOf = (v: unknown) => {
    const t = String(v ?? "").toLowerCase();
    return t.includes("jee") ? "jee" : t.includes("cuet") ? "cuet" : t.includes("ipmat") ? "ipmat" : "neet";
  };
  const bundleExamById = new Map(bundles.map((b) => [String(b._id), examOf(b.exam)]));

  const attempts = await db
    .collection("testAttempts")
    .find({ uid, bundleId: { $in: bundleIds } })
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
    // NEET/JEE tests have negative marking, so score/total can dip below zero. Floor it for display, BEFORE
    // averaging, so the average, the best and the per-test bars always agree (see lib/practice-stats.ts).
    const percent = testScorePercent(Number(a.score), Number(a.totalMarks));
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
        // Old bundles have no exam field; the rest of the app treats those as NEET.
        exam: bundleExamById.get(bundleId) ?? "neet",
        testsAttempted: stats?.testIds.size ?? 0,
        totalAttempts: stats?.attemptCount ?? 0,
        averagePercent: stats ? Math.round(stats.totalPercent / stats.attemptCount) : 0,
        // Unrounded sum so the dashboard can average across bundles without compounding rounding.
        percentSum: stats ? Math.round(stats.totalPercent * 100) / 100 : 0,
        bestPercent: stats ? Math.round(stats.bestPercent) : 0,
      };
    }),
  };
}

// ─── Mentor sessions (Supabase) ────────────────────────────────────────────
export async function lookupMentorPublicInfo(mentorIds: string[]): Promise<Record<string, { name: string; photoUrl: string | null }>> {
  if (mentorIds.length === 0) return {};
  const { ObjectId } = await import("mongodb");

  const validIds: { raw: string; oid: InstanceType<typeof ObjectId> }[] = [];
  for (const id of mentorIds) {
    if (ObjectId.isValid(id)) validIds.push({ raw: id, oid: new ObjectId(id) });
  }
  if (validIds.length === 0) return {};

  const db = await getDb();
  const mentors = await db
    .collection("mentors")
    .find({ _id: { $in: validIds.map((v) => v.oid) } }, { projection: { name: 1, profilePictureUrl: 1 } })
    .toArray();
  const byId = new Map(mentors.map((m) => [String(m._id), m]));

  const result: Record<string, { name: string; photoUrl: string | null }> = {};
  for (const { raw } of validIds) {
    const m = byId.get(raw);
    if (m) {
      result[raw] = { name: (m.name as string) ?? "Mentor", photoUrl: (m.profilePictureUrl as string | null) ?? null };
    }
  }
  return result;
}

// Lists every mentor's active offerings plus, for each, its next open
// slots (21-day window) with seats-remaining counts for group sessions.
export async function loadOpenMentorSessions() {
  const { data: offeringRows, error } = await supabase
    .from("mentor_session_offerings")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(error.message);

  const offerings = (offeringRows ?? []).map(rowToOffering);
  if (offerings.length === 0) return { offerings: [] as PublicMentorOffering[], slotsByOffering: {} as Record<string, OpenSlot[]> };

  const offeringIds = offerings.map((o) => o.id);
  const { data: bookingRows, error: bErr } = await supabase
    .from("mentor_session_bookings")
    .select("offering_id, session_date, start_time")
    .in("offering_id", offeringIds)
    .neq("status", "cancelled");
  if (bErr) throw new Error(bErr.message);

  // Count bookings per slot instead of a boolean "is it taken" set — a
  // group offering (capacity > 1) can have several non-cancelled
  // bookings for the same slot and still have seats left.
  const seatCounts = new Map<string, number>();
  for (const b of bookingRows ?? []) {
    const key = `${b.offering_id}:${b.session_date}:${b.start_time}`;
    seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
  }

  const mentorIds = Array.from(new Set(offerings.map((o) => o.mentorId)));
  const mentorInfo = await lookupMentorPublicInfo(mentorIds);

  const publicOfferings: PublicMentorOffering[] = offerings.map((o) => ({
    ...o,
    mentorName: mentorInfo[o.mentorId]?.name ?? "Mentor",
    mentorPhotoUrl: mentorInfo[o.mentorId]?.photoUrl ?? null,
  }));

  const slotsByOffering: Record<string, OpenSlot[]> = {};
  for (const o of offerings) {
    slotsByOffering[o.id] = expandOfferingToSlots(o, seatCounts);
  }

  return { offerings: publicOfferings, slotsByOffering };
}

export async function loadMyBookedSessions(uid: string) {
  const { data: rows, error } = await supabase
    .from("mentor_session_bookings")
    .select("*, mentor_session_offerings(title, thumbnail_url)")
    .eq("student_uid", uid)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);

  // Same raw row shape as before (dashboard/profile read it), plus who the
  // session is with — My Sessions used to show a title and nothing else.
  const mentorIds = Array.from(new Set((rows ?? []).map((r: any) => r.mentor_id as string)));
  const mentorInfo = await lookupMentorPublicInfo(mentorIds).catch(() => ({}) as Record<string, { name: string; photoUrl: string | null }>);
  return {
    bookings: (rows ?? []).map((r: any) => ({
      ...r,
      mentor_name: mentorInfo[r.mentor_id]?.name ?? "Your mentor",
      mentor_photo_url: mentorInfo[r.mentor_id]?.photoUrl ?? null,
    })),
  };
}
