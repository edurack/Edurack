// Pure helpers (client + server safe, no I/O, relative imports only so they can be unit-tested
// with plain Node) for the dashboard's practice numbers.
//
// ONE definition of every number, used by BOTH the hero and the performance card, so the dashboard
// can never show two different accuracies:
//   solved   = distinct questions with at least one real answer (revealing a solution is not solving)
//   correct  = of those, how many were right the last time they were answered
//   accuracy = correct / solved  (null, never 0%, until something has been solved)
//   week     = answers given in the last 7 IST days (repeat attempts on revision count)
//   days     = distinct IST days with at least one real answer
//   due      = mistakes whose revision date has arrived (the same count the revision button shows)

export type PracticeExam = "neet" | "jee" | "cuet" | "ipmat";

export type ExamStats = {
  solved: number;
  correct: number;
  /** Whole percent, 0..100, or null when nothing has been solved yet. */
  accuracy: number | null;
  weekAnswered: number;
  distinctDays: number;
  due: number;
};

export type LastAttempt = {
  subject: string;
  /** Empty when the question has no chapter tag. */
  chapter: string;
  exam: string | null;
  at: string;
};

export type PracticeStats = {
  /** Distinct questions answered across ALL exams. 0 means "never started practising". */
  questionsAnswered: number;
  overall: ExamStats;
  byExam: Partial<Record<PracticeExam, ExamStats>>;
  lastAttempt: LastAttempt | null;
  /** True when the append-only event log has nothing for this student (they practised before it existed), so week/day figures are estimates. */
  approximate: boolean;
};

export const EMPTY_EXAM_STATS: ExamStats = { solved: 0, correct: 0, accuracy: null, weekAnswered: 0, distinctDays: 0, due: 0 };

export const EMPTY_PRACTICE_STATS: PracticeStats = {
  questionsAnswered: 0,
  overall: EMPTY_EXAM_STATS,
  byExam: {},
  lastAttempt: null,
  approximate: false,
};

/** Whole-number percentage clamped to 0..100. Anything non-finite (NaN, Infinity) becomes 0. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** correct / total as a whole percent, or null when there is nothing to divide by. Correct can never exceed total. */
export function accuracyPercent(correct: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return clampPercent((Math.min(Math.max(correct, 0), total) / total) * 100);
}

export function buildExamStats(raw: { solved: number; correct: number; weekAnswered: number; distinctDays: number; due: number }): ExamStats {
  const solved = Math.max(0, Math.floor(raw.solved));
  const correct = Math.min(solved, Math.max(0, Math.floor(raw.correct)));
  return {
    solved,
    correct,
    accuracy: accuracyPercent(correct, solved),
    weekAnswered: Math.max(0, Math.floor(raw.weekAnswered)),
    distinctDays: Math.max(0, Math.floor(raw.distinctDays)),
    due: Math.max(0, Math.floor(raw.due)),
  };
}

const norm = (v: unknown): PracticeExam | null => {
  const t = String(v ?? "").toLowerCase();
  return (["neet", "jee", "cuet", "ipmat"] as const).find((k) => t.includes(k)) ?? null;
};

/** Which exam tab to open first: the exam they have practised most, else their target exam, else NEET. */
export function defaultExamTab(stats: PracticeStats, targetExam: string | null | undefined): "neet" | "jee" {
  const neet = stats.byExam.neet?.solved ?? 0;
  const jee = stats.byExam.jee?.solved ?? 0;
  if (neet !== jee) return jee > neet ? "jee" : "neet";
  return norm(targetExam) === "jee" ? "jee" : "neet";
}

// ─── Mock-test (test series) scores ────────────────────────────────────────
/**
 * A test score as a percentage for DISPLAY. NEET/JEE have negative marking, so score/total can be below zero
 * (e.g. -12 of 720 = -1.7%). A negative "average score" reads as a bug to a student, so it is floored at 0.
 * Used for every attempt BEFORE averaging so the average, the best and the per-test bars always agree.
 */
export function testScorePercent(score: number, totalMarks: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(totalMarks) || totalMarks <= 0) return 0;
  return Math.max(0, Math.min(100, (score / totalMarks) * 100));
}

export type BatchPerf = {
  bundleId: string;
  bundleTitle: string;
  exam?: string;
  testsAttempted: number;
  totalAttempts: number;
  averagePercent: number;
  bestPercent: number;
  /** Sum of the (clamped) per-attempt percentages. Lets the dashboard average across bundles without compounding rounding. */
  percentSum?: number;
};

/** Mock-test summary across bundles, optionally for one exam. Returns null when there are no scored attempts. */
export function summariseTests(batches: BatchPerf[] | null | undefined, exam?: "neet" | "jee"): { average: number; best: number; tests: number; attempts: number } | null {
  const rows = (batches ?? []).filter((b) => b.totalAttempts > 0 && (!exam || (norm(b.exam) ?? "neet") === exam));
  const attempts = rows.reduce((n, b) => n + b.totalAttempts, 0);
  if (attempts === 0) return null;
  const sum = rows.reduce((s, b) => s + (b.percentSum ?? b.averagePercent * b.totalAttempts), 0);
  return {
    average: clampPercent(sum / attempts),
    best: clampPercent(Math.max(...rows.map((b) => b.bestPercent))),
    tests: rows.reduce((n, b) => n + b.testsAttempted, 0),
    attempts,
  };
}

// ─── Where to send a brand-new / returning student ─────────────────────────
type TreeLike = { subjects: { subject: string; count: number; chapters: { chapter: string; count: number }[] }[] };
export const UNTAGGED = "Not yet tagged";

/** The chapter to open for "Start your first 5": the biggest properly-tagged chapter of the first subject that has any. */
export function pickFirstChapter(tree: TreeLike | null | undefined): { subject: string; chapter: string } | null {
  if (!tree) return null;
  for (const s of tree.subjects) {
    const tagged = s.chapters.filter((c) => c.count > 0 && c.chapter !== UNTAGGED);
    if (tagged.length === 0) continue;
    const best = tagged.reduce((a, b) => (b.count > a.count ? b : a));
    return { subject: s.subject, chapter: best.chapter };
  }
  return null;
}

export function examLabel(exam: string | null | undefined): string {
  const k = norm(exam);
  return k ? { neet: "NEET", jee: "JEE", cuet: "CUET", ipmat: "IPMAT" }[k] : "NEET";
}

// ─── Progress metrics (one rule, used everywhere) ──────────────────────────
export type PracticeProgress = { available: number; attempted: number; remaining: number; accuracy: number | null; percentDone: number };

/**
 * Available PYQs, UNIQUE questions attempted, what is left, and accuracy. `attempted` counts distinct questions, so
 * answering the same question again (revision, retry) never moves it; it can never exceed what is available.
 */
export function practiceProgress(available: number, uniqueAttempted: number, correct: number): PracticeProgress {
  const total = Math.max(0, Math.floor(Number.isFinite(available) ? available : 0));
  const attempted = Math.min(total, Math.max(0, Math.floor(Number.isFinite(uniqueAttempted) ? uniqueAttempted : 0)));
  return { available: total, attempted, remaining: total - attempted, accuracy: accuracyPercent(correct, attempted), percentDone: total > 0 ? clampPercent((attempted / total) * 100) : 0 };
}
