// Pre-hire sandboxed evaluation — fully isolated from the real intern
// system (no `interns` account, no `internTasks`, no bundle/test/questions
// access at all). A candidate gets a single-use link
// (/intern/trial/$code); the code itself is the only credential, no
// password. Admin reviews the submission and decides whether to actually
// send a real invite (createInternInvite in intern-auth.ts) — that hand-off
// is a manual admin action, deliberately not automatic, since scoring a
// candidate is a judgment call.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";
import type { TrialAssignmentInput, TrialQuestionAnswer, TrialReviewInput } from "@/lib/intern-types";

async function requireSuperAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

function toView(t: any) {
  return {
    id: String(t._id),
    code: t.code as string,
    candidateName: t.candidateName as string,
    candidateEmail: t.candidateEmail as string,
    subjectLabel: t.subjectLabel as string,
    instructions: t.instructions as string,
    sampleCount: t.sampleCount as number,
    status: t.status as string,
    answers: (t.answers as TrialQuestionAnswer[]) ?? [],
    reviewScore: (t.reviewScore as number | null) ?? null,
    reviewNotes: (t.reviewNotes as string | null) ?? null,
    reviewDecision: (t.reviewDecision as "advance" | "reject" | null) ?? null,
    submittedAt: t.submittedAt instanceof Date ? t.submittedAt.toISOString() : null,
    reviewedAt: t.reviewedAt instanceof Date ? t.reviewedAt.toISOString() : null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : null,
  };
}

// ─── Admin: create + manage trial links ──────────────────────────────────
export const createTrialAssignment = createServerFn({ method: "POST" })
  .validator((data: { token: string; assignment: TrialAssignmentInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { randomBytes } = await import("node:crypto");
    const db = await getDb();

    const { candidateName, candidateEmail, subjectLabel, instructions, sampleCount } = data.assignment;
    if (!candidateName.trim()) throw new Error("Enter the candidate's name.");
    if (!candidateEmail.includes("@")) throw new Error("Enter a valid email address.");
    if (!subjectLabel.trim()) throw new Error("Enter the sample subject/topic.");
    if (!sampleCount || sampleCount < 1) throw new Error("Ask for at least 1 sample question.");

    const code = randomBytes(6).toString("hex");

    const result = await db.collection("internTrialAssignments").insertOne({
      code,
      candidateName: candidateName.trim(),
      candidateEmail: candidateEmail.trim(),
      subjectLabel: subjectLabel.trim(),
      instructions: instructions.trim(),
      sampleCount,
      status: "open",
      answers: [],
      reviewScore: null,
      reviewNotes: null,
      reviewDecision: null,
      submittedAt: null,
      reviewedAt: null,
      createdAt: new Date(),
    });

    return { ok: true, assignmentId: String(result.insertedId), code };
  });

export const listTrialAssignments = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("internTrialAssignments").find({}).sort({ createdAt: -1 }).toArray();
    return { assignments: rows.map(toView) };
  });

export const reviewTrialAssignment = createServerFn({ method: "POST" })
  .validator((data: { token: string; assignmentId: string; review: TrialReviewInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    if (data.review.reviewScore < 1 || data.review.reviewScore > 5) {
      throw new Error("Score must be between 1 and 5.");
    }

    const assignment = await db
      .collection("internTrialAssignments")
      .findOne({ _id: new ObjectId(data.assignmentId) });
    if (!assignment) throw new Error("Trial assignment not found.");
    if (assignment.status !== "submitted") throw new Error("This candidate hasn't submitted yet.");

    await db.collection("internTrialAssignments").updateOne(
      { _id: new ObjectId(data.assignmentId) },
      {
        $set: {
          status: "reviewed",
          reviewScore: data.review.reviewScore,
          reviewNotes: data.review.reviewNotes.trim(),
          reviewDecision: data.review.reviewDecision,
          reviewedAt: new Date(),
        },
      },
    );
    return { ok: true };
  });

// ─── Public: candidate side (no auth — the code IS the credential) ──────
// Deliberately returns only what a candidate needs to see, never any
// other candidate's data, and never anything from the real bundles/tests/
// questions collections.
export const getTrialAssignmentByCode = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const assignment = await db.collection("internTrialAssignments").findOne({ code: data.code });
    if (!assignment) throw new Error("This link isn't valid. Double-check the URL or ask Edurack for a new one.");
    return { assignment: toView(assignment) };
  });

export const submitTrialAssignment = createServerFn({ method: "POST" })
  .validator((data: { code: string; answers: TrialQuestionAnswer[] }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const assignment = await db.collection("internTrialAssignments").findOne({ code: data.code });
    if (!assignment) throw new Error("This link isn't valid.");
    if (assignment.status !== "open") throw new Error("This trial has already been submitted.");

    if (data.answers.length === 0) throw new Error("Write at least one sample question before submitting.");
    for (const a of data.answers) {
      if (!a.body.trim()) throw new Error("Every question needs a body.");
      if (a.type === "mcq") {
        if (!a.options || !a.options.A.trim() || !a.options.B.trim() || !a.options.C.trim() || !a.options.D.trim()) {
          throw new Error("All four options (A–D) must be filled in.");
        }
        if (!a.correctOption) throw new Error("Mark the correct option for every MCQ.");
      } else if (a.correctAnswer === undefined || Number.isNaN(a.correctAnswer)) {
        throw new Error("Enter a valid numeric answer for every integer-type question.");
      }
      if (!a.solution.trim()) throw new Error("Every question needs a solution.");
    }

    await db.collection("internTrialAssignments").updateOne(
      { _id: assignment._id },
      { $set: { status: "submitted", answers: data.answers, submittedAt: new Date() } },
    );
    return { ok: true };
  });
