// Server functions backing the student-facing Unified Batch/Course Hub.
// These require a valid signed-in Firebase token (any student), not admin —
// mirroring the pattern in catalog.ts.
// swap this import
import { signLectureUrl } from "@/lib/video-signer";
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

function discountPercent(selling: number, crossed: number): number {
  if (!crossed || crossed <= 0) return 0;
  return Math.round(((crossed - selling) / crossed) * 100);
}

// ─── Bundle detail (Test Series) ─────────────────────────────────────────
export const getPublicBundleDetail = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const r = await db.collection("bundles").findOne({ _id: new ObjectId(data.bundleId) });
    if (!r) return { bundle: null };

    return {
      bundle: {
        id: String(r._id),
        title: r.title as string,
        track: r.track as string,
        features: (r.features as string[]) ?? [],
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        discountPercent: discountPercent(r.sellingPrice as number, r.crossedPrice as number),
        uploadWindowStart: r.uploadWindowStart as string,
        uploadWindowEnd: r.uploadWindowEnd as string,
        expiryDate: r.expiryDate as string,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        syllabusPdfUrls: (r.syllabusPdfUrls as string[]) ?? [],
        plannerUrls: (r.plannerUrls as string[]) ?? [],
      },
    };
  });

// ─── Mentorship batch detail ──────────────────────────────────────────────
export const getPublicMentorshipDetail = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const r = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(data.batchId) });
    if (!r) return { batch: null };

    let mentor = null;
    if (r.assignedMentorId) {
      const m = await db.collection("mentors").findOne({ _id: new ObjectId(r.assignedMentorId as string) });
      if (m) {
        mentor = {
          name: m.name as string,
          profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
        };
      }
    }

    return {
      batch: {
        id: String(r._id),
        name: r.name as string,
        track: r.track as string,
        highlights: (r.highlights as string[]) ?? [],
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        discountPercent: discountPercent(r.sellingPrice as number, r.crossedPrice as number),
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        mentor,
      },
    };
  });

// ─── Tests inside a bundle (student-facing) ───────────────────────────────
export const listPublicTestsForBundle = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();
    const rows = await db
      .collection("testCores")
      .find({ bundleId: data.bundleId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      tests: rows.map((r) => ({
        id: String(r._id),
        name: r.name as string,
        totalQuestions: r.totalQuestions as number,
        // FIXED: this was reading `r.timeLimitMinutes`, a field that was
        // never actually written to testCores documents — the duration
        // is stored as `durationMinutes` (see admin.ts
        // createTestCore/updateTestCore and admin-types.ts TestCore).
        // This is the same field-name mismatch already fixed in
        // catalog.ts and test-engine.ts — this file has its own separate
        // copy of listPublicTestsForBundle, which is the one
        // course.$kind.$id.tsx actually imports and calls, so it needed
        // the identical fix applied here too.
        timeLimitMinutes: (r.durationMinutes as number) ?? 180,
        subjects: (r.subjects as string[]) ?? [],
        liveStart: r.liveStart as string,
        liveEnd: r.liveEnd as string,
      })),
    };
  });

