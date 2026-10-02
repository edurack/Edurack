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
