// Shared type system for the Intern Question-Ingestion program: both the
// real (post-hire) intern portal and the pre-hire sandboxed trial live
// here. Deliberately separate from admin-types.ts's Question type — an
// intern's work is a DRAFT until an admin approves it, at which point
// admin-interns.ts writes a real admin-types.ts `Question` document into
// the `questions` collection. The two shapes are intentionally kept
// structurally close so that hand-off is a straight field copy.

import type { QuestionType, QuestionOptions } from "./admin-types";

// ─── Intern identity ─────────────────────────────────────────────────────
// Mirrors the Promoter pattern exactly: no Firebase Auth, admin issues an
// invite (name + email + a secret code), the candidate claims it by
// picking their own username + password. Lives in its own "interns"
// Mongo collection — never shares auth or collections with mentors or
// promoters, same isolation rule promoter-types.ts documents for itself.
export type InternStatus = "invited" | "active" | "suspended";

export type Intern = {
  id: string;
  username: string;
  name: string;
  email: string;
  secretCode: string;
  profilePictureUrl: string | null;
  status: InternStatus;
  createdAt: string | null; // invite creation time
  claimedAt: string | null; // signup time
  // ─── Internship dates — admin-set, shown on the intern's Profile page ──
  internshipStartDate: string | null;
  internshipEndDate: string | null;
  // ─── Offer letter — a PDF admin uploads for this specific intern ───────
  offerLetterUrl: string | null;
  offerLetterUploadedAt: string | null;
  // ─── Certificate — admin uploads the finished PDF whenever it's ready;
  // it only becomes downloadable once certificateUnlockDate has passed.
  // Defaults to internshipEndDate if admin never sets an explicit
  // unlock date of their own (see setInternshipDates/setCertificate in
  // intern-auth.ts for exactly how the default is applied).
  certificateUrl: string | null;
  certificateUnlockDate: string | null;
  certificateUploadedAt: string | null;
};

export type InternshipDatesInput = {
  internId: string;
  internshipStartDate: string;
  internshipEndDate: string;
  // Optional override — if omitted, unlock date defaults to internshipEndDate.
  certificateUnlockDate: string | null;
};

export type SetOfferLetterInput = {
  internId: string;
  offerLetterUrl: string;
};

export type SetCertificateInput = {
  internId: string;
  certificateUrl: string;
  // Optional — if omitted, keeps whatever unlock date is already set
  // (internshipEndDate by default, or an earlier admin override).
  certificateUnlockDate: string | null;
};

export type InternInviteInput = {
  name: string;
  email: string;
};

export type InternSignUpInput = {
  username: string;
  password: string;
  secretCode: string;
};

export type InternProfileUpdateInput = {
  name: string;
  profilePictureUrl: string | null;
};

// ─── Task assignment ─────────────────────────────────────────────────────
// One task = "add up to targetCount questions to this bundle/test/subject".
// Scoped exactly the way Question Ingestion already scopes admin work
// (bundleId -> testId -> subject), so a task maps 1:1 onto a slice of an
// existing TestCore's weightage. targetCount is informational for the
// intern's own progress bar — reviewDraft in admin-interns.ts still
// recomputes the real next questionNo server-side against the live
// `questions` collection, never against the intern's own draft count.
export type InternTaskStatus = "assigned" | "in_progress" | "completed";

export type InternTask = {
  id: string;
  internId: string;
  bundleId: string;
  bundleTitle: string;
  testId: string;
  testName: string;
  subject: string;
  targetCount: number;
  instructions: string;
  // Source material the intern should be transcribing/adapting from —
  // a PDF, Drive link, or any URL the admin pastes in (same "paste a
  // link" pattern as TestCore.referencePdfUrl / SoldTest.referencePdfUrl
  // elsewhere in admin-types.ts). Null when the task is self-explanatory
  // from instructions alone.
  referencePdfUrl: string | null;
  dueDate: string | null;
  status: InternTaskStatus;
  assignedAt: string | null;
};

export type InternTaskInput = {
  internId: string;
  bundleId: string;
  testId: string;
  subject: string;
  targetCount: number;
  instructions: string;
  referencePdfUrl: string | null;
  dueDate: string | null;
};

// ─── Question drafts ──────────────────────────────────────────────────────
// Structurally mirrors admin-types.ts's Question (body/type/options/
// correctOption/correctAnswer/solution/difficulty/isPYQ/pyqYear) so
// admin-interns.ts's approve step is a direct field copy — but a draft
// carries no questionNo. Numbering is assigned only once, at approval
// time, against the real `questions` collection — never client-supplied,
// same rule test-engine.ts already applies to grading.
export type InternDraftStatus = "draft" | "submitted" | "approved" | "rejected";

