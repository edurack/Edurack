// "Attempt any N of M" groups — e.g. JEE Main's Section B, where 10 integer
// questions are shown but only any 5 need to be answered.
//
// A rule is stored on the test (testCores.attemptRules), scoped to one
// subject and a contiguous run of question numbers. Pure helpers only, so the
// ingestion screen, the test-taking page and server-side grading all share
// exactly one definition of "which rule does this question belong to".

export type AttemptRule = {
  id: string;
  subject: string;
  /** First question number in the group (inclusive). */
  fromNo: number;
  /** Last question number in the group (inclusive). */
  toNo: number;
  /** How many of the group's questions the student must/may attempt. */
  attemptAny: number;
};

export function ruleGroupSize(rule: AttemptRule): number {
  return rule.toNo - rule.fromNo + 1;
}

export function findRuleForQuestion(
  rules: AttemptRule[] | undefined | null,
  subject: string,
  questionNo: number,
): AttemptRule | null {
  return (
    (rules ?? []).find(
      (r) => r.subject === subject && questionNo >= r.fromNo && questionNo <= r.toNo,
    ) ?? null
  );
}

// ─── Which questions actually count toward a finished attempt ──────────────
//
// Grading (server-functions/test-engine.ts) stores one result per question,
// including the optional ones nobody had to answer. Everything that *reads*
// an attempt afterwards — the review list, the analysis page, topic analysis
// — must agree on which of those results count, otherwise a 90-question test
// with three "any 5 of 10" groups shows 15 phantom skipped/wrong questions
// next to a score that is (correctly) out of 75.

/** Every question is worth 4 marks in the grading engine. */
export const MARKS_PER_QUESTION = 4;

export type AttemptResultLike = {
  questionId: string;
  questionNo: number;
  subject: string;
  type?: "mcq" | "integer";
  selectedOption?: string | null;
  selectedAnswer?: number | null;
  ignored?: boolean;
};

export function wasAnswered(r: Pick<AttemptResultLike, "type" | "selectedOption" | "selectedAnswer">): boolean {
  if (r.type === "integer") return r.selectedAnswer !== null && r.selectedAnswer !== undefined;
  if (r.type === "mcq") return Boolean(r.selectedOption);
  return Boolean(r.selectedOption) || (r.selectedAnswer !== null && r.selectedAnswer !== undefined);
}

export type ExcludedQuestions = {
  /** Unattempted questions in an "any N of M" group beyond the N that count. */
  optionalSkipped: Set<string>;
  /** optionalSkipped ∪ answered-but-over-the-limit (`ignored`). Not counted anywhere. */
  excluded: Set<string>;
  /** Questions that make up the denominator of the score. */
  countedQuestions: number;
  /** Questions shown on the test but not counted (the "optional" ones). */
  optionalCount: number;
};

export function getExcludedQuestions(
  results: AttemptResultLike[],
  rules: AttemptRule[] | undefined | null,
  totalMarks: number,
): ExcludedQuestions {
  const none: ExcludedQuestions = {
    optionalSkipped: new Set(),
    excluded: new Set(),
    countedQuestions: results.length,
    optionalCount: 0,
  };
  if (!rules || rules.length === 0) {
    // No rules now. `ignored` can only exist if rules existed when graded.
    const ignored = results.filter((r) => r.ignored).map((r) => r.questionId);
    if (ignored.length === 0) return none;
    return {
      optionalSkipped: new Set(),
      excluded: new Set(ignored),
      countedQuestions: results.length - ignored.length,
      optionalCount: ignored.length,
    };
  }

  const optionalSkipped = new Set<string>();
  for (const rule of rules) {
    const members = results
      .filter((r) => findRuleForQuestion([rule], r.subject, r.questionNo))
      .sort((a, b) => a.questionNo - b.questionNo);
    if (members.length === 0) continue;
    const n = Math.min(rule.attemptAny, members.length);
    const unanswered = members.filter((m) => !wasAnswered(m));
    const answeredCount = members.length - unanswered.length;
    // Same arithmetic as grading: `missing` unanswered slots still count as
    // skipped; every unanswered question beyond that is simply optional.
    const missing = n - Math.min(n, answeredCount);
    unanswered.slice(missing).forEach((m) => optionalSkipped.add(m.questionId));
  }

  const excluded = new Set(optionalSkipped);
  results.filter((r) => r.ignored).forEach((r) => excluded.add(r.questionId));

  const counted = results.length - excluded.size;
  // Safety net: if the rules were edited after this attempt was graded, our
  // reconstruction won't match the stored total. Show the attempt exactly as
  // it was graded instead of guessing.
  if (counted * MARKS_PER_QUESTION !== totalMarks) return none;

  return { optionalSkipped, excluded, countedQuestions: counted, optionalCount: excluded.size };
}