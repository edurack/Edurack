import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

// Unlike the admin.ts server functions, these only require a VALID student
// (or any signed-in) Firebase token — not the admin custom claim. Any
// logged-in user can browse the catalog; only admins can create/edit it.
async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

function discountPercent(selling: number, crossed: number): number {
  if (!crossed || crossed <= 0) return 0;
  return Math.round(((crossed - selling) / crossed) * 100);
}

function shouldShowBundleForAStudent(bundleExam: string, bundleDomainSubject: string | null, studentDomainSubjects: Set<string>) {
  if (bundleExam !== "cuet" || !bundleDomainSubject) return true;
  return studentDomainSubjects.size === 0 || studentDomainSubjects.has(bundleDomainSubject);
}

// FIX (Lighthouse "Improve image delivery" — ~412 KiB flagged): mentor
// profile photos are uploaded at full camera resolution to Supabase
// Storage, but every place we render them shows a small avatar (56px on
// the landing page). Rather than re-encoding on upload, we rewrite the
// public storage URL to go through Supabase's built-in image-transform
// endpoint, which resizes/re-compresses on the fly and is cached at the
// edge. `/storage/v1/object/public/...` becomes
// `/storage/v1/render/image/public/...?width=&height=&quality=&resize=cover`.
//
// Only rewrites genuine Supabase public-storage URLs — anything else
// (empty string, a non-Supabase URL, an already-transformed URL) is
// returned untouched, so this is safe to apply even if profilePictureUrl
// turns out to be something unexpected.
function toResizedSupabaseImageUrl(url: string | null | undefined, size: number, quality = 70): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url; // not a Supabase public storage URL — leave as-is

  const base = url.slice(0, idx);
  const path = url.slice(idx + marker.length);
  // Request at 2x the display size for retina screens.
  const targetSize = size * 2;
  return `${base}/storage/v1/render/image/public/${path}?width=${targetSize}&height=${targetSize}&resize=cover&quality=${quality}`;
}

export const listPublicBundles = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const profile = await db.collection("profiles").findOne({ uid: decoded.uid });
    const studentDomainSubjects = new Set((profile?.cuetDomainSubjects as string[]) ?? []);
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
  });

export const listPublicMentorshipBatches = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();

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
  });

export const getPublicBundle = createServerFn({ method: "GET" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const r = await db.collection("bundles").findOne({ _id: new ObjectId(data.id) });
    if (!r || r.kind === "mentorBatchSeries") return { bundle: null };
    return {
      bundle: {
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
        syllabusPdfUrls: (r.syllabusPdfUrls as string[]) ?? [],
        plannerUrls: (r.plannerUrls as string[]) ?? [],
      },
    };
  });

export const getPublicMentorshipBatch = createServerFn({ method: "GET" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const r = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(data.id) });
    if (!r) return { batch: null };

    let mentor = null;
    if (r.assignedMentorId) {
      const m = await db
        .collection("mentors")
        .findOne({ _id: new ObjectId(r.assignedMentorId as string) });
      if (m) {
        mentor = {
          name: m.name as string,
          profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
          bio: (m.bio as string) ?? "",
          credentials: (m.credentials as string) ?? "",
        };
      }
    }

    return {
      batch: {
        id: String(r._id),
        name: r.name as string,
        track: r.track as string,
        exam: (r.exam as string) ?? "neet",
        highlights: (r.highlights as string[]) ?? [],
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        discountPercent: discountPercent(r.sellingPrice as number, r.crossedPrice as number),
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        mentor,
      },
    };
  });

export const listPublicTestsForBundle = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(data.bundleId) });
    if (!bundle || bundle.kind === "mentorBatchSeries") return { tests: [] };

    const rows = await db
      .collection("testCores")
      .find({ bundleId: data.bundleId })
      .sort({ liveStart: 1 })
      .toArray();
    return {
      tests: rows.map((r) => ({
        id: String(r._id),
        name: r.name as string,
        totalQuestions: r.totalQuestions as number,
        timeLimitMinutes: (r.durationMinutes as number) ?? 180,
        liveStart: r.liveStart as string,
        liveEnd: r.liveEnd as string,
      })),
    };
  });
  
export const listPublicBundleAnnouncements = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();
    const now = new Date();
    const rows = await db
      .collection("bundleAnnouncements")
      .find({
        bundleId: data.bundleId,
        // Hide announcements scheduled for the future — only show ones
        // meant to be visible now (no sendAt, or sendAt already passed).
        $or: [{ sendAt: null }, { sendAt: { $lte: now.toISOString() } }],
      })
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

// ─── Purchase status (paywall check) ─────────────────────────────────────
// HONEST GAP: there is no real purchases collection populated by a
// Razorpay webhook yet, so this will always return isPurchased: false for
// every item right now. The check itself is real and will start working
// the moment a webhook handler inserts confirmed-payment documents into
// `purchases` — no changes needed here when that's built.
export const checkPurchaseStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; itemType: "bundle" | "mentorship" }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    const purchase = await db.collection("purchases").findOne({
      uid: decoded.uid,
      itemId: data.itemId,
      itemType: data.itemType,
      status: "paid",
    });
    return { isPurchased: Boolean(purchase) };
  });

// ─── Request a callback (Overview tab CTA) ───────────────────────────────
export const submitCallbackRequest = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; itemType: "bundle" | "mentorship"; phone: string; preferredTime: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    await db.collection("callbackRequests").insertOne({
      uid: decoded.uid,
      itemId: data.itemId,
      itemType: data.itemType,
      phone: data.phone,
      preferredTime: data.preferredTime,
      status: "pending",
      createdAt: new Date(),
    });
    return { ok: true };
  });