export type InternQuestionDraft = {
  id: string;
  internId: string;
  taskId: string;
  bundleId: string;
  testId: string;
  subject: string;
  body: string;
  type: QuestionType;
  options?: QuestionOptions;
  correctOption?: "A" | "B" | "C" | "D";
  correctAnswer?: number;
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isPYQ: boolean;
  pyqYear?: string;
  status: InternDraftStatus;
  adminFeedback: string | null;
  // How many times THIS draft has been rejected, ever — kept even after
  // the intern fixes it and it's later approved, so accuracy reporting
  // reflects real mistakes made, not just the current status. Incremented
  // in rejectDraft (admin-interns.ts), never reset by resubmission.
  rejectionCount: number;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// Everything an intern can write. Deliberately excludes internId, taskId
// (set from context/route, never trusted from the client body) and every
// review field (status/adminFeedback/reviewedAt — admin-interns.ts-only).
export type InternQuestionDraftInput = {
  body: string;
  type: QuestionType;
  options?: QuestionOptions;
  correctOption?: "A" | "B" | "C" | "D";
  correctAnswer?: number;
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isPYQ: boolean;
  pyqYear?: string;
};

export type InternTaskProgress = {
  taskId: string;
  targetCount: number;
  draftCount: number;     // intern's own draft + rejected, not yet submitted
  submittedCount: number; // awaiting admin review right now
  approvedCount: number;  // actually live in `questions` for this test+subject
};

// ─── Admin-side review queue view ────────────────────────────────────────
export type AdminDraftReviewView = InternQuestionDraft & {
  internName: string;
  internUsername: string;
  bundleTitle: string;
  testName: string;
};

// ─── Pre-hire sandboxed trial ────────────────────────────────────────────
// Completely isolated from real bundles/tests/questions and from the real
// Intern collection above — a trial candidate never gets a password
// account, just a single-use link. Lives in its own
// "internTrialAssignments" collection. subject/instructions/sampleCount
// are free text set by admin per candidate, never resolved against a
// real TestCore.
export type TrialAssignmentStatus = "open" | "submitted" | "reviewed";

export type TrialQuestionAnswer = {
  body: string;
  type: QuestionType;
  options?: QuestionOptions;
  correctOption?: "A" | "B" | "C" | "D";
  correctAnswer?: number;
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

export type TrialAssignment = {
  id: string;
  code: string; // the single-use link credential, e.g. /intern/trial/$code
  candidateName: string;
  candidateEmail: string;
  subjectLabel: string;      // e.g. "Physics — Kinematics (Class 11)"
  instructions: string;
  sampleCount: number;       // how many sample questions they're asked to write
  // Source material for the sample task — same idea as InternTask's
  // referencePdfUrl, just for a pre-hire candidate instead of a real
  // intern. A plain URL (admin can paste a link or upload a PDF to
  // INTERN_DOCUMENTS_BUCKET and use the resulting link either way).
  referenceMaterialUrl: string | null;
  status: TrialAssignmentStatus;
  answers: TrialQuestionAnswer[];
  reviewScore: number | null;    // 1-5, admin's call
  reviewNotes: string | null;
  reviewDecision: "advance" | "reject" | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
};

export type TrialAssignmentInput = {
  candidateName: string;
  candidateEmail: string;
  subjectLabel: string;
  instructions: string;
  sampleCount: number;
  referenceMaterialUrl: string | null;
};

export type TrialReviewInput = {
  reviewScore: number;
  reviewNotes: string;
  reviewDecision: "advance" | "reject";
};

// ─── Profile / report (intern-facing) ────────────────────────────────────
// Everything the intern's own Profile page shows in one call — dates,
// offer letter, certificate lock state, and a performance report built
// from the immutable internReviewEvents log (see intern-portal.ts), never
// from mutable draft documents, so a draft being edited/deleted after
// review can't quietly change someone's historical accuracy numbers.
export type InternTaskReportRow = {
  taskId: string;
  bundleTitle: string;
  testName: string;
  subject: string;
  targetCount: number;
  approvedCount: number;
  rejectionCount: number;
  completed: boolean;
};

export type InternProfileReport = {
  profile: {
    name: string;
    username: string;
    email: string;
    profilePictureUrl: string | null;
    internshipStartDate: string | null;
    internshipEndDate: string | null;
  };
  offerLetter: { url: string; uploadedAt: string | null } | null;
  certificate: {
    uploaded: boolean; // admin has uploaded a file, regardless of unlock state
    unlocked: boolean; // uploaded AND unlock date has passed
    unlockDate: string | null;
    daysRemaining: number | null; // null once unlocked or if no unlock date set
    url: string | null; // only populated when unlocked
  };
  stats: {
    tasksAssigned: number;
    tasksCompleted: number; // approvedCount >= targetCount for that task
    totalApproved: number;
    totalMistakes: number; // sum of rejection events, ever
    accuracyPercent: number | null; // null until at least one review has happened
  };
  taskBreakdown: InternTaskReportRow[];
};