// ─── Announcements for a bundle (student-facing) ──────────────────────────
export const listPublicBundleAnnouncements = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();
    const rows = await db
      .collection("bundleAnnouncements")
      .find({ bundleId: data.bundleId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      announcements: rows.map((r) => ({
        id: String(r._id),
        message: (r.message as string | null) ?? null,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// ─── Purchase check ────────────────────────────────────────────────────────
// Real query against a `purchases` collection — it just has no rows in it
// yet since there's no working checkout flow to write them. This means
// isPurchased will correctly report false for everyone until real Razorpay
// integration exists and starts writing confirmed orders here.
export const hasPurchased = createServerFn({ method: "GET" })
  .validator((data: { token: string; itemType: "bundle" | "mentorship" | "mentorTest"; itemId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const existing = await db.collection("purchases").findOne({
      uid: decoded.uid,
      itemType: data.itemType,
      itemId: data.itemId,
    });
    return { isPurchased: Boolean(existing) };
  });

// ─── Request a Call Back ────────────────────────────────────────────────────
export const requestCallback = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: "bundle" | "mentorship";
      itemId: string;
      name: string;
      phone: string;
      message: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    await db.collection("callbackRequests").insertOne({
      uid: decoded.uid,
      itemType: data.itemType,
      itemId: data.itemId,
      name: data.name,
      phone: data.phone,
      message: data.message,
      status: "open",
      createdAt: new Date(),
    });
    return { ok: true };
  });

// ─── Support ticket (per-batch help desk) ──────────────────────────────────
export const submitSupportTicket = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; itemType: "bundle" | "mentorship"; itemId: string; subject: string; message: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    await db.collection("supportTickets").insertOne({
      uid: decoded.uid,
      itemType: data.itemType,
      itemId: data.itemId,
      subject: data.subject,
      message: data.message,
      status: "open",
      createdAt: new Date(),
    });
    return { ok: true };
  });

  // ─── Student-facing: Extended mentor profile for mentorship batches ────────
// Extends what getPublicMentorshipDetail already returns (name +
// profilePictureUrl) with the full public-facing profile a student should
// see: bio, year of study, intro video, and the locked verification fields
// (rank/college/course) — read-only here exactly as they are in the mentor
// portal, since students should see the same verified credentials a mentor
// cannot self-edit.
export const getPublicMentorProfile = createServerFn({ method: "GET" })
  .validator((data: { token: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const m = await db.collection("mentors").findOne({ _id: new ObjectId(data.mentorId) });
    if (!m) return { mentor: null };

    return {
      mentor: {
        id: String(m._id),
        name: m.name as string,
        profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
        aboutText: (m.aboutText as string) ?? "",
        yearOfStudy: (m.yearOfStudy as string) ?? "",
        introVideoUrl: (m.introVideoUrl as string | null) ?? null,
        aiimsIitRank: (m.aiimsIitRank as string) ?? "",
        enrolledCollege: (m.enrolledCollege as string) ?? "",
        pursuedCourse: (m.pursuedCourse as string) ?? "",
      },
    };
  });

// ─── Student-facing: Live sessions for a mentorship batch ──────────────────
// Mirrors listMentorshipSessions in mentor-portal.ts, but scoped for a
// student rather than the mentor: BatchMeet and AsyncLecture sessions are
// visible to every student in the batch, while OneOnOne sessions are only
// visible if this specific student is the one booked into them — a student
// should never see another student's 1:1 slot.
export const listMentorshipSessionsForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const rows = await db
      .collection("mentorshipSessions")
      .find({
        batchId: data.batchId,
        $or: [{ track: { $ne: "OneOnOne" } }, { track: "OneOnOne", studentUid: decoded.uid }],
      })
      .sort({ scheduledAt: 1 })
      .toArray();

        return {
      sessions: rows.map((r) => ({
        id: String(r._id),
        track: r.track as "OneOnOne" | "BatchMeet" | "AsyncLecture",
        meetingLink: (r.meetingLink as string | null) ?? null,
        lectureUrl: null, // never expose the raw URL here — /lecture/$sessionId signs it after checking purchase
        lectureTitle: (r.lectureTitle as string | null) ?? null,
        durationMinutes: (r.durationMinutes as number | null) ?? null,
        scheduledAt: r.scheduledAt as string,
        status: r.status as "scheduled" | "completed" | "cancelled",
      })),
    };
  });

// ─── Student-facing: Mentorship batch announcements ─────────────────────────
// The mentorship-side equivalent of listPublicBundleAnnouncements. Reads
// from mentorshipBatchAnnouncements (written by postMentorAnnouncement in
// mentor-portal.ts) rather than bundleAnnouncements — these are two
// separate collections because mentorship announcements carry a title and
// email-trigger metadata that bundle announcements don't.
export const listPublicMentorshipAnnouncements = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();
    const rows = await db
      .collection("mentorshipBatchAnnouncements")
      .find({ batchId: data.batchId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      announcements: rows.map((r) => ({
        id: String(r._id),
        title: (r.title as string | null) ?? null,
        message: (r.message as string | null) ?? null,
        thumbnailUrl: null as string | null, // mentor announcements carry no thumbnail field
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const getLectureSessionForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture not found.");
    if (session.track !== "AsyncLecture") throw new Error("This session is not a recorded lecture.");

    const purchase = await db
      .collection("purchases")
      .findOne({ uid: decoded.uid, itemType: "mentorship", itemId: session.batchId as string });
    if (!purchase) throw new Error("You have not purchased this mentorship batch.");

    let mentorName: string | null = null;
    const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(session.batchId as string) });
    if (batch?.assignedMentorId) {
      const mentor = await db
        .collection("mentors")
        .findOne({ _id: new ObjectId(batch.assignedMentorId as string) });
      mentorName = (mentor?.name as string) ?? null;
    }

       return {
      session: {
        id: String(session._id),
        batchId: session.batchId as string,
        batchName: (batch?.name as string) ?? "Mentorship Batch",
        mentorName,
        lectureTitle: (session.lectureTitle as string) ?? "Lecture",
        lectureUrl: await signLectureUrl(session.lectureUrl as string), // session.lectureUrl now stores the S3 KEY, not a full URL
        scheduledAt: session.scheduledAt as string,
      },
    };
   });

export const listLectureCommentsForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const rows = await db
      .collection("lectureComments")
      .find({ sessionId: data.sessionId })
      .sort({ isMentor: -1, createdAt: 1 })
      .toArray();

    const visible = rows.filter((r) => !r.hidden || r.studentUid === decoded.uid || r.isMentor);

    return {
      comments: visible.map((r) => ({
        id: String(r._id),
        isMentor: Boolean(r.isMentor),
        mentorId: (r.mentorId as string | null) ?? null,
        studentUid: (r.studentUid as string | null) ?? null,
        // For a mentor comment, "studentName" slot carries the mentor's
        // name/photo instead — keeps one Comment shape for both authors.
        studentName: r.isMentor ? (r.mentorName as string) : (r.studentName as string),
        profilePictureUrl: r.isMentor ? ((r.mentorProfilePictureUrl as string | null) ?? null) : null,
        body: r.body as string,
        isOwn: !r.isMentor && r.studentUid === decoded.uid,
        hidden: Boolean(r.hidden),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });
export const postLectureCommentAsStudent = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; body: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    if (!data.body.trim()) throw new Error("Comment cannot be empty.");

    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture not found.");

    const purchase = await db
      .collection("purchases")
      .findOne({ uid: decoded.uid, itemType: "mentorship", itemId: session.batchId as string });
    if (!purchase) throw new Error("You have not purchased this mentorship batch.");

    const profile = await db.collection("profiles").findOne({ uid: decoded.uid });
    const studentName = (profile?.fullName as string) || "Student";

    await db.collection("lectureComments").insertOne({
      sessionId: data.sessionId,
      studentUid: decoded.uid,
      studentName,
      body: data.body.trim(),
      hidden: false,
      createdAt: new Date(),
    });

    return { ok: true };
  });

  // ─── Lecture watch progress tracking ────────────────────────────────────────
export const updateLectureProgress = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; watchedSeconds: number; durationSeconds: number }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    // 90% watched counts as complete — accommodates outros/credits that
    // most students skip without it counting against them.
    const completed = data.durationSeconds > 0 && data.watchedSeconds / data.durationSeconds >= 0.9;

    await db.collection("lectureProgress").updateOne(
      { sessionId: data.sessionId, studentUid: decoded.uid },
      {
        $set: {
          sessionId: data.sessionId,
          studentUid: decoded.uid,
          watchedSeconds: Math.max(data.watchedSeconds, 0),
          durationSeconds: data.durationSeconds,
          completed,
          lastWatchedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return { ok: true, completed };
  });

export const getMyLectureProgress = createServerFn({ method: "GET" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const row = await db
      .collection("lectureProgress")
      .findOne({ sessionId: data.sessionId, studentUid: decoded.uid });
    if (!row) return { progress: null };
    return {
      progress: {
        watchedSeconds: row.watchedSeconds as number,
        durationSeconds: row.durationSeconds as number,
        completed: Boolean(row.completed),
      },
    };
  });

// Batched status lookup for the batch's Sessions tab — one call instead of
// one per session. Returns watch-progress for AsyncLecture rows and this
// student's own review (if any) for every session in the batch, live or
// recorded.
export const listMySessionStatuses = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const sessions = await db.collection("mentorshipSessions").find({ batchId: data.batchId }).toArray();
    const sessionIds = sessions.map((s) => String(s._id));
    if (sessionIds.length === 0) return { statuses: [] };

    const [progressRows, reviewRows] = await Promise.all([
      db.collection("lectureProgress").find({ sessionId: { $in: sessionIds }, studentUid: decoded.uid }).toArray(),
      db.collection("sessionReviews").find({ sessionId: { $in: sessionIds }, studentUid: decoded.uid }).toArray(),
    ]);

    const progressBySession = new Map(progressRows.map((p) => [p.sessionId as string, p]));
    const reviewBySession = new Map(reviewRows.map((r) => [r.sessionId as string, r]));

    return {
      statuses: sessionIds.map((id) => {
        const p = progressBySession.get(id);
        const r = reviewBySession.get(id);
        const watchPercent =
          p && (p.durationSeconds as number) > 0
            ? Math.min(100, Math.round(((p.watchedSeconds as number) / (p.durationSeconds as number)) * 100))
            : 0;
        return {
          sessionId: id,
          watchPercent,
          completedLecture: Boolean(p?.completed),
          myRating: (r?.rating as number | undefined) ?? null,
        };
      }),
    };
  });

