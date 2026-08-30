// Post-approval mentor onboarding: the detailed onboarding form filled in
// after an application is approved (see mentor-applications.ts /
// admin.ts's approveCreatorApplication), plus scheduling the live
// Google Meet call where the agreement is walked through and signed.
// Deliberately public (no auth token check beyond validating the
// applicationId + its approved status) — at this stage the mentor doesn't
// have a platform account yet, same reasoning as submitCreatorApplication.
//
// Profile photo is uploaded directly from the browser to Supabase Storage
// (see @/lib/supabase.ts and the wizard component) — this server function
// only ever receives the resulting public URL, never the raw file. Size
// limits are enforced client-side before the upload starts; the bucket's
// own "file size limit" setting (set in the Supabase dashboard, see
// @/lib/supabase.ts) is the actually-enforced backstop.
//
// Batch thumbnails are no longer mentor-uploaded — EDURACK designs every
// thumbnail before a batch goes live, so there's nothing to collect or
// store here for that anymore.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";

// Fixed platform terms — not mentor-editable. Kept as named constants so
// the wizard, its validation, and this file all read from one source
// instead of drifting out of sync with each other.
export const FIXED_COMMISSION_PERCENT = 15;
export const MIN_WEEKLY_HOURS = 4;
export const MIN_BATCH_DURATION_MONTHS = 4;
// Promotion commission a mentor can offer EDURACK on top of the fixed
// platform commission, if they opt into promotion assistance. Mirrored by
// the slider in the wizard's Materials & Promotion step.
export const MIN_PROMOTION_PERCENT = 10;
export const MAX_PROMOTION_PERCENT = 40;

type MentorOnboardingInput = {
  applicationId: string;
  profilePhotoUrl: string;
  fullName: string;
  college: string;
  rank: string;
  aboutText: string;
  weeklyHours: number;
  wantsToSellTestSeries: boolean;
  wantsToRecordIntroVideo: boolean;
  batchName: string;
  batchPrice: number;
  batchDurationMonths: number;
  hasMinStudentCriteria: boolean;
  minStudentCriteriaDetails: string;
  needsPromotionAssistance: boolean;
  promotionPercent: number;
  syllabusPdfUrl: string;
  plannerPdfUrl: string;
  wantsPlannerDiscussionCall: boolean;
  commissionAgreed: boolean;
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
      // Drives the route's "submitted" phase — once a mentor has picked a
      // Meet date, re-visiting the link shouldn't show the wizard again.
      alreadyRequestedMeeting: Boolean(existingDetails?.meetingRequest),
    };
  });

// ─── Draft-safe submit: upserts, so a mentor can come back and resubmit
// before requesting a call (submittedAt/updatedAt track this) without
// creating dupes. This is the authoritative validation layer — the wizard
// enforces the same minimums (weekly hours, batch duration, promotion %,
// commission agreement) for a good UX, but a request that skips the
// client can't skip these checks. ─
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

    if (!data.weeklyHours || data.weeklyHours < MIN_WEEKLY_HOURS) {
      throw new Error(`Weekly time commitment must be at least ${MIN_WEEKLY_HOURS} hours.`);
    }
    if (!data.batchDurationMonths || data.batchDurationMonths < MIN_BATCH_DURATION_MONTHS) {
      throw new Error(`Batch duration must be at least ${MIN_BATCH_DURATION_MONTHS} months.`);
    }
    if (!data.commissionAgreed) {
      throw new Error(`You must agree to the platform's fixed ${FIXED_COMMISSION_PERCENT}% commission rate.`);
    }
    if (data.needsPromotionAssistance) {
      if (
        !data.promotionPercent ||
        data.promotionPercent < MIN_PROMOTION_PERCENT ||
        data.promotionPercent > MAX_PROMOTION_PERCENT
      ) {
        throw new Error(
          `Promotion commission must be between ${MIN_PROMOTION_PERCENT}% and ${MAX_PROMOTION_PERCENT}%.`,
        );
      }
    }

    // Comes in as a Supabase Storage public URL from the wizard's
    // file-upload flow, not a hand-typed link — a quick shape check
    // catches anything that slipped through as plain text instead of an
    // actual upload.
    if (data.profilePhotoUrl && !/^https?:\/\//i.test(data.profilePhotoUrl)) {
      throw new Error("Profile photo didn't upload correctly — please try uploading it again.");
    }
    if (data.syllabusPdfUrl && !/^https?:\/\//i.test(data.syllabusPdfUrl)) {
      throw new Error("Syllabus PDF didn't upload correctly — please try uploading it again.");
    }
    if (data.plannerPdfUrl && !/^https?:\/\//i.test(data.plannerPdfUrl)) {
      throw new Error("Planner PDF didn't upload correctly — please try uploading it again.");
    }

    const wordCount = data.aboutText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 220) throw new Error("Keep the 'About' section to roughly 200 words.");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      {
        $set: {
          ...data,
          promotionPercent: data.needsPromotionAssistance ? data.promotionPercent : 0,
          commissionPercent: FIXED_COMMISSION_PERCENT, // recorded explicitly, never mentor-set
          updatedAt: new Date(),
        },
        $setOnInsert: { submittedAt: new Date() },
      },
      { upsert: true },
    );

    return { ok: true };
  });

