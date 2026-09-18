// Intern-facing task + draft workflow. Every handler re-verifies the
// caller owns the task/draft it's touching — a taskId or draftId alone in
// the request body is never trusted to belong to the caller, same rule
// test-engine.ts applies to test access.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { requireIntern } from "./intern-auth";
import type { InternQuestionDraftInput } from "@/lib/intern-types";

async function loadOwnedTask(db: any, internId: string, taskId: string) {
  const { ObjectId } = await import("mongodb");
  const task = await db.collection("internTasks").findOne({ _id: new ObjectId(taskId) });
  if (!task || String(task.internId) !== internId) throw new Error("Task not found.");
  return task;
}

// ─── Tasks ────────────────────────────────────────────────────────────────
export const getMyTasks = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    const tasks = await db
      .collection("internTasks")
      .find({ internId })
      .sort({ assignedAt: -1 })
      .toArray();

    // Batch-fetch bundle titles + test names rather than one query per task.
    const bundleIds = [...new Set(tasks.map((t) => String(t.bundleId)))];
    const testIds = [...new Set(tasks.map((t) => String(t.testId)))];
    const [bundles, testCores] = await Promise.all([
      db.collection("bundles").find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } }).toArray(),
      db.collection("testCores").find({ _id: { $in: testIds.map((id) => new ObjectId(id)) } }).toArray(),
    ]);
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
    const testNameById = new Map(testCores.map((t) => [String(t._id), t.name as string]));

    return {
      tasks: tasks.map((t) => ({
        id: String(t._id),
        internId: t.internId as string,
        bundleId: String(t.bundleId),
        bundleTitle: bundleTitleById.get(String(t.bundleId)) ?? "Unknown bundle",
        testId: String(t.testId),
        testName: testNameById.get(String(t.testId)) ?? "Unknown test",
        subject: t.subject as string,
        targetCount: t.targetCount as number,
        instructions: (t.instructions as string) ?? "",
        referencePdfUrl: (t.referencePdfUrl as string | null) ?? null,
        dueDate: (t.dueDate as string | null) ?? null,
        status: (t.status as string) ?? "assigned",
        assignedAt: t.assignedAt instanceof Date ? t.assignedAt.toISOString() : null,
      })),
    };
  });

// Live progress: draftCount/submittedCount come from the intern's own
// drafts; approvedCount is queried against the REAL `questions` collection
// (the source of truth), never against a stored counter, so it can never
// drift from what's actually live.
export const getTaskProgress = createServerFn({ method: "POST" })
  .validator((data: { token: string; taskId: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const db = await getDb();
    const task = await loadOwnedTask(db, internId, data.taskId);

    const [draftCount, submittedCount, approvedCount] = await Promise.all([
      db
        .collection("internQuestionDrafts")
        .countDocuments({ taskId: data.taskId, status: { $in: ["draft", "rejected"] } }),
      db.collection("internQuestionDrafts").countDocuments({ taskId: data.taskId, status: "submitted" }),
      db.collection("questions").countDocuments({ testId: String(task.testId), subject: task.subject }),
    ]);

    return {
      progress: {
        taskId: data.taskId,
        targetCount: task.targetCount as number,
        draftCount,
        submittedCount,
        approvedCount,
      },
    };
  });

// ─── Drafts ───────────────────────────────────────────────────────────────
export const getTaskDrafts = createServerFn({ method: "POST" })
  .validator((data: { token: string; taskId: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const db = await getDb();
    await loadOwnedTask(db, internId, data.taskId);

    const drafts = await db
      .collection("internQuestionDrafts")
      .find({ taskId: data.taskId })
      .sort({ createdAt: 1 })
      .toArray();

    return {
      drafts: drafts.map((d) => ({
        id: String(d._id),
        internId: d.internId as string,
        taskId: d.taskId as string,
        bundleId: d.bundleId as string,
        testId: d.testId as string,
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
        reviewedAt: d.reviewedAt instanceof Date ? d.reviewedAt.toISOString() : null,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : null,
        updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : null,
      })),
    };
  });

function validateDraftInput(input: InternQuestionDraftInput) {
  if (!input.body.trim()) throw new Error("Enter the question body.");
  if (input.type === "mcq") {
    const opts = input.options;
    if (!opts || !opts.A.trim() || !opts.B.trim() || !opts.C.trim() || !opts.D.trim()) {
      throw new Error("All four options (A–D) must be filled in.");
    }
    if (!input.correctOption) throw new Error("Mark the correct option.");
  } else {
    if (input.correctAnswer === undefined || Number.isNaN(input.correctAnswer)) {
      throw new Error("Enter a valid numeric answer.");
    }
  }
  if (!input.solution.trim()) throw new Error("Enter the step-by-step solution.");
  if (input.isPYQ && !input.pyqYear?.trim()) {
    throw new Error("Enter the PYQ year, or uncheck 'Previous Year Question'.");
  }
}

// Creates a new draft in "draft" status.
export const createDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; taskId: string; draft: InternQuestionDraftInput }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const db = await getDb();
    const task = await loadOwnedTask(db, internId, data.taskId);
    validateDraftInput(data.draft);

    const now = new Date();
    const result = await db.collection("internQuestionDrafts").insertOne({
      internId,
      taskId: data.taskId,
      bundleId: String(task.bundleId),
      testId: String(task.testId),
      subject: task.subject as string,
      ...data.draft,
      status: "draft",
      adminFeedback: null,
      rejectionCount: 0,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, draftId: String(result.insertedId) };
  });

