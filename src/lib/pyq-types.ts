// Types shared by the PYQ practice server functions and UI. Pure — no server imports.
import type { PyqSource } from "@/lib/pyq-label";
import type { ExamKey } from "@/lib/admin-types";

export type OptionKey = "A" | "B" | "C" | "D";
export type PyqStatus = "new" | "correct" | "wrong" | "revealed";
export type Difficulty = "Easy" | "Medium" | "Hard";

/** PYQs that have no chapter tag yet still show up, grouped under this chapter. */
export const UNTAGGED_CHAPTER = "Not yet tagged";
/** PYQs with a chapter but no topic tag are grouped under this topic. */
export const GENERAL_TOPIC = "General";

type Progress = { count: number; attempted: number; correct: number };
export type PyqTopicNode = Progress & { topic: string };
export type PyqChapterNode = Progress & { chapter: string; topics: PyqTopicNode[] };
export type PyqSubjectNode = Progress & { subject: string; chapters: PyqChapterNode[] };
export type PyqTree = { exam: ExamKey | null; subjects: PyqSubjectNode[]; totalQuestions: number; totalCorrect: number };

/** A question as sent to the student: NO correct answer, NO solution. */
export type PyqQuestion = {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  body: string;
  options?: Record<OptionKey, string>;
  difficulty: Difficulty;
  source: PyqSource;
  status: PyqStatus;
  /** Saved by this student for later (the notebook's Bookmarks tab). */
  bookmarked: boolean;
};

export type PyqList = {
  questions: PyqQuestion[];
  /** Years present for this chapter/topic (before the year filter), newest first. */
  years: string[];
  /** Matches before the 300-question cap. */
  total: number;
  /** Set for "Practice my weak topics" sessions: which chapters were mixed in, and how many questions each. */
  weak?: { chapters: { subject: string; chapter: string; count: number }[] };
};

/** How many PYQs exist (and how many the student already solved) for each chapter that cost them marks. */
export type WeakPyqSummary = {
  exam: ExamKey | null;
  chapters: { subject: string; chapter: string; available: number; solved: number }[];
  totalAvailable: number;
};

export type PyqAnswer = { option?: OptionKey; value?: number } | null;

export type PyqCheckResult = {
  isCorrect: boolean;
  revealed: boolean;
  correctOption?: OptionKey;
  correctAnswer?: number;
  solution: string;
  status: PyqStatus;
  /** Set when this answer counted toward the daily streak. */
  streak?: { current: number; increased: boolean };
};

// ─── Daily PYQ, notebook, Today card ───────────────────────────────────────
/** Ready-made practice sessions that aren't tied to one chapter. */
export type SessionKind = "daily" | "due" | "wrong" | "bookmarked";
export const SESSION_TITLES: Record<SessionKind, string> = {
  daily: "Today's PYQ",
  due: "Revision due",
  wrong: "Your mistakes",
  bookmarked: "Bookmarks",
};

export type TodaySummary = {
  exam: ExamKey | null;
  streak: { current: number; longest: number; doneToday: boolean };
  /** Today's shared question; `done` once this student has answered it. */
  daily: { available: boolean; done: boolean };
  /** Mistakes whose revision date has arrived. */
  due: number;
  /** The weakest chapter from their latest test that has PYQs to practise. */
  weak: { attemptId: string; subject: string; chapter: string; available: number } | null;
};

export type NotebookSummary = {
  exam: ExamKey | null;
  due: number;
  wrong: number;
  bookmarked: number;
  mastered: number;
  /** ISO time of the next revision that isn't due yet, if any. */
  nextDueAt: string | null;
};

// ─── Timed drills ──────────────────────────────────────────────────────────
export type DrillSet = { drillId: string; durationSec: number; remainingSec: number; questions: PyqQuestion[] };
export type DrillResult = {
  drillId: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTakenSec: number;
  items: { id: string; outcome: "correct" | "wrong" | "skipped"; marks: number }[];
  /** Answers + solutions, revealed only now that the drill is over. */
  review: { id: string; correctOption?: OptionKey; correctAnswer?: number; solution: string }[];
  questions: PyqQuestion[];
};
export type DrillState = { status: "running"; set: DrillSet } | { status: "done"; result: DrillResult };

// ─── Upsell after a weak-topics session ────────────────────────────────────
export type UpsellBundle = {
  id: string;
  title: string;
  exam: ExamKey | null;
  sellingPrice: number;
  crossedPrice: number;
  thumbnailUrl: string | null;
  /** How many questions in this bundle's tests cover the student's weak chapters. */
  matchingQuestions: number;
  chapters: string[];
};
export type WeakUpsell = {
  bundles: UpsellBundle[];
  /** Subject-level accuracy, so the existing mentor recommendations can be reused. */
  weakSubjects: { subject: string; percent: number }[];
};

// ─── Reporting a wrong / unclear question ──────────────────────────────────
export const REPORT_REASONS = ["wrong_answer", "wrong_solution", "typo", "unclear_image", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong_answer: "The correct answer looks wrong",
  wrong_solution: "The solution is wrong or unclear",
  typo: "Typo or formatting problem",
  unclear_image: "Image or diagram is missing/unclear",
  other: "Something else",
};
export type ReportStatus = "open" | "fixed" | "dismissed";

/** One question with all its open/closed reports, as the admin queue shows it. */
export type QuestionReportGroup = {
  questionId: string;
  openCount: number;
  totalCount: number;
  latestAt: string;
  reasons: Partial<Record<ReportReason, number>>;
  notes: { reason: ReportReason; note: string; at: string }[];
  /** null when the question has since been deleted. Includes the answer key — admin-only. */
  question: {
    subject: string;
    chapter: string;
    topic: string;
    difficulty: string;
    type: "mcq" | "integer";
    body: string;
    options?: Record<OptionKey, string>;
    correctOption?: OptionKey;
    correctAnswer?: number;
    solution: string;
    /** "Batch › Test" so an admin can find it in the Questions tab. */
    where: string;
  } | null;
};