// ─── Session reviews (ratings) — works across all three tracks ─────────────
export const submitSessionReview = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; batchId: string; rating: number; reviewText: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    if (data.rating < 1 || data.rating > 5) throw new Error("Rating must be between 1 and 5.");

    const db = await getDb();
    await db.collection("sessionReviews").updateOne(
      { sessionId: data.sessionId, studentUid: decoded.uid },
      {
        $set: {
          sessionId: data.sessionId,
          batchId: data.batchId,
          studentUid: decoded.uid,
          rating: data.rating,
          reviewText: data.reviewText.trim(),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    return { ok: true };
  });

export const getMySessionReview = createServerFn({ method: "GET" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const row = await db.collection("sessionReviews").findOne({ sessionId: data.sessionId, studentUid: decoded.uid });
    if (!row) return { review: null };
    return { review: { rating: row.rating as number, reviewText: (row.reviewText as string) ?? "" } };
  });

// ─── Student-facing read of mentor-uploaded batch notes ────────────────────
// Notes are scoped to the batch (not per-lecture) in the current schema —
// shown on the lecture page as reference material for that batch overall.
export const listMentorNotesForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const purchase = await db
      .collection("purchases")
      .findOne({ uid: decoded.uid, itemType: "mentorship", itemId: data.batchId });
    if (!purchase) return { notes: [] };

    const rows = await db.collection("mentorNotes").find({ batchId: data.batchId }).sort({ createdAt: -1 }).toArray();

    return {
      notes: rows.map((r) => ({
        id: String(r._id),
        fileName: r.fileName as string,
        fileUrl: r.fileUrl as string,
        watermarkApplied: Boolean(r.watermarkApplied),
      })),
    };
  });