// Edits are only allowed while the draft hasn't left the intern's hands —
// "draft" (never submitted) or "rejected" (bounced back, editing here
// implicitly moves it back to "draft" so it must be resubmitted). A
// "submitted" or "approved" draft is immutable to the intern — the review
// queue and the live `questions` collection are the only things allowed
// to move it forward from there.
export const updateDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; draftId: string; draft: InternQuestionDraftInput }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const existing = await db.collection("internQuestionDrafts").findOne({ _id: new ObjectId(data.draftId) });
    if (!existing || String(existing.internId) !== internId) throw new Error("Draft not found.");
    if (!["draft", "rejected"].includes(existing.status as string)) {
      throw new Error("This draft is awaiting review and can't be edited right now.");
    }
    validateDraftInput(data.draft);

    await db.collection("internQuestionDrafts").updateOne(
      { _id: new ObjectId(data.draftId) },
      {
        $set: {
          ...data.draft,
          status: "draft",
          adminFeedback: existing.adminFeedback, // kept visible so the intern can see what they were fixing
          updatedAt: new Date(),
        },
      },
    );
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; draftId: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const existing = await db.collection("internQuestionDrafts").findOne({ _id: new ObjectId(data.draftId) });
    if (!existing || String(existing.internId) !== internId) throw new Error("Draft not found.");
    if (!["draft", "rejected"].includes(existing.status as string)) {
      throw new Error("Can't delete a draft that's already been submitted or approved.");
    }
    await db.collection("internQuestionDrafts").deleteOne({ _id: new ObjectId(data.draftId) });
    return { ok: true };
  });

// Submits one or more of the intern's own "draft"/"rejected" drafts into
// the admin review queue. Silently skips any id that isn't owned by this
// intern or isn't in an editable state, rather than failing the whole
// batch over one bad id.
export const submitDrafts = createServerFn({ method: "POST" })
  .validator((data: { token: string; draftIds: string[] }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("internQuestionDrafts").updateMany(
      {
        _id: { $in: data.draftIds.map((id) => new ObjectId(id)) },
        internId,
        status: { $in: ["draft", "rejected"] },
      },
      { $set: { status: "submitted", updatedAt: new Date() } },
    );

    return { ok: true, submittedCount: result.modifiedCount };
  });