// ─── Support tickets (Help tab) ───────────────────────────────────────────
export const submitSupportTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; itemType: "bundle" | "mentorship"; subject: string; message: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    await db.collection("supportTickets").insertOne({
      uid: decoded.uid,
      itemId: data.itemId,
      itemType: data.itemType,
      subject: data.subject,
      message: data.message,
      status: "open",
      createdAt: new Date(),
    });
    return { ok: true };
  });

  // ─── Public mentor directory ────────────────────────────────────────────────
// Lists every mentor who has at least one mentorship batch, with enough
// summary info for a search/browse card. Full details (about, locked
// credentials, all batches) live behind getPublicMentorFullProfile on the
// dedicated /mentor-profile/$mentorId page — this is just the directory.
export const listPublicMentors = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const db = await getDb();

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
  });

  // ─── Public: standalone Sold Tests, browsable independent of any batch ────
// Only genuinely ready tests are ever listed: status "live" (admin approved
// a price) AND fully ingested (every question actually added) — same gate
// used in listAttachedSoldTestsForStudent and payments.ts's
// lookupItemPriceAndTitle, so anything a student sees here is something
// they can buy and immediately attempt.
export const listPublicSoldTests = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

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
  });

  // ─── Public: one mentor's live standalone Sold Tests, for their profile page ─
// Genuinely public, matching getPublicMentorFullProfile in batch-hub.ts —
// this backs the anonymous-visitor-facing /mentor-profile/$mentorId page,
// so it must not require a signed-in token. It never reads anything
// purchase- or identity-specific (no decoded.uid used anywhere below), so
// there was nothing here that actually needed auth in the first place.
export const listPublicSoldTestsForMentor = createServerFn({ method: "GET" })
  .validator((data: { token?: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();

    const tests = await db
      .collection("soldTests")
      .find({ mentorId: data.mentorId, status: "live" })
      .sort({ createdAt: -1 })
      .toArray();
    if (tests.length === 0) return { tests: [] };

    const testIds = tests.map((t) => String(t._id));
    const questionCounts = await db
      .collection("questions")
      .aggregate([{ $match: { testId: { $in: testIds } } }, { $group: { _id: "$testId", count: { $sum: 1 } } }])
      .toArray();
    const addedByTestId = new Map(questionCounts.map((r) => [r._id as string, r.count as number]));
    const ready = tests.filter((t) => (addedByTestId.get(String(t._id)) ?? 0) >= (t.totalQuestions as number));

    return {
      tests: ready.map((t) => ({
        id: String(t._id),
        name: t.name as string,
        totalQuestions: t.totalQuestions as number,
        durationMinutes: t.durationMinutes as number,
        subjects: (t.subjects as string[]) ?? [],
        price: t.approvedPrice as number,
      })),
    };
  });

  // ─── ADD THIS TO THE BOTTOM OF src/server-functions/catalog.ts ───────────
// (keep all your existing imports/functions — this is a new addition, not
// a replacement)

// ─── Public: mentor directory for the landing page (fully public — no
// auth token required) ────────────────────────────────────────────────────
// Deliberately separate from listPublicMentors above (which requires a
// signed-in token, since that one backs the in-app browse experience).
// The landing page renders before anyone logs in, so this is intentionally
// open — it only returns the minimum needed to render a mentor card, no
// reviews or ratings, to keep the public surface area small.
//
// Only returns mentors an admin has actually set up as a real profile:
// status isn't "terminated", and both name + profilePictureUrl are
// present. This is what keeps placeholder, incomplete, or removed mentor
// records off the public landing page even though their raw "mentors"
// document technically exists.
export const listMentorsForLanding = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getDb();

  const batches = await db
    .collection("mentorshipBatches")
    .find({ assignedMentorId: { $ne: null } })
    .toArray();
  const mentorIds = [...new Set(batches.map((b) => b.assignedMentorId as string))];
  if (mentorIds.length === 0) return { mentors: [] };

  const { ObjectId } = await import("mongodb");
  const mentors = await db
    .collection("mentors")
    .find({
      _id: { $in: mentorIds.map((id) => new ObjectId(id)) },
      status: { $ne: "terminated" },
      name: { $exists: true, $ne: "" },
      profilePictureUrl: { $exists: true, $ne: null },
    })
    .toArray();

  const batchesByMentor = new Map<string, { id: string; name: string; track: string; exam: string }[]>();
  for (const b of batches) {
    const mid = b.assignedMentorId as string;
    const list = batchesByMentor.get(mid) ?? [];
    list.push({
      id: String(b._id),
      name: b.name as string,
      track: b.track as string,
      exam: (b.exam as string) ?? "neet",
    });
    batchesByMentor.set(mid, list);
  }

  return {
    mentors: mentors.map((m) => {
      const mentorId = String(m._id);
      return {
        id: mentorId,
        name: m.name as string,
        // FIX (Improve image delivery, ~412 KiB): landing page renders this
        // at 56x56 (see MentorAvatar in index.tsx). Requesting a
        // Supabase-transformed 112x112 (2x for retina) image instead of the
        // raw upload cuts a ~260 KiB photo down to a few KB, with no
        // re-encoding pipeline needed on your end — Supabase does it at
        // request time and caches the result at the edge.
        profilePictureUrl: toResizedSupabaseImageUrl(m.profilePictureUrl as string, 56) as string,
        yearOfStudy: (m.yearOfStudy as string) ?? "",
        aiimsIitRank: (m.aiimsIitRank as string) ?? "",
        batches: batchesByMentor.get(mentorId) ?? [],
      };
    }),
  };
});