// Public-facing internship application form (/join-intern) submission,
// plus the admin-side review list. Same shape as mentor-applications.ts:
// deliberately NO auth check on submit — applicants don't have an account
// yet — writing into its own `internApplications` collection with status
// "pending" for an admin to review.
//
// This is intentionally a step BEFORE the existing pre-hire sandboxed
// trial (intern-trial.ts / TrialAssignment): today an admin has to already
// know a candidate's name+email to send them a sample task. This form is
// the missing public entry point that feeds that step — an admin reviews
// applications here, then uses "Send sample task" (createTrialAssignment
// in intern-trial.ts) for whoever looks promising.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";
import { sendMail } from "@/lib/mailer";
import {
  internApplicationReceivedEmailHtml,
  internApplicationAdvancedEmailHtml,
  internApplicationRejectedEmailHtml,
} from "@/lib/intern-email-templates";

async function requireSuperAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

export type InternApplicationStatus = "pending" | "reviewing" | "invited_to_trial" | "rejected";

type InternApplicationInput = {
  fullName: string;
  email: string;
  phone: string;
  experience: string;
  // Populated client-side after an optional resume/portfolio file has
  // already been uploaded to Supabase (see intern-application-upload.ts) —
  // this server function only ever sees the resulting URL, never the file
  // itself. Both fields are optional: a candidate may link a portfolio,
  // upload a resume, do both, or skip this section entirely.
  resumeUrl: string | null;
  portfolioUrl: string | null;
};

// ─── Public: submit an application ───────────────────────────────────────
export const submitInternApplication = createServerFn({ method: "POST" })
  .validator((data: InternApplicationInput) => data)
  .handler(async ({ data }) => {
    if (!data.fullName?.trim()) throw new Error("Full name is required.");
    if (!/^\S+@\S+\.\S+$/.test(data.email ?? "")) throw new Error("A valid email is required.");
    if (!data.experience?.trim()) throw new Error("Tell us a bit about your experience.");

    const portfolioUrl = data.portfolioUrl?.trim() || null;
    if (portfolioUrl && !/^https?:\/\/\S+\.\S+/i.test(portfolioUrl)) {
      throw new Error("Portfolio link doesn't look like a valid URL.");
    }

    const db = await getDb();

    const result = await db.collection("internApplications").insertOne({
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim() || null,
      experience: data.experience.trim(),
      resumeUrl: data.resumeUrl?.trim() || null,
      portfolioUrl,
      status: "pending" as InternApplicationStatus,
      submittedAt: new Date(),
    });

    // Best-effort receipt email — the application is already saved above
    // regardless of whether this succeeds, same pattern as every other
    // "confirm to an address we don't control" send in this app.
    let emailSent = false;
    try {
      await sendMail({
        to: data.email.trim(),
        subject: "We've received your Edurack internship application",
        html: internApplicationReceivedEmailHtml({ candidateName: data.fullName.trim() }),
      });
      emailSent = true;
    } catch (err) {
      console.error(`[submitInternApplication] receipt email failed for applicationId=${result.insertedId}:`, err);
    }

    return { ok: true, applicationId: String(result.insertedId), emailSent };
  });

// ─── Admin: list applications ─────────────────────────────────────────────
export const listInternApplications = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();

    const rows = await db.collection("internApplications").find({}).sort({ submittedAt: -1 }).toArray();

    return {
      applications: rows.map((r) => ({
        id: String(r._id),
        fullName: r.fullName as string,
        email: r.email as string,
        phone: (r.phone as string) ?? null,
        experience: r.experience as string,
        resumeUrl: (r.resumeUrl as string) ?? null,
        portfolioUrl: (r.portfolioUrl as string) ?? null,
        status: (r.status as InternApplicationStatus) ?? "pending",
        rejectionReason: (r.rejectionReason as string) ?? null,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : null,
      })),
    };
  });

// ─── Admin: move an application to "pending" or "reviewing" ─────────────
// Silent, internal-only states — no email to the candidate for either.
// Advancing ("invited_to_trial") and rejecting are their own functions
// below because both need to send an email, and rejecting needs a reason.
export const updateInternApplicationStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; status: "pending" | "reviewing" }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db
      .collection("internApplications")
      .updateOne({ _id: new ObjectId(data.applicationId) }, { $set: { status: data.status } });
    if (result.matchedCount === 0) throw new Error("Application not found.");

    return { ok: true };
  });

// ─── Admin: advance an application to the sample-task stage ─────────────
// Sends the candidate a "you're moving forward" email — this is separate
// from the actual sample-task email (internTrialInviteEmailHtml), which
// is sent later when the admin creates the TrialAssignment itself from
// the "Intern Trials" tab. Email is best-effort: the status is already
// saved above regardless of whether it succeeds.
export const advanceInternApplication = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("internApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    await db
      .collection("internApplications")
      .updateOne({ _id: new ObjectId(data.applicationId) }, { $set: { status: "invited_to_trial" as InternApplicationStatus } });

    let emailSent = false;
    if (app.email) {
      try {
        await sendMail({
          to: app.email as string,
          subject: "You're moving forward in the Edurack internship process 🎉",
          html: internApplicationAdvancedEmailHtml({ candidateName: app.fullName as string }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[advanceInternApplication] email failed for applicationId=${data.applicationId}:`, err);
      }
    }

    return { ok: true, emailSent };
  });

// ─── Admin: reject an application, with a reason ─────────────────────────
// Mirrors rejectCreatorApplication in admin.ts — a reason is required, and
// it's included verbatim in the email sent to the candidate.
export const rejectInternApplication = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; reason: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    if (!data.reason?.trim()) throw new Error("A rejection reason is required.");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("internApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    await db.collection("internApplications").updateOne(
      { _id: new ObjectId(data.applicationId) },
      { $set: { status: "rejected" as InternApplicationStatus, rejectionReason: data.reason.trim() } },
    );

    let emailSent = false;
    if (app.email) {
      try {
        await sendMail({
          to: app.email as string,
          subject: "An update on your Edurack internship application",
          html: internApplicationRejectedEmailHtml({
            candidateName: app.fullName as string,
            reason: data.reason.trim(),
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[rejectInternApplication] email failed for applicationId=${data.applicationId}:`, err);
      }
    }

    return { ok: true, emailSent };
  });