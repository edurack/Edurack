// Admin-side of the intern program: task assignment + the review queue
// that turns an approved draft into a real, live `questions` document.
// requireSuperAdmin duplicated per the mentor-auth.ts/promoter-auth.ts
// convention (keep each identity/domain file independent).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";
import type { InternTaskInput } from "@/lib/intern-types";
import { sendMail } from "@/lib/mailer";
import {
  internTaskAssignedEmailHtml,
  internDraftApprovedEmailHtml,
  internDraftRejectedEmailHtml,
} from "@/lib/intern-email-templates";

async function requireSuperAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// ─── Assign a task ────────────────────────────────────────────────────────
// Emails the intern immediately with the subject, instructions, target
// count, and (if provided) a link to the reference document — same
// best-effort pattern as approveCreatorApplication in admin.ts: the task
// row is already saved above, so a mail failure never rolls it back, it's
// just logged.
export const assignInternTask = createServerFn({ method: "POST" })
  .validator((data: { token: string; task: InternTaskInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    const { internId, bundleId, testId, subject, targetCount, instructions, referencePdfUrl, dueDate } = data.task;
    if (!internId) throw new Error("Select an intern.");
    if (!bundleId || !testId || !subject) throw new Error("Select a bundle, test, and subject.");
    if (!targetCount || targetCount < 1) throw new Error("Enter a target question count of at least 1.");

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern || intern.status !== "active") throw new Error("That intern isn't active.");

    const result = await db.collection("internTasks").insertOne({
      internId,
      bundleId,
      testId,
      subject,
      targetCount,
      instructions: instructions.trim(),
      referencePdfUrl: referencePdfUrl?.trim() || null,
      dueDate: dueDate ?? null,
      status: "assigned",
      assignedAt: new Date(),
    });

    let emailSent = false;
    if (intern.email) {
      const appUrl = process.env.APP_URL;
      const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/dashboard` : "";
      try {
        await sendMail({
          to: intern.email as string,
          subject: `New task: ${subject}`,
          html: internTaskAssignedEmailHtml({
            internName: intern.name as string,
            subject,
            targetCount,
            instructions: instructions.trim(),
            referencePdfUrl: referencePdfUrl?.trim() || null,
            dashboardUrl,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[assignInternTask] email failed for internId=${internId}:`, err);
      }
    } else {
      console.warn(`[assignInternTask] no email on file for internId=${internId}, skipping notification`);
    }

    return { ok: true, taskId: String(result.insertedId), emailSent };
  });

export const listTasksForIntern = createServerFn({ method: "POST" })
  .validator((data: { token: string; internId: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();
    const tasks = await db
      .collection("internTasks")
      .find({ internId: data.internId })
      .sort({ assignedAt: -1 })
      .toArray();
    return {
      tasks: tasks.map((t) => ({
        id: String(t._id),
        bundleId: String(t.bundleId),
        testId: String(t.testId),
        subject: t.subject as string,
        targetCount: t.targetCount as number,
        instructions: (t.instructions as string) ?? "",
        status: t.status as string,
        assignedAt: t.assignedAt instanceof Date ? t.assignedAt.toISOString() : null,
      })),
    };
  });

// ─── Review queue ─────────────────────────────────────────────────────────
// Every "submitted" draft across every intern, oldest first, with enough
// intern/bundle/test context that admin doesn't have to open a second
// screen to know what they're looking at.
export const listSubmittedDrafts = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    const drafts = await db
      .collection("internQuestionDrafts")
      .find({ status: "submitted" })
      .sort({ updatedAt: 1 })
      .toArray();
    if (drafts.length === 0) return { drafts: [] };

    const internIds = [...new Set(drafts.map((d) => String(d.internId)))];
    const bundleIds = [...new Set(drafts.map((d) => String(d.bundleId)))];
    const testIds = [...new Set(drafts.map((d) => String(d.testId)))];

    const [interns, bundles, testCores] = await Promise.all([
      db.collection("interns").find({ _id: { $in: internIds.map((id) => new ObjectId(id)) } }).toArray(),
      db.collection("bundles").find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } }).toArray(),
      db.collection("testCores").find({ _id: { $in: testIds.map((id) => new ObjectId(id)) } }).toArray(),
    ]);
    const internById = new Map(interns.map((i) => [String(i._id), i]));
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
    const testNameById = new Map(testCores.map((t) => [String(t._id), t.name as string]));

    return {
      drafts: drafts.map((d) => {
        const intern = internById.get(String(d.internId));
        return {
          id: String(d._id),
          internId: d.internId as string,
          internName: (intern?.name as string) ?? "Unknown",
          internUsername: (intern?.username as string) ?? "",
          taskId: d.taskId as string,
          bundleId: String(d.bundleId),
          bundleTitle: bundleTitleById.get(String(d.bundleId)) ?? "Unknown bundle",
          testId: String(d.testId),
          testName: testNameById.get(String(d.testId)) ?? "Unknown test",
          subject: d.subject as string,
          body: d.body as string,
          type: d.type as "mcq" | "integer",
          options: d.options,
          correctOption: d.correctOption,
          correctAnswer: d.correctAnswer,
          solution: d.solution as string,
          difficulty: d.difficulty as "Easy" | "Medium" | "Hard",
          isPYQ: Boolean(d.isPYQ),
          pyqYear: d.pyqYear,
          status: d.status as string,
          adminFeedback: (d.adminFeedback as string | null) ?? null,
          reviewedAt: null,
          createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : null,
          updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : null,
        };
      }),
    };
  });

