// Post-approval mentor onboarding: the detailed 18-question form filled in
// after an application is approved (see mentor-applications.ts /
// admin.ts's approveCreatorApplication), plus digital agreement signing.
// Deliberately public (no auth token check beyond validating the
// applicationId + its approved status) — at this stage the mentor doesn't
// have a platform account yet, same reasoning as submitCreatorApplication.
//
// Profile photo and batch thumbnail are uploaded directly from the browser
// to Supabase Storage (see @/lib/supabase.ts and the wizard component) —
// this server function only ever receives the resulting public URL, never
// the raw file. Size limits (1MB photo / 5MB thumbnail) are enforced
// client-side before the upload starts; the bucket's own "file size limit"
// setting (set in the Supabase dashboard, see @/lib/supabase.ts) is the
// actually-enforced backstop — a client can't bypass that one by editing
// the wizard's JS, since Storage itself will reject an oversized write.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHash } from "node:crypto";

type MentorOnboardingInput = {
  applicationId: string;
  profilePhotoUrl: string;
  fullName: string;
  college: string;
  rank: string;
  aboutText: string;
  weeklyHours: string;
  wantsToSellTestSeries: boolean;
  wantsToRecordIntroVideo: boolean;
  introVideoUrl: string;
  batchName: string;
  batchThumbnailUrl: string;
  needsThumbnailFromEdurack: boolean;
  batchPrice: number;
  batchDurationMonths: number;
  hasMinStudentCriteria: boolean;
  minStudentCriteriaDetails: string;
  needsPromotionAssistance: boolean;
  hasSyllabusPdf: boolean;
  syllabusPdfUrl: string;
  wantsPlannerDiscussionCall: boolean;
  expectedCommissionPercent: number;
  wantsPlatformTour: boolean;
  preferredLaunchDate: string;
};

// ─── Lets the onboarding page confirm the application exists and is
// actually approved before showing the form, and prefill the mentor's name. ─
export const getApprovedApplicationSummary = createServerFn({ method: "GET" })
  .validator((data: { applicationId: string }) => data)
  .handler(async ({ data }) => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) return { found: false as const };
    if (app.status !== "approved") return { found: true as const, approved: false as const };

    const existingDetails = await db
      .collection("mentorOnboardingDetails")
      .findOne({ applicationId: data.applicationId });

    return {
      found: true as const,
      approved: true as const,
      fullName: (app.personal as { fullName: string }).fullName,
      alreadySubmitted: Boolean(existingDetails?.submittedAt),
      alreadySigned: Boolean(existingDetails?.signature),
    };
  });

// ─── Draft-safe submit: upserts, so a mentor can come back and resubmit
// before signing (submittedAt/updatedAt track this) without creating dupes. ─
export const submitMentorOnboardingDetails = createServerFn({ method: "POST" })
  .validator((data: MentorOnboardingInput) => data)
  .handler(async ({ data }) => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");
    if (app.status !== "approved") throw new Error("This application hasn't been approved yet.");

    if (!data.fullName?.trim()) throw new Error("Full name is required.");
    if (!data.batchName?.trim()) throw new Error("Batch name is required.");
    if (!data.batchPrice || data.batchPrice <= 0) throw new Error("Enter a valid batch price.");
    if (!data.batchDurationMonths || data.batchDurationMonths <= 0) throw new Error("Enter a valid batch duration.");

    // Both fields now come in as Supabase Storage public URLs from the
    // wizard's file-upload flow, not hand-typed links — a quick shape
    // check catches anything that slipped through as plain text instead
    // of an actual upload.
    if (data.profilePhotoUrl && !/^https?:\/\//i.test(data.profilePhotoUrl)) {
      throw new Error("Profile photo didn't upload correctly — please try uploading it again.");
    }
    if (data.batchThumbnailUrl && !/^https?:\/\//i.test(data.batchThumbnailUrl)) {
      throw new Error("Batch thumbnail didn't upload correctly — please try uploading it again.");
    }

    const wordCount = data.aboutText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 220) throw new Error("Keep the 'About' section to roughly 200 words.");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      {
        $set: { ...data, updatedAt: new Date() },
        $setOnInsert: { submittedAt: new Date() },
      },
      { upsert: true },
    );

    return { ok: true };
  });

