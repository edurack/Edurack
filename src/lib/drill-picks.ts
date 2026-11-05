// The topics a Pro student stacks into one custom drill, each with its own difficulty. Pure: no I/O, shared by the
// builder screen and by startPyqDrill (which re-cleans whatever the browser sent).
import type { Difficulty } from "@/lib/pyq-types";

/** One slot in the drill: a whole chapter, or one topic of it, with its own difficulty (none = any). */
export type DrillPick = { subject: string; chapter: string; topic?: string; difficulty?: Difficulty };

/** How many slots a drill can hold. Enough for a mixed revision, few enough that every slot gets real questions. */
export const MAX_DRILL_PICKS = 10;

const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export const pickKey = (p: Pick<DrillPick, "subject" | "chapter" | "topic">) => `${p.subject}|${p.chapter}|${p.topic ?? ""}`.toLowerCase();

/** Whatever the client sent, reduced to valid, de-duplicated picks (a topic needs its chapter; a repeated slot is dropped). */
export function cleanPicks(raw: unknown): DrillPick[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DrillPick[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const subject = text(r.subject, 100);
    const chapter = text(r.chapter, 200);
    if (!subject || !chapter) continue;
    const pick: DrillPick = { subject, chapter };
    const topic = text(r.topic, 200);
    if (topic) pick.topic = topic;
    if (DIFFICULTIES.includes(r.difficulty as Difficulty)) pick.difficulty = r.difficulty as Difficulty;
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pick);
    if (out.length >= MAX_DRILL_PICKS) break;
  }
  return out;
}

/**
 * Takes one question from each group in turn until `total` are chosen, so every pick gets a fair share and a small
 * pick doesn't starve the others. A question that sits in two groups (a chapter and one of its topics) counts once.
 */
export function interleave<T>(groups: T[][], total: number, keyOf: (item: T) => string): T[] {
  const out: T[] = [];
  const taken = new Set<string>();
  const cursor = groups.map(() => 0);
  let progressed = true;
  while (out.length < total && progressed) {
    progressed = false;
    for (let g = 0; g < groups.length && out.length < total; g++) {
      while (cursor[g] < groups[g].length) {
        const item = groups[g][cursor[g]++];
        const k = keyOf(item);
        if (taken.has(k)) continue;
        taken.add(k);
        out.push(item);
        progressed = true;
        break;
      }
    }
  }
  return out;
}

/** How hard the drill is overall, for the label on the Start button. "Any" counts as medium. */
export function drillRating(picks: Pick<DrillPick, "difficulty">[]): { level: 1 | 2 | 3; label: string } {
  if (picks.length === 0) return { level: 1, label: "Pick a topic" };
  const score = picks.reduce((n, p) => n + (p.difficulty === "Easy" ? 1 : p.difficulty === "Hard" ? 3 : 2), 0) / picks.length;
  return score < 1.5 ? { level: 1, label: "Warm-up" } : score < 2.5 ? { level: 2, label: "Balanced" } : { level: 3, label: "Boss level" };
}
