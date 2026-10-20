// Edurack Pro — rules shared by the server and the UI (pure: no I/O).
//
// What Pro adds to PYQ drills:
//   • unlimited timed drills (free students get FREE_DRILLS_PER_DAY a day), and
//   • the custom drill builder: pick chapter/topic, difficulty, paper years and length.
// Everything that exists for free today — practice with the chapter/topic/difficulty/year filters,
// answers, solutions, the notebook, the standard mixed drill — stays free.
import { addDays, istDayKey, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import type { Difficulty } from "@/lib/pyq-types";

/** Free standard drills per India day. One drill is 20 questions, so this is 40 timed questions a day on top of unlimited untimed practice. */
export const FREE_DRILLS_PER_DAY = 2;
/** Lengths a Pro student can pick (the standard drill is DRILL_QUESTIONS). */
export const CUSTOM_DRILL_COUNTS = [10, 20, 30, 45] as const;
/** Prefix of the error the server throws when a drill needs Pro, so the page can show the upgrade panel. */
export const DRILL_LIMIT_PREFIX = "DRILL_LIMIT";

export type ProPlanPublic = { id: string; name: string; price: number; durationDays: number; blurb: string };

export type DrillAccess = {
  /** False until the team publishes at least one plan; while false nothing is limited. */
  gatingOn: boolean;
  isPro: boolean;
  /** ISO date Pro runs until, when active. */
  proUntil: string | null;
  usedToday: number;
  freeLimit: number;
  plans: ProPlanPublic[];
};

export type CustomDrillInput = { chapter?: string; topic?: string; difficulty?: Difficulty; years?: string[]; count?: number };

const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Whatever the client sent, reduced to valid options. Null when nothing usable was sent. */
export function cleanCustomDrill(raw: unknown): CustomDrillInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: CustomDrillInput = {};
  const chapter = text(r.chapter, 200);
  const topic = chapter ? text(r.topic, 200) : undefined; // a topic only makes sense inside a chapter
  if (chapter) out.chapter = chapter;
  if (topic) out.topic = topic;
  if (DIFFICULTIES.includes(r.difficulty as Difficulty)) out.difficulty = r.difficulty as Difficulty;
  if (Array.isArray(r.years)) {
    const years = [...new Set(r.years.filter((y): y is string => typeof y === "string" && /^\d{4}$/.test(y)))].slice(0, 20);
    if (years.length) out.years = years;
  }
  const count = Number(r.count);
  if ((CUSTOM_DRILL_COUNTS as readonly number[]).includes(count)) out.count = count;
  return Object.keys(out).length ? out : null;
}

/** A drill that goes beyond the standard one — and so needs Pro once plans are published. */
export const isCustomDrill = (c: CustomDrillInput | null): boolean =>
  !!c && Boolean(c.chapter || c.topic || c.difficulty || c.years?.length || (c.count && c.count !== DRILL_QUESTIONS));

/** [start, end) of the India calendar day containing `now`. */
export function istDayRange(now: Date): { start: Date; end: Date } {
  const key = istDayKey(now);
  return { start: new Date(`${key}T00:00:00+05:30`), end: new Date(`${addDays(key, 1)}T00:00:00+05:30`) };
}

export const drillsLeft = (a: Pick<DrillAccess, "gatingOn" | "isPro" | "usedToday" | "freeLimit">) =>
  !a.gatingOn || a.isPro ? Infinity : Math.max(0, a.freeLimit - a.usedToday);

/**
 * Why a student can't start this drill right now, or null if they can.
 *  - Nothing is limited until the team publishes a plan (gatingOn), and Pro students are never limited.
 *  - The custom builder needs Pro; the standard drill is free up to FREE_DRILLS_PER_DAY a day.
 */
export function drillBlockReason(a: { gatingOn: boolean; isPro: boolean; wantsCustom: boolean; usedToday: number }): "custom" | "limit" | null {
  if (!a.gatingOn || a.isPro) return null;
  if (a.wantsCustom) return "custom";
  return a.usedToday >= FREE_DRILLS_PER_DAY ? "limit" : null;
}
