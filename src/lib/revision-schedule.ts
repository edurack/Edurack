// Spaced revision: a mistake is worth another look after 1, 3, 7 and 14 days. Pure date maths (India dates as YYYY-MM-DD).
// A "revision due" email goes to a student who has enough mistakes whose last attempt was exactly one of those many days ago.
import { addDays } from "@/lib/practice-schedule";

export const REVISION_STEPS = [1, 3, 7, 14] as const;
/** Fewer due mistakes than this is not worth an email. (Same as the minimum size of a revision drill.) */
export const MIN_DUE_MISTAKES = 5;

/** The days on which a mistake, made today, is due again: the dates (before `today`) that mistakes were made on. */
export function revisionDueDays(today: string): string[] {
  return REVISION_STEPS.map((n) => addDays(today, -n));
}

/** How many days ago a mistake made on `madeOn` is next due for revision, or null when it is between steps. */
export function dueStepFor(today: string, madeOn: string): number | null {
  for (const n of REVISION_STEPS) if (addDays(today, -n) === madeOn) return n;
  return null;
}