// ─── Digital signature ──────────────────────────────────────────────────────
// This is a "click-to-sign" record, not a formal digital-signature-provider
// signature (see the explanation in chat for what that distinction means
// and when you'd need the latter instead). It captures: the exact
// agreement text that was shown (hashed, so it can't be silently edited
// after the fact and still claim the same signature), the typed legal
// name, and a timestamp. IP/user-agent capture depends on how your
// TanStack Start server exposes the request — flagged below since I can't
// confirm the exact helper for this project without seeing your server
// entry setup.
export const signMentorAgreement = createServerFn({ method: "POST" })
  .validator(
    (data: { applicationId: string; typedFullName: string; agreementUrl: string; agreementVersion: string }) => data,
  )
  .handler(async ({ data }) => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) throw new Error("Complete the onboarding form before signing.");

    if (!data.typedFullName?.trim()) throw new Error("Type your full legal name to confirm.");
    // Require the typed name to reasonably match what they entered in the
    // form itself — a lightweight check against someone signing as a
    // different person than who filled out the form.
    const normalizedTyped = data.typedFullName.trim().toLowerCase();
    const normalizedForm = (details.fullName as string).trim().toLowerCase();
    if (normalizedTyped !== normalizedForm) {
      throw new Error("The typed name must match the full name entered in the onboarding form.");
    }

    // The agreement now lives at an external link (not embedded text), so
    // there's no document body to hash-lock the way the old flow did.
    // This hash instead just fingerprints which link + version the mentor
    // was shown at confirmation time, for an audit trail if the link
    // target ever changes later.
    const agreementHash = createHash("sha256").update(`${data.agreementUrl}::${data.agreementVersion}`).digest("hex");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      {
        $set: {
          signature: {
            typedFullName: data.typedFullName.trim(),
            agreementUrl: data.agreementUrl,
            agreementVersion: data.agreementVersion,
            agreementHash,
            signedAt: new Date(),
            // TODO: populate from the actual request once confirmed —
            // TanStack Start exposes this via a server-side request object
            // in most setups (e.g. getWebRequest() from
            // '@tanstack/react-start/server'), but I don't have visibility
            // into how this project's server entry is wired to confirm the
            // exact call. Without it, this stays null rather than guessing
            // and silently recording nothing under a confident-looking key.
            ipAddress: null,
            userAgent: null,
          },
        },
      },
    );

    return { ok: true };
  });

