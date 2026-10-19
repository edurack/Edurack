// SERVER-ONLY. Reads for the weekly PYQ leaderboard and the "Student of the week" shout-out.
//
// Scores come from `practiceEvents`, the append-only log written whenever a student answers a
// question (single practice and timed drills alike). Guests aren't logged, so they never appear.
import type { Db } from "@/lib/pyq-server";
import { createTtlCache } from "@/lib/simple-cache";
import type { WeeklyScore, WeekWindow } from "@/lib/leaderboard";

// Everyone's weekly scores are identical for every caller, so this is safe to cache; anything
// that depends on WHO is asking (their own row, isYou) is computed after reading from here.
const scoreCache = createTtlCache<WeeklyScore[]>(5 * 60_000);
const featuredCache = createTtlCache<PublicFeatured | null>(10 * 60_000);
let indexEnsured = false;

export async function weeklyScores(db: Db, win: WeekWindow): Promise<WeeklyScore[]> {
  const hit = scoreCache.get(win.startKey);
  if (hit) return hit;

  const events = db.collection("practiceEvents");
  if (!indexEnsured) {
    indexEnsured = true;
    try {
      await events.createIndex({ at: 1 });
    } catch {
      // best-effort, like the other ensure*Indexes helpers
    }
  }

  // One row per (student, question): did they get it right at least once this week?
  // Then one row per student. Peeks ("revealed") are not answers and are filtered out.
  const rows = await events
    .aggregate([
      { $match: { at: { $gte: win.start, $lt: win.end }, outcome: { $in: ["correct", "wrong"] } } },
      { $group: { _id: { uid: "$uid", q: "$questionId" }, right: { $max: { $cond: [{ $eq: ["$outcome", "correct"] }, 1, 0] } } } },
      { $group: { _id: "$_id.uid", solved: { $sum: "$right" }, attempted: { $sum: 1 } } },
    ])
    .toArray();

  const scores = rows.map((r) => ({ uid: String(r._id), solved: Number(r.solved), attempted: Number(r.attempted) }));
  scoreCache.set(win.startKey, scores);
  return scores;
}

export type LeaderboardPrefs = { optIn: boolean; displayName: string; hidden: boolean };

export async function getPrefs(db: Db, uid: string): Promise<LeaderboardPrefs | null> {
  const d = await db.collection("leaderboardPrefs").findOne({ uid });
  return d ? { optIn: d.optIn === true, displayName: String(d.displayName ?? ""), hidden: d.hidden === true } : null;
}

/** Students who chose to appear (and weren't hidden by the team), keyed by uid. */
export async function visiblePrefs(db: Db, uids: string[]): Promise<Map<string, string>> {
  if (uids.length === 0) return new Map();
  const docs = await db.collection("leaderboardPrefs").find({ uid: { $in: uids }, optIn: true, hidden: { $ne: true } }).toArray();
  return new Map(docs.filter((d) => String(d.displayName ?? "").trim()).map((d) => [String(d.uid), String(d.displayName)]));
}

export type PublicFeatured = { weekLabel: string; displayName: string; message: string; solved: number; accuracy: number };

const toPublic = (d: Record<string, unknown>): PublicFeatured => ({
  weekLabel: String(d.weekLabel ?? ""),
  displayName: String(d.displayName ?? ""),
  message: String(d.message ?? ""),
  solved: Number(d.solved ?? 0),
  accuracy: Number(d.accuracy ?? 0),
});

/** The latest published shout-out (the team publishes one per week). Public: nickname and message only. */
export async function currentFeatured(db: Db): Promise<PublicFeatured | null> {
  const hit = featuredCache.get("current");
  if (hit !== undefined) return hit;
  const d = await db.collection("studentOfTheWeek").find({}).sort({ weekStart: -1 }).limit(1).next();
  const value = d ? toPublic(d) : null;
  featuredCache.set("current", value);
  return value;
}

export function forgetFeatured() {
  featuredCache.set("current", undefined as unknown as null); // next read goes to the database
}