export const getPublicMentorFullProfile = createServerFn({ method: "GET" })
  .validator((data: { token: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const m = await db.collection("mentors").findOne({ _id: new ObjectId(data.mentorId) });
    if (!m) return { mentor: null, batches: [] };

    const batches = await db.collection("mentorshipBatches").find({ assignedMentorId: data.mentorId }).toArray();

    // Aggregate rating across every session this mentor has run, so the
    // profile page can show one overall score rather than nothing.
    const sessions = await db.collection("mentorshipSessions").find({ mentorId: data.mentorId }).toArray();
    const sessionIds = sessions.map((s) => String(s._id));
    const reviews =
      sessionIds.length > 0
        ? await db.collection("sessionReviews").find({ sessionId: { $in: sessionIds } }).toArray()
        : [];
    const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviews.length : null;

    return {
      mentor: {
        id: String(m._id),
        name: m.name as string,
        profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
        aboutText: (m.aboutText as string) ?? "",
        yearOfStudy: (m.yearOfStudy as string) ?? "",
        introVideoUrl: (m.introVideoUrl as string | null) ?? null,
        aiimsIitRank: (m.aiimsIitRank as string) ?? "",
        enrolledCollege: (m.enrolledCollege as string) ?? "",
        pursuedCourse: (m.pursuedCourse as string) ?? "",
        avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
        reviewCount: reviews.length,
      },
      batches: batches.map((b) => ({
        id: String(b._id),
        name: b.name as string,
        track: b.track as string,
        thumbnailUrl: (b.thumbnailUrl as string | null) ?? null,
      })),
    };
  });


function isCurrentlyLockedForStudent(lockedFrom: string, lockedUntil: string): boolean {
  if (!lockedFrom || !lockedUntil) return false;
  const now = new Date();
  const [fromH, fromM] = lockedFrom.split(":").map(Number);
  const [untilH, untilM] = lockedUntil.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = fromH * 60 + fromM;
  const untilMinutes = untilH * 60 + untilM;
  if (fromMinutes <= untilMinutes) {
    return !(nowMinutes >= fromMinutes && nowMinutes < untilMinutes);
  }
  return !(nowMinutes >= fromMinutes || nowMinutes < untilMinutes);
}

export const getMyMentorForBatch = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(data.batchId) });
    if (!batch?.assignedMentorId) return { mentorId: null, mentorName: null };

    const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(batch.assignedMentorId as string) });
    return {
      mentorId: (batch.assignedMentorId as string) ?? null,
      mentorName: (mentor?.name as string) ?? null,
    };
  });