// ─── Meeting request ────────────────────────────────────────────────────
// Replaces the old typed-signature flow: instead of signing on their own,
// the mentor just picks a date they're free for a Google Meet call, where
// the EDURACK team walks through the Mentor Agreement and signs it with
// them live. This just records that preference and a timestamp.
export const requestMentorAgreementMeeting = createServerFn({ method: "POST" })
  .validator((data: { applicationId: string; preferredMeetDate: string }) => data)
  .handler(async ({ data }) => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) throw new Error("Complete the onboarding form before requesting a call.");

    if (!data.preferredMeetDate?.trim()) throw new Error("Pick a date you're free for the Google Meet call.");

    await db.collection("mentorOnboardingDetails").updateOne(
      { applicationId: data.applicationId },
      {
        $set: {
          meetingRequest: {
            preferredMeetDate: data.preferredMeetDate,
            requestedAt: new Date(),
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

    // Built explicitly rather than spreading the raw Mongo document — the
    // document's own `_id` is a MongoDB ObjectId, which the server-fn
    // response serializer (seroval) can't serialize. Whitelisting fields
    // here also protects against any other non-serializable value that
    // sneaks into the document later.
    return {
      details: {
        profilePhotoUrl: (details.profilePhotoUrl as string) ?? "",
        fullName: (details.fullName as string) ?? "",
        college: (details.college as string) ?? "",
        rank: (details.rank as string) ?? "",
        aboutText: (details.aboutText as string) ?? "",
        weeklyHours: Number(details.weeklyHours ?? 0),
        wantsToSellTestSeries: Boolean(details.wantsToSellTestSeries),
        wantsToRecordIntroVideo: Boolean(details.wantsToRecordIntroVideo),
        batchName: (details.batchName as string) ?? "",
        batchPrice: Number(details.batchPrice ?? 0),
        batchDurationMonths: Number(details.batchDurationMonths ?? 0),
        hasMinStudentCriteria: Boolean(details.hasMinStudentCriteria),
        minStudentCriteriaDetails: (details.minStudentCriteriaDetails as string) ?? "",
        needsPromotionAssistance: Boolean(details.needsPromotionAssistance),
        promotionPercent: Number(details.promotionPercent ?? 0),
        syllabusPdfUrl: (details.syllabusPdfUrl as string) ?? "",
        plannerPdfUrl: (details.plannerPdfUrl as string) ?? "",
        wantsPlannerDiscussionCall: Boolean(details.wantsPlannerDiscussionCall),
        commissionPercent: Number(details.commissionPercent ?? FIXED_COMMISSION_PERCENT),
        commissionAgreed: Boolean(details.commissionAgreed),
        wantsPlatformTour: Boolean(details.wantsPlatformTour),
        preferredLaunchDate: (details.preferredLaunchDate as string) ?? "",
        submittedAt: details.submittedAt instanceof Date ? details.submittedAt.toISOString() : null,
        updatedAt: details.updatedAt instanceof Date ? details.updatedAt.toISOString() : null,
        meetingRequest: details.meetingRequest
          ? {
              preferredMeetDate: (details.meetingRequest.preferredMeetDate as string) ?? "",
              requestedAt:
                details.meetingRequest.requestedAt instanceof Date
                  ? details.meetingRequest.requestedAt.toISOString()
                  : null,
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
// Gated on a meeting request existing (rather than a signature, since
// signing now happens live on the call, not through this flow) so a
// profile can't be created for someone who never got as far as scheduling
// that call.
export const markMentorProfileCreated = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const details = await db.collection("mentorOnboardingDetails").findOne({ applicationId: data.applicationId });
    if (!details) throw new Error("This mentor hasn't submitted onboarding details yet.");
    if (!details.meetingRequest) throw new Error("This mentor hasn't requested their agreement call yet.");

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