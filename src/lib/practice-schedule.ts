// Pure rules for the practice features: spaced revision, streaks, the daily
// question and timed-drill scoring. No I/O so every rule is unit-tested.

// ─── Days (India, because that's where the students are) ───────────────────
/** "YYYY-MM-DD" in Asia/Kolkata. Streaks and the daily question roll over at IST midnight. */
export function istDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ─── Spaced revision: wrong answers come back after 2, 5, then 14 days ─────
export const REVIEW_INTERVAL_DAYS = [2, 5, 14] as const;
export type Outcome = "correct" | "wrong" | "revealed";
export type ReviewState = { reviewStage: number | null; nextReviewAt: Date | null; mastered: boolean };

const plusDays = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000);

export function nextReviewState(
  prev: { reviewStage?: number | null; nextReviewAt?: Date | null; mastered?: boolean } | null | undefined,
  outcome: Outcome,
  now: Date,
): ReviewState {
  // Wrong, or peeking at the solution, (re)starts the ladder.
  if (outcome !== "correct") return { reviewStage: 0, nextReviewAt: plusDays(now, REVIEW_INTERVAL_DAYS[0]), mastered: false };

  const scheduled = prev?.reviewStage !== null && prev?.reviewStage !== undefined && prev?.nextReviewAt;
  // Got it right and it was never a mistake → nothing to revise.
  if (!scheduled) return { reviewStage: null, nextReviewAt: null, mastered: Boolean(prev?.mastered) };
  // Right, but practised ahead of schedule → keep the schedule, don't skip a rung.
  if ((prev!.nextReviewAt as Date).getTime() > now.getTime())
    return { reviewStage: prev!.reviewStage as number, nextReviewAt: prev!.nextReviewAt as Date, mastered: false };
  // Right when it was due → climb a rung; past the last rung it's mastered.
  const next = (prev!.reviewStage as number) + 1;
  if (next >= REVIEW_INTERVAL_DAYS.length) return { reviewStage: null, nextReviewAt: null, mastered: true };
  return { reviewStage: next, nextReviewAt: plusDays(now, REVIEW_INTERVAL_DAYS[next]), mastered: false };
}

// ─── Streak: any day with at least one answered question counts ────────────
export type Streak = { current: number; longest: number; lastDay: string | null };
export const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastDay: null };

export function advanceStreak(s: Streak, today: string): Streak & { increased: boolean } {
  if (s.lastDay === today) return { ...s, increased: false };
  const current = s.lastDay === addDays(today, -1) ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDay: today, increased: true };
}

/** What to show: a streak whose last day was before yesterday is already broken. */
export function effectiveStreak(s: Streak | null | undefined, today: string) {
  const st = s ?? EMPTY_STREAK;
  const alive = st.lastDay === today || st.lastDay === addDays(today, -1);
  return { current: alive ? st.current : 0, longest: st.longest, doneToday: st.lastDay === today };
}

// ─── The 7-day strip on the Today card ─────────────────────────────────────
export type WeekDay = { day: string; label: string; done: boolean; isToday: boolean };
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The last 7 days ending today (oldest first). A day is "done" if it's in the
 * recorded recent practice days, or inside the current streak — which covers
 * streaks saved before recent days were tracked (a streak's days were, by
 * definition, all practice days).
 */
export function weekStrip(today: string, recentDays: string[] | null | undefined, raw: Streak): WeekDay[] {
  const practised = new Set(recentDays ?? []);
  if (raw.lastDay && raw.current > 0) for (let i = 0; i < raw.current; i++) practised.add(addDays(raw.lastDay, -i));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, label: WEEKDAY_INITIALS[new Date(`${day}T00:00:00Z`).getUTCDay()], done: practised.has(day), isToday: day === today };
  });
}

// ─── Daily question: stable per day, spread evenly over the pool ───────────
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const pickDailyIndex = (seed: string, poolSize: number) => (poolSize > 0 ? hashString(seed) % poolSize : -1);

// ─── Timed drills ──────────────────────────────────────────────────────────
export const DRILL_QUESTIONS = 20;
export const DRILL_MINUTES = 30;
export const DRILL_MARKS = { correct: 4, wrongMcq: -1, wrongInteger: 0 } as const;

export type DrillKey = { id: string; type: "mcq" | "integer"; correctOption?: string; correctAnswer?: number };
export type DrillAnswer = { option?: string; value?: number } | null | undefined;
export type DrillItem = { id: string; outcome: "correct" | "wrong" | "skipped"; marks: number };

export function scoreDrill(keys: DrillKey[], answers: Record<string, DrillAnswer>) {
  const items: DrillItem[] = keys.map((k) => {
    const a = answers[k.id];
    const answered = k.type === "mcq" ? Boolean(a?.option) : typeof a?.value === "number" && Number.isFinite(a.value);
    if (!answered) return { id: k.id, outcome: "skipped", marks: 0 };
    const right = k.type === "mcq" ? a!.option === k.correctOption : Math.abs((a!.value as number) - (k.correctAnswer as number)) < 1e-6;
    if (right) return { id: k.id, outcome: "correct", marks: DRILL_MARKS.correct };
    return { id: k.id, outcome: "wrong", marks: k.type === "mcq" ? DRILL_MARKS.wrongMcq : DRILL_MARKS.wrongInteger };
  });
  return {
    items,
    score: items.reduce((n, i) => n + i.marks, 0),
    maxScore: keys.length * DRILL_MARKS.correct,
    correct: items.filter((i) => i.outcome === "correct").length,
    wrong: items.filter((i) => i.outcome === "wrong").length,
    skipped: items.filter((i) => i.outcome === "skipped").length,
  };
}

/** Evenly across subjects, keeping each subject's incoming (priority) order; tops up if a subject runs short. */
export function balancedPick<T extends { subject: string }>(items: T[], total: number): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) (groups.get(it.subject) ?? groups.set(it.subject, []).get(it.subject)!).push(it);
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < total; i++) {
    let added = false;
    for (const l of lists) if (i < l.length && out.length < total) (out.push(l[i]), (added = true));
    if (!added) break;
  }
  return out;
}

/** Seconds left on a drill, clamped to [0, total]. Server clock is the only clock that counts. */
export function remainingSeconds(startedAt: Date, durationSec: number, now: Date): number {
  return Math.max(0, Math.min(durationSec, Math.round(durationSec - (now.getTime() - startedAt.getTime()) / 1000)));
}