// Approves a draft: recomputes the real next questionNo against the live
// `questions` collection (never trusts anything client-supplied or
// draft-local for numbering — same rule question-ingestion-module.tsx's
// server side already follows) and inserts it as a real Question document
// matching admin-types.ts's shape exactly.
export const approveDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; draftId: string; adminFeedback?: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const draft = await db.collection("internQuestionDrafts").findOne({ _id: new ObjectId(data.draftId) });
    if (!draft) throw new Error("Draft not found.");
    if (draft.status !== "submitted") throw new Error("This draft isn't awaiting review.");

    const existingCount = await db
      .collection("questions")
      .countDocuments({ testId: draft.testId, subject: draft.subject });
    const questionNo = existingCount + 1;

    await db.collection("questions").insertOne({
      bundleId: draft.bundleId,
      testId: draft.testId,
      subject: draft.subject,
      questionNo,
      body: draft.body,
      type: draft.type,
      ...(draft.type === "mcq"
        ? { options: draft.options, correctOption: draft.correctOption }
        : { correctAnswer: draft.correctAnswer }),
      solution: draft.solution,
      difficulty: draft.difficulty,
      isPYQ: draft.isPYQ,
      ...(draft.isPYQ ? { pyqYear: draft.pyqYear } : {}),
      createdAt: new Date(),
      // Kept for traceability back to who actually wrote this question —
      // harmless extra field, ignored by anything reading admin-types.ts's
      // Question shape.
      ingestedByInternId: draft.internId,
    });

    await db.collection("internQuestionDrafts").updateOne(
      { _id: new ObjectId(data.draftId) },
      {
        $set: {
          status: "approved",
          adminFeedback: data.adminFeedback?.trim() || null,
          reviewedAt: new Date(),
        },
      },
    );

    // Immutable audit trail for the intern's Profile report — inserted
    // regardless of whatever later happens to the draft document itself
    // (it could theoretically be deleted downstream), so lifetime stats
    // never silently drift. See getMyProfileReport in intern-portal.ts.
    await db.collection("internReviewEvents").insertOne({
      internId: draft.internId,
      taskId: draft.taskId,
      draftId: data.draftId,
      decision: "approved",
      subject: draft.subject,
      createdAt: new Date(),
    });

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(draft.internId as string) });
    if (intern?.email) {
      const appUrl = process.env.APP_URL;
      const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/dashboard` : "";
      try {
        await sendMail({
          to: intern.email as string,
          subject: `Approved: your ${draft.subject as string} question is live`,
          html: internDraftApprovedEmailHtml({
            internName: intern.name as string,
            subject: draft.subject as string,
            questionNo,
            dashboardUrl,
          }),
        });
      } catch (err) {
        console.error(`[approveDraft] email failed for internId=${String(draft.internId)}:`, err);
      }
    }

    return { ok: true, questionNo };
  });

// Rejects a draft with required feedback — bounces it back to the intern,
// who can edit (moves it back to "draft") and resubmit.
export const rejectDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; draftId: string; adminFeedback: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    if (!data.adminFeedback.trim()) throw new Error("Add a reason so the intern knows what to fix.");

    const draft = await db.collection("internQuestionDrafts").findOne({ _id: new ObjectId(data.draftId) });
    if (!draft) throw new Error("Draft not found.");
    if (draft.status !== "submitted") throw new Error("This draft isn't awaiting review.");

    await db.collection("internQuestionDrafts").updateOne(
      { _id: new ObjectId(data.draftId) },
      {
        $set: {
          status: "rejected",
          adminFeedback: data.adminFeedback.trim(),
          reviewedAt: new Date(),
        },
        $inc: { rejectionCount: 1 },
      },
    );

    // Same immutable audit trail as approveDraft above — a rejection
    // counts as a "mistake" for the intern's report forever, even if they
    // later fix and resubmit the same draft to a successful approval.
    await db.collection("internReviewEvents").insertOne({
      internId: draft.internId,
      taskId: draft.taskId,
      draftId: data.draftId,
      decision: "rejected",
      subject: draft.subject,
      createdAt: new Date(),
    });

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(draft.internId as string) });
    if (intern?.email) {
      const appUrl = process.env.APP_URL;
      const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/dashboard` : "";
      try {
        await sendMail({
          to: intern.email as string,
          subject: `Feedback on your ${draft.subject as string} question`,
          html: internDraftRejectedEmailHtml({
            internName: intern.name as string,
            subject: draft.subject as string,
            feedback: data.adminFeedback.trim(),
            dashboardUrl,
          }),
        });
      } catch (err) {
        console.error(`[rejectDraft] email failed for internId=${String(draft.internId)}:`, err);
      }
    }

    return { ok: true };
  });