// ─── Profile & report ─────────────────────────────────────────────────────
// Everything the intern's Profile page needs in one round trip: identity +
// internship dates, offer letter, certificate lock state, and a
// performance report built entirely from the immutable internReviewEvents
// log (written once per decision in admin-interns.ts, never mutated) —
// not from the live internTasks/internQuestionDrafts documents, so a task
// or draft changing later can't quietly rewrite someone's history.
export const getMyProfileReport = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern) throw new Error("Intern account not found.");

    const [tasks, events] = await Promise.all([
      db.collection("internTasks").find({ internId }).sort({ assignedAt: -1 }).toArray(),
      db.collection("internReviewEvents").find({ internId }).toArray(),
    ]);

    const bundleIds = [...new Set(tasks.map((t) => String(t.bundleId)))];
    const testIds = [...new Set(tasks.map((t) => String(t.testId)))];
    const [bundles, testCores] = await Promise.all([
      bundleIds.length
        ? db.collection("bundles").find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } }).toArray()
        : [],
      testIds.length
        ? db.collection("testCores").find({ _id: { $in: testIds.map((id) => new ObjectId(id)) } }).toArray()
        : [],
    ]);
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
    const testNameById = new Map(testCores.map((t) => [String(t._id), t.name as string]));

    const approvedByTask = new Map<string, number>();
    const rejectedByTask = new Map<string, number>();
    let totalApproved = 0;
    let totalMistakes = 0;
    for (const e of events) {
      const taskId = e.taskId as string;
      if (e.decision === "approved") {
        approvedByTask.set(taskId, (approvedByTask.get(taskId) ?? 0) + 1);
        totalApproved++;
      } else {
        rejectedByTask.set(taskId, (rejectedByTask.get(taskId) ?? 0) + 1);
        totalMistakes++;
      }
    }

    const taskBreakdown = tasks.map((t) => {
      const taskId = String(t._id);
      const approvedCount = approvedByTask.get(taskId) ?? 0;
      const rejectionCount = rejectedByTask.get(taskId) ?? 0;
      return {
        taskId,
        bundleTitle: bundleTitleById.get(String(t.bundleId)) ?? "Unknown bundle",
        testName: testNameById.get(String(t.testId)) ?? "Unknown test",
        subject: t.subject as string,
        targetCount: t.targetCount as number,
        approvedCount,
        rejectionCount,
        completed: approvedCount >= (t.targetCount as number),
      };
    });

    const tasksCompleted = taskBreakdown.filter((t) => t.completed).length;
    const totalReviewed = totalApproved + totalMistakes;
    const accuracyPercent = totalReviewed > 0 ? Math.round((totalApproved / totalReviewed) * 100) : null;

    // ─── Certificate lock state ──────────────────────────────────────────
    const certificateUrl = (intern.certificateUrl as string | null) ?? null;
    const unlockDate = (intern.certificateUnlockDate as string | null) ?? null;
    const now = new Date();
    const unlocked = Boolean(certificateUrl) && Boolean(unlockDate) && new Date(unlockDate!) <= now;
    const daysRemaining =
      certificateUrl && unlockDate && !unlocked
        ? Math.max(0, Math.ceil((new Date(unlockDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

    return {
      report: {
        profile: {
          name: intern.name as string,
          username: intern.username as string,
          email: intern.email as string,
          profilePictureUrl: (intern.profilePictureUrl as string | null) ?? null,
          internshipStartDate: (intern.internshipStartDate as string | null) ?? null,
          internshipEndDate: (intern.internshipEndDate as string | null) ?? null,
        },
        offerLetter: intern.offerLetterUrl
          ? {
              url: intern.offerLetterUrl as string,
              uploadedAt: intern.offerLetterUploadedAt instanceof Date ? intern.offerLetterUploadedAt.toISOString() : null,
            }
          : null,
        certificate: {
          uploaded: Boolean(certificateUrl),
          unlocked,
          unlockDate,
          daysRemaining,
          url: unlocked ? certificateUrl : null,
        },
        stats: {
          tasksAssigned: tasks.length,
          tasksCompleted,
          totalApproved,
          totalMistakes,
          accuracyPercent,
        },
        taskBreakdown,
      },
    };
  });
