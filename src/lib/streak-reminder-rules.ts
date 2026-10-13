// Pure rules for "when do we nudge a student to keep their streak alive?".
// No I/O, so it is unit-tested (see tests/streak-reminder-rules.test.ts).
//
// How the streak works in this codebase (practice-schedule.ts): a day counts if
// the student answered ≥1 question, and the day rolls over at IST midnight.
// A streak with lastDay === yesterday is still alive today but dies at 00:00 IST
// if they don't answer anything. That is the window this reminder lives in.
import { addDays, istDayKey } from "@/lib/practice-schedule";

const IST_OFFSET_MIN = 330;

/** Never email before 08:00 IST — nobody wants a streak nudge at 5 a.m. */
export const REMINDER_EARLIEST_MIN = 8 * 60;
/** Never schedule later than 21:00 IST — leaves ~3 hours to actually practise. */
export const REMINDER_LATEST_MIN = 21 * 60;
/** If the cron was down and we're past this, skip: too late to be useful. */
export const REMINDER_GIVE_UP_MIN = 22 * 60 + 30;
/** Used when we don't know when the student usually practises. */
export const REMINDER_DEFAULT_MIN = 17 * 60;

/** Minutes since IST midnight for an instant. */
export function istMinuteOfDay(d: Date): number {
  const shifted = d.getTime() + IST_OFFSET_MIN * 60_000;
  return Math.floor(shifted / 60_000) % 1440;
}

export function formatIstMinute(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} IST`;
}

/**
 * The minute-of-day (IST) at which to send the nudge: the same clock time the
 * student last practised (that's when they're in the habit / at their phone),
 * optionally `leadMinutes` earlier, clamped to a sensible window.
 */
export function reminderMinuteFor(lastPracticedAt: Date | null | undefined, leadMinutes = 0): number {
  const base = lastPracticedAt ? istMinuteOfDay(lastPracticedAt) - leadMinutes : REMINDER_DEFAULT_MIN;
  return Math.min(REMINDER_LATEST_MIN, Math.max(REMINDER_EARLIEST_MIN, base));
}

export type StreakLike = { current: number; lastDay: string | null };

/** Is the streak alive but not yet extended today? (Only these students get a nudge.) */
export function isAtRisk(streak: StreakLike, now: Date, minStreak = 1): boolean {
  const today = istDayKey(now);
  return streak.current >= minStreak && streak.lastDay === addDays(today, -1);
}

export function isReminderDue(
  streak: StreakLike,
  lastPracticedAt: Date | null | undefined,
  now: Date,
  opts: { minStreak?: number; leadMinutes?: number } = {},
): boolean {
  if (!isAtRisk(streak, now, opts.minStreak ?? 1)) return false;
  const nowMin = istMinuteOfDay(now);
  return nowMin >= reminderMinuteFor(lastPracticedAt, opts.leadMinutes ?? 0) && nowMin <= REMINDER_GIVE_UP_MIN;
}

/** Hours left before the streak breaks at IST midnight. */
export function hoursLeftToday(now: Date): number {
  return Math.max(0, Math.round(((1440 - istMinuteOfDay(now)) / 60) * 10) / 10);
}
