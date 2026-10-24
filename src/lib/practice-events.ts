// What the practice analytics events look like. Pure (no PostHog, no DOM) so the rules are testable.
//
// Privacy rules, enforced here in one place:
//   - never the answer a student chose or typed (only whether it was right)
//   - never an email, name, phone number or city
//   - ids are internal question / mentor ids, which identify content, not a person
//
// Ordinary PYQ practice and timed drills are told apart by `practice_type`:
//   "pyq"         chapter practice, today's PYQ, revision, mistakes, bookmarks, weak-topic runs
//   "timed_drill" the 20-question timed drill
export type PracticeType = "pyq" | "timed_drill";
export type PracticeMode = "chapter" | "daily" | "revision" | "mistakes" | "bookmarks" | "weak_topics" | "timed_drill";

type Session = "daily" | "due" | "wrong" | "bookmarked" | undefined;

export function practiceModeFor(opts: { session?: Session; weakAttemptId?: string | null }): PracticeMode {
  if (opts.session === "daily") return "daily";
  if (opts.session === "due") return "revision";
  if (opts.session === "wrong") return "mistakes";
  if (opts.session === "bookmarked") return "bookmarks";
  if (opts.weakAttemptId) return "weak_topics";
  return "chapter";
}

/** The two modes that are "revising past mistakes" (mistake_revision_* events). */
export const isMistakeRevision = (mode: PracticeMode) => mode === "revision" || mode === "mistakes";

export type EventProps = Record<string, string | number | boolean | null | undefined>;

export type PracticeContext = {
  mode: PracticeMode;
  exam?: string | null;
  subject?: string | null;
  chapter?: string | null;
  guest?: boolean;
  /** "first_five" when started from the new-student button on the dashboard. */
  source?: string | null;
};

const cap = (v: string | null | undefined, n = 80) => (v ? String(v).slice(0, n) : undefined);

export function practiceProps(ctx: PracticeContext): EventProps {
  return {
    practice_type: ctx.mode === "timed_drill" ? "timed_drill" : "pyq",
    mode: ctx.mode,
    exam: cap(ctx.exam) ?? null,
    subject: cap(ctx.subject) ?? null,
    chapter: cap(ctx.chapter) ?? null,
    guest: ctx.guest === true,
    source: cap(ctx.source) ?? null,
  };
}

export function answeredProps(ctx: PracticeContext, a: { questionId: string; questionType?: string; isCorrect: boolean }): EventProps {
  return { ...practiceProps(ctx), question_id: a.questionId, question_type: a.questionType ?? null, is_correct: a.isCorrect };
}

export type SessionCounts = { answered: number; correct: number; wrong: number; peeked: number };

export function completedProps(ctx: PracticeContext, c: SessionCounts): EventProps {
  return {
    ...practiceProps(ctx),
    answered: c.answered,
    correct: c.correct,
    wrong: c.wrong,
    peeked: c.peeked,
    accuracy: c.answered > 0 ? Math.round((c.correct / c.answered) * 100) : null,
  };
}