// ─── Student-facing: a mentor's batch test series ───────────────────────────
// Only tests the mentor has explicitly published (`publishedToBatch: true`)
// are ever returned here — a fully-ingested-but-unpublished test stays
// completely invisible to students, even ones who've already purchased the
// batch. Each row is pre-annotated with whether *this* student can access
// it: a free test (price: null) unlocks via the ordinary mentorship batch
// purchase; a paid test unlocks via its own standalone "mentorTest"
// purchase and does NOT require the batch to be purchased at all — see
// payments.ts's lookupItemPriceAndTitle/resolveCommissionPercent for how
// that purchase type is priced and split.
export const listMentorBatchSeriesTestsForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const bundle = await db.collection("bundles").findOne({ batchId: data.batchId, kind: "mentorBatchSeries" });
    if (!bundle) return { tests: [] };

    const tests = await db
      .collection("testCores")
      .find({ bundleId: String(bundle._id), publishedToBatch: true })
      .sort({ liveStart: 1 })
      .toArray();
    if (tests.length === 0) return { tests: [] };

    const hasBatchPurchase = Boolean(
      await db.collection("purchases").findOne({ uid: decoded.uid, itemType: "mentorship", itemId: data.batchId }),
    );

    const testIds = tests.map((t) => String(t._id));
    const testPurchases = await db
      .collection("purchases")
      .find({ uid: decoded.uid, itemType: "mentorTest", itemId: { $in: testIds } })
      .toArray();
    const purchasedTestIds = new Set(testPurchases.map((p) => p.itemId as string));

    return {
      tests: tests.map((t) => {
        const price = (t.price as number | null) ?? null;
        const unlocked = price ? purchasedTestIds.has(String(t._id)) : hasBatchPurchase;
        return {
          id: String(t._id),
          name: t.name as string,
          totalQuestions: t.totalQuestions as number,
          timeLimitMinutes: t.durationMinutes as number,
          liveStart: t.liveStart as string,
          liveEnd: t.liveEnd as string,
          price,
          unlocked,
        };
      }),
    };
  });