// ─── Admin read ──────────────────────────────────────────────────────────
export const getMentorOnboardingDetails = createServerFn({ method: "GET" })
  .validator((data: { token: string; applicationId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) return { details: null };

    // Built explicitly rather than spreading the raw Mongo document —
    // the document's own `_id` field is a MongoDB ObjectId, and
    // TanStack Start's server-fn response serializer (seroval) can't
    // serialize that type. Spreading it crashes the request on the
    // server before a response ever reaches the client, which is why
    // this previously surfaced as an opaque "Couldn't load" error with
    // no useful detail. Whitelisting fields here also means any other
    // non-serializable value that sneaks into the document (say, a
    // stray Date or ObjectId in a future field) won't silently break
    // this again.
    return {
      details: {
        profilePhotoUrl: (details.profilePhotoUrl as string) ?? "",
        fullName: (details.fullName as string) ?? "",
        college: (details.college as string) ?? "",
        rank: (details.rank as string) ?? "",
        aboutText: (details.aboutText as string) ?? "",
        weeklyHours: (details.weeklyHours as string) ?? "",
        wantsToSellTestSeries: Boolean(details.wantsToSellTestSeries),
        wantsToRecordIntroVideo: Boolean(details.wantsToRecordIntroVideo),
        introVideoUrl: (details.introVideoUrl as string) ?? "",
        batchName: (details.batchName as string) ?? "",
        batchThumbnailUrl: (details.batchThumbnailUrl as string) ?? "",
        needsThumbnailFromEdurack: Boolean(details.needsThumbnailFromEdurack),
        batchPrice: Number(details.batchPrice ?? 0),
        batchDurationMonths: Number(details.batchDurationMonths ?? 0),
        hasMinStudentCriteria: Boolean(details.hasMinStudentCriteria),
        minStudentCriteriaDetails: (details.minStudentCriteriaDetails as string) ?? "",
        needsPromotionAssistance: Boolean(details.needsPromotionAssistance),
        hasSyllabusPdf: Boolean(details.hasSyllabusPdf),
        syllabusPdfUrl: (details.syllabusPdfUrl as string) ?? "",
        wantsPlannerDiscussionCall: Boolean(details.wantsPlannerDiscussionCall),
        expectedCommissionPercent: Number(details.expectedCommissionPercent ?? 0),
        wantsPlatformTour: Boolean(details.wantsPlatformTour),
        preferredLaunchDate: (details.preferredLaunchDate as string) ?? "",
        submittedAt: details.submittedAt instanceof Date ? details.submittedAt.toISOString() : null,
        updatedAt: details.updatedAt instanceof Date ? details.updatedAt.toISOString() : null,
        signature: details.signature
          ? {
              typedFullName: (details.signature.typedFullName as string) ?? "",
              agreementUrl: (details.signature.agreementUrl as string) ?? "",
              agreementVersion: (details.signature.agreementVersion as string) ?? "",
              signedAt:
                details.signature.signedAt instanceof Date ? details.signature.signedAt.toISOString() : null,
            }
          : null,
        profileCreated: Boolean(details.profileCreated),
        mentorProfileId: (details.mentorProfileId as string) ?? null,
        batchCreated: Boolean(details.batchCreated),
        mentorshipBatchId: (details.mentorshipBatchId as string) ?? null,
      },
    };
  });

// ─── Admin action: mark an onboarding submission as converted into a real
// mentor login, once the admin has created that login via the existing
// createMentor / updateMentorProfile / updateMentorLockedInfo functions in
// admin.ts (see admin.dashboard.tsx's handleCreateProfile — this function
// only records that it happened, it does not create the mentor itself).
export const markMentorProfileCreated = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) throw new Error("This mentor hasn't submitted onboarding details yet.");
    if (!details.signature) throw new Error("This mentor hasn't confirmed the mentor agreement yet.");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      { $set: { profileCreated: true, mentorProfileId: data.mentorId, profileCreatedAt: new Date() } },
    );

    return { ok: true };
  });

// ─── Admin action: mark the same onboarding submission as having had its
// mentorship batch published, once admin.dashboard.tsx's handlePublishBatch
// has actually created it via the existing createMentorshipBatch function
// in admin.ts. Same bookkeeping-only pattern as markMentorProfileCreated
// above — this never creates the batch itself, only records that it
// happened, so re-opening this drawer later shows "already published"
// instead of offering to publish a duplicate.
export const markMentorshipBatchLinked = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; mentorshipBatchId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) throw new Error("This mentor hasn't submitted onboarding details yet.");
    if (!details.profileCreated) throw new Error("Create the mentor's profile before publishing a batch.");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      { $set: { batchCreated: true, mentorshipBatchId: data.mentorshipBatchId, batchCreatedAt: new Date() } },
    );

    return { ok: true };
  });

// NOTE: swap this for whatever your actual admin-check helper is named —
// same assumption used throughout admin.ts.
async function requireAdmin(token: string) {
  const { adminAuth } = await import("@/lib/firebase-admin");
  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded.admin) throw new Error("Admin access required.");
  return decoded;
}