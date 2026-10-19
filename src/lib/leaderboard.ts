// Weekly PYQ leaderboard — pure rules, shared by the server functions and the UI.
//
// A week runs Monday 00:00 to Sunday 23:59 India time (the same clock streaks use).
// "Solved" = distinct questions answered correctly that week, so re-answering one
// question never adds points, and peeking at a solution never counts. To be ranked a
// student must have answered at least MIN_ATTEMPTED distinct questions at
// MIN_ACCURACY or better — random guessing on a 4-option MCQ lands near 25%, so this
// keeps button-mashing off the board without punishing honest effort.
import { addDays, istDayKey } from "@/lib/practice-schedule";

export const MIN_ATTEMPTED = 15;
export const MIN_ACCURACY = 0.4;
export const TOP_N = 20;
export const NAME_MIN = 2;
export const NAME_MAX = 24;

export type Week = "current" | "last";

export type WeekWindow = { startKey: string; start: Date; end: Date; label: string };

const shortDay = (key: string) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** The Monday-to-Sunday window (India time) that contains `now`. */
export function weekWindow(now: Date): WeekWindow {
  const today = istDayKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const startKey = addDays(today, -((dow + 6) % 7));
  const endKey = addDays(startKey, 7);
  return {
    startKey,
    start: new Date(`${startKey}T00:00:00+05:30`),
    end: new Date(`${endKey}T00:00:00+05:30`),
    label: `${shortDay(startKey)} – ${shortDay(addDays(startKey, 6))}`,
  };
}

export const windowFor = (week: Week, now: Date = new Date()): WeekWindow =>
  weekWindow(week === "last" ? new Date(now.getTime() - 7 * 86_400_000) : now);

export type WeeklyScore = { uid: string; solved: number; attempted: number };
export type RankedScore = WeeklyScore & { rank: number };

export const accuracyOf = (s: WeeklyScore) => (s.attempted > 0 ? s.solved / s.attempted : 0);
export const accuracyPct = (s: WeeklyScore) => Math.round(accuracyOf(s) * 100);
export const isEligible = (s: WeeklyScore) => s.attempted >= MIN_ATTEMPTED && accuracyOf(s) >= MIN_ACCURACY;

/** Most solved first; then higher accuracy; then fewer attempts for the same result. */
export const compareScores = (a: WeeklyScore, b: WeeklyScore) =>
  b.solved - a.solved || accuracyOf(b) - accuracyOf(a) || a.attempted - b.attempted || a.uid.localeCompare(b.uid);

const sameResult = (a: WeeklyScore, b: WeeklyScore) => a.solved === b.solved && a.attempted === b.attempted;

/** Eligible students only, best first. Identical results share a rank. */
export function rankScores(scores: WeeklyScore[]): RankedScore[] {
  const sorted = scores.filter(isEligible).sort(compareScores);
  const out: RankedScore[] = [];
  sorted.forEach((s, i) => out.push({ ...s, rank: i > 0 && sameResult(s, sorted[i - 1]) ? out[i - 1].rank : i + 1 }));
  return out;
}

/** 1 + how many of `list` beat `me`. Lets a student who isn't listed see where they would land. */
export const positionAmong = (me: WeeklyScore, list: WeeklyScore[]) => 1 + list.filter((s) => s.uid !== me.uid && compareScores(s, me) < 0).length;

/**
 * A public nickname. Returns the cleaned name, or null when it isn't allowed: wrong length,
 * odd characters, or anything that looks like contact details or a link.
 */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} ._'-]+$/u.test(name)) return null;
  if (/(https?|www\.|\.com|\.in\b|\.net|@)/i.test(name)) return null;
  if ((name.match(/\d/g) ?? []).length >= 6) return null; // a phone number
  return name;
}