export const listMyChatWithMentor = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const rows = await db
      .collection("chatMessages")
      .find({ mentorId: data.mentorId, batchId: data.batchId, studentUid: decoded.uid })
      .sort({ createdAt: 1 })
      .toArray();

    return {
      messages: rows.map((r) => ({
        id: String(r._id),
        sender: r.sender as "mentor" | "student",
        body: r.body as string,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const sendMyChatMessage = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; mentorId: string; body: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    if (!data.body.trim()) throw new Error("Message cannot be empty.");

    const db = await getDb();

    const purchase = await db
      .collection("purchases")
      .findOne({ uid: decoded.uid, itemType: "mentorship", itemId: data.batchId });
    if (!purchase) throw new Error("You have not purchased this mentorship batch.");

    const lock = await db.collection("chatLockWindows").findOne({ mentorId: data.mentorId, batchId: data.batchId });
    if (lock && isCurrentlyLockedForStudent(lock.lockedFrom as string, lock.lockedUntil as string)) {
      throw new Error("Messaging is currently locked by your mentor. Try again during their open window.");
    }

    await db.collection("chatMessages").insertOne({
      mentorId: data.mentorId,
      batchId: data.batchId,
      studentUid: decoded.uid,
      sender: "student",
      body: data.body.trim(),
      createdAt: new Date(),
    });
    return { ok: true };
  });

export const getChatLockStatusForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();
    const lock = await db.collection("chatLockWindows").findOne({ mentorId: data.mentorId, batchId: data.batchId });
    if (!lock) return { isLockedNow: false, openFrom: null as string | null, openUntil: null as string | null };
    return {
      isLockedNow: isCurrentlyLockedForStudent(lock.lockedFrom as string, lock.lockedUntil as string),
      openFrom: lock.lockedFrom as string,
      openUntil: lock.lockedUntil as string,
    };
  });

  // ─── Student-facing: Sold Tests attached to a mentorship batch ────────────
// Same free-with-batch / paid-standalone model as
// listMentorBatchSeriesTestsForStudent, but for the separate "Sell Tests"
// product (soldTests collection) rather than Test Series (testCores).
// Sold Tests have no scheduled live window — they're just available once
// unlocked — so this row shape has no liveStart/liveEnd.
// Same ingestion-completeness gate as payments.ts's
// lookupItemPriceAndTitle: a "live" (admin-approved) test that isn't
// fully ingested yet must not appear as available, even to students who've
// already purchased the batch.
export const listAttachedSoldTestsForStudent = createServerFn({ method: "GET" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const tests = await db
      .collection("soldTests")
      .find({ attachedBatchIds: data.batchId, status: "live" })
      .sort({ createdAt: -1 })
      .toArray();
    if (tests.length === 0) return { tests: [] };

    const testIds = tests.map((t) => String(t._id));
    const questionCounts = await db
      .collection("questions")
      .aggregate([{ $match: { testId: { $in: testIds } } }, { $group: { _id: "$testId", count: { $sum: 1 } } }])
      .toArray();
    const addedByTestId = new Map(questionCounts.map((r) => [r._id as string, r.count as number]));
    const readyTests = tests.filter((t) => (addedByTestId.get(String(t._id)) ?? 0) >= (t.totalQuestions as number));
    if (readyTests.length === 0) return { tests: [] };

    const hasBatchPurchase = Boolean(
      await db.collection("purchases").findOne({ uid: decoded.uid, itemType: "mentorship", itemId: data.batchId }),
    );

    const readyTestIds = readyTests.map((t) => String(t._id));
    const testPurchases = await db
      .collection("purchases")
      .find({ uid: decoded.uid, itemType: "mentorTest", itemId: { $in: readyTestIds } })
      .toArray();
    const purchasedTestIds = new Set(testPurchases.map((p) => p.itemId as string));

    return {
      tests: readyTests.map((t) => ({
        id: String(t._id),
        name: t.name as string,
        totalQuestions: t.totalQuestions as number,
        durationMinutes: t.durationMinutes as number,
        price: t.approvedPrice as number, // always a real price here — "free" means free-because-batch-purchased, not price:null like testCores
        unlocked: hasBatchPurchase || purchasedTestIds.has(String(t._id)),
      })),
    };
  });

  // ─── Public: single Sold Test detail (for its standalone purchase page) ───
export const getPublicSoldTestDetail = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const t = await db.collection("soldTests").findOne({ _id: new ObjectId(data.testId) });
    if (!t || t.status !== "live" || !t.approvedPrice) return { test: null };

    const addedCount = await db.collection("questions").countDocuments({ testId: data.testId });
    if (addedCount < (t.totalQuestions as number)) return { test: null };

    const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(t.mentorId as string) });
    return {
      test: {
        id: String(t._id),
        name: t.name as string,
        mentorName: (mentor?.name as string) ?? "Edurack Mentor",
        totalQuestions: t.totalQuestions as number,
        durationMinutes: t.durationMinutes as number,
        subjects: (t.subjects as string[]) ?? [],
        instructions: (t.instructions as string) ?? "",
        price: t.approvedPrice as number,
      },
    };
  });