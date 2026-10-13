// Writes what a student just practised: per-question progress (with the spaced
// revision schedule) and the daily streak. Shared by single-question practice
// and timed drills so both feed the same notebook.
import type { Db } from "@/lib/pyq-server";
import {
  advanceStreak,
  EMPTY_STREAK,
  istDayKey,
  nextReviewState,
  type Outcome,
  type Streak,
} from "@/lib/practice-schedule";

export type PracticeEntry = {
  questionId: string;
  outcome: Outcome;
  /** What they answered (option letter or number); omitted when they only revealed the solution. */
  lastAnswer?: string | number;
  keys: { exam: string; subject: string; chapterKey: string; topicKey: string };
};

/** Records outcomes for one or many questions in one round trip. Returns the new streak (if an answer, not just a peek, was given). */
export async function recordPracticeOutcomes(
  db: Db,
  uid: string,
  entries: PracticeEntry[],
  now: Date = new Date(),
): Promise<{ streak: Streak; streakIncreased: boolean } | null> {
  if (entries.length === 0) return null;
  const col = db.collection("practiceProgress");
  const existing = await col.find({ uid, questionId: { $in: entries.map((e) => e.questionId) } }).toArray();
  const prevMap = new Map(existing.map((d) => [d.questionId as string, d]));

  const ops = entries.map((e) => {
    const prev = prevMap.get(e.questionId);
    const review = nextReviewState(
      prev
        ? { reviewStage: (prev.reviewStage as number | null | undefined) ?? null, nextReviewAt: (prev.nextReviewAt as Date | null | undefined) ?? null, mastered: Boolean(prev.mastered) }
        : null,
      e.outcome,
      now,
    );
    const set: Record<string, unknown> = { ...e.keys, ...review, updatedAt: now };
    if (e.outcome === "revealed") {
      set.revealed = true;
      return {
        updateOne: {
          filter: { uid, questionId: e.questionId },
          update: { $set: set, $setOnInsert: { attempts: 0, correct: false, createdAt: now } },
          upsert: true,
        },
      };
    }
    set.correct = e.outcome === "correct";
    set.lastAnswer = e.lastAnswer ?? null;
    return {
      updateOne: {
        filter: { uid, questionId: e.questionId },
        update: { $set: set, $inc: { attempts: 1 }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    };
  });
  await col.bulkWrite(ops, { ordered: false });

  // Append-only history: practiceProgress only keeps each question's LATEST state,
  // so without this the admin can't see what was solved when, or the streak
  // reminder recap. Best-effort — never blocks or fails a student's answer.
  db.collection("practiceEvents")
    .insertMany(entries.map((e) => ({ uid, questionId: e.questionId, outcome: e.outcome, answer: e.lastAnswer ?? null, ...e.keys, at: now })))
    .catch((err) => console.error("[practiceEvents] insert failed:", err));

  // Peeking at a solution isn't practice; only real answers keep a streak alive.
  if (!entries.some((e) => e.outcome !== "revealed")) return null;
  return bumpStreak(db, uid, now);
}

export async function bumpStreak(db: Db, uid: string, now: Date = new Date()): Promise<{ streak: Streak; streakIncreased: boolean }> {
  const col = db.collection("practiceStreaks");
  const doc = await col.findOne({ uid });
  const prev: Streak = doc
    ? { current: Number(doc.current ?? 0), longest: Number(doc.longest ?? 0), lastDay: (doc.lastDay as string | null) ?? null }
    : EMPTY_STREAK;
  const today = istDayKey(now);
  const { increased, ...next } = advanceStreak(prev, today);
  // Exact time of the latest answer — the streak reminder is sent at this clock time.
  // (Written on every answer, not just the first of the day, so it tracks when they usually practise.)
  if (!increased) {
    await col.updateOne({ uid }, { $set: { lastPracticedAt: now } });
  }
  if (increased) {
    // Keep the last two weeks of practice days; the Today card draws the last seven.
    const recent = Array.isArray(doc?.recentDays) ? (doc!.recentDays as string[]) : [];
    const recentDays = [...new Set([...recent, today])].sort().slice(-14);
    await col.updateOne({ uid }, { $set: { ...next, recentDays, lastPracticedAt: now, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
  }
  return { streak: increased ? next : prev, streakIncreased: increased };
}
