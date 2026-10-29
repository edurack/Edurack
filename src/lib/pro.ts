// Edurack Pro — rules shared by the server and the UI (pure: no I/O).
//
// What Pro adds to PYQ drills is a list of FEATURES (PRO_FEATURES below):
//   • unlimitedDrills — no daily cap on timed drills (free students get `freeDrillsPerDay`), and
//   • customDrillBuilder — pick chapter/topic, difficulty, paper years and length.
// The admin "Edurack Pro" tab controls the free daily limit, which features are Pro-only, and which
// features each plan includes. Everything that exists for free today — practice with the chapter/topic/
// difficulty/year filters, answers, solutions, the notebook, the standard mixed drill — stays free.
//
// To add a new Pro feature later: add one entry to PRO_FEATURES, then check it with hasFeature(access, key)
// where the feature is used. The admin screen, plan editor and student upgrade card pick it up by themselves.
import { addDays, istDayKey, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import type { Difficulty } from "@/lib/pyq-types";

/** Free standard drills per India day. One drill is 20 questions, so this is 40 timed questions a day on top of unlimited untimed practice. */
export const FREE_DRILLS_PER_DAY = 2;
/** Lengths a Pro student can pick (the standard drill is DRILL_QUESTIONS). */
export const CUSTOM_DRILL_COUNTS = [10, 20, 30, 45] as const;
/** Prefix of the error the server throws when a drill needs Pro, so the page can show the upgrade panel. */
export const DRILL_LIMIT_PREFIX = "DRILL_LIMIT";

/** Every feature Pro can switch on. The admin screen and the student upgrade card are generated from this list. */
export const PRO_FEATURES = {
  unlimitedDrills: { label: "Unlimited Quick Mocks", description: "No daily cap on Quick Mocks (timed PYQ drills)." },
  customDrillBuilder: { label: "Build your own drill", description: "Pick chapter or topic, difficulty, paper years and length." },
} as const;
export type ProFeatureKey = keyof typeof PRO_FEATURES;
export const PRO_FEATURE_KEYS = Object.keys(PRO_FEATURES) as ProFeatureKey[];
const isFeatureKey = (k: unknown): k is ProFeatureKey => typeof k === "string" && (PRO_FEATURE_KEYS as string[]).includes(k);

/** Admin-editable rules for the free plan. `proOnly[key]` true = that feature needs Pro; false = free for everyone. */
export type ProSettings = { freeDrillsPerDay: number; proOnly: Record<ProFeatureKey, boolean> };
export const MAX_FREE_DRILLS_PER_DAY = 20;
export const DEFAULT_PRO_SETTINGS: ProSettings = {
  freeDrillsPerDay: FREE_DRILLS_PER_DAY,
  proOnly: Object.fromEntries(PRO_FEATURE_KEYS.map((k) => [k, true])) as Record<ProFeatureKey, boolean>,
};

/** Whatever was stored or sent, reduced to valid settings; anything missing falls back to the default. */
export function cleanProSettings(raw: unknown): ProSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = Number(r.freeDrillsPerDay);
  const freeDrillsPerDay = Number.isInteger(n) && n >= 0 && n <= MAX_FREE_DRILLS_PER_DAY ? n : DEFAULT_PRO_SETTINGS.freeDrillsPerDay;
  const po = r.proOnly && typeof r.proOnly === "object" ? (r.proOnly as Record<string, unknown>) : {};
  const proOnly = { ...DEFAULT_PRO_SETTINGS.proOnly };
  for (const k of PRO_FEATURE_KEYS) if (typeof po[k] === "boolean") proOnly[k] = po[k] as boolean;
  return { freeDrillsPerDay, proOnly };
}

/** The valid feature keys in `raw`. Anything that isn't a list (an older plan with no `features`) means every feature. */
export function cleanPlanFeatures(raw: unknown): ProFeatureKey[] {
  if (!Array.isArray(raw)) return [...PRO_FEATURE_KEYS];
  return PRO_FEATURE_KEYS.filter((k) => raw.includes(k));
}

export type ProPlanPublic = { id: string; name: string; price: number; durationDays: number; blurb: string; features: ProFeatureKey[] };

export type DrillAccess = {
  /** False until the team publishes at least one plan; while false nothing is limited. */
  gatingOn: boolean;
  isPro: boolean;
  /** ISO date Pro runs until, when active. */
  proUntil: string | null;
  usedToday: number;
  freeLimit: number;
  plans: ProPlanPublic[];
  /** Features this student's active Pro period includes. */
  features: ProFeatureKey[];
  /** Which features need Pro right now (admin setting). */
  proOnly: Record<ProFeatureKey, boolean>;
  /** A Quick Mock this student started and hasn't submitted yet. The server resumes it instead of using up another one. */
  running?: { drillId: string; remainingSec: number } | null;
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

/** Can this student use the feature? Yes while Pro isn't on sale, when the admin made it free, or when their plan includes it. */
export const hasFeature = (a: Pick<DrillAccess, "gatingOn" | "proOnly" | "features">, key: ProFeatureKey): boolean =>
  !a.gatingOn || !a.proOnly[key] || a.features.includes(key);

export const drillsLeft = (a: Pick<DrillAccess, "gatingOn" | "proOnly" | "features" | "usedToday" | "freeLimit">) =>
  hasFeature(a, "unlimitedDrills") ? Infinity : Math.max(0, a.freeLimit - a.usedToday);

/**
 * Why a student can't start this drill right now, or null if they can.
 *  - `canCustom` / `unlimited` come from hasFeature(), so nothing is limited until the team publishes a plan.
 *  - A custom drill needs the builder; the standard drill is free up to `freeLimit` a day unless `unlimited`.
 */
export function drillBlockReason(a: { wantsCustom: boolean; usedToday: number; freeLimit: number; canCustom: boolean; unlimited: boolean }): "custom" | "limit" | null {
  if (a.wantsCustom) return a.canCustom ? null : "custom";
  return a.unlimited || a.usedToday < a.freeLimit ? null : "limit";
}
