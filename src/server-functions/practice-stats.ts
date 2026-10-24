// The dashboard's practice numbers, computed in ONE place (see lib/practice-stats.ts for the definitions).
// Read-only: it never writes, and it only ever reads the signed-in student's own rows.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import { buildExamStats, EMPTY_PRACTICE_STATS, type ExamStats, type LastAttempt, type PracticeExam, type PracticeStats } from "@/lib/practice-stats";
import type { Db } from "@/lib/pyq-server";

const EXAMS: PracticeExam[] = ["neet", "jee", "cuet", "ipmat"];
// Old rows were written before `exam` existed on a progress row; the rest of the app treats those as NEET.
const EXAM_OF = { $ifNull: ["$exam", "neet"] };
const IST_DAY = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: "Asia/Kolkata" } });

let indexed = false;
async function ensureIndexes(db: Db) {
  if (indexed) return;
  indexed = true;
  try {
    await db.collection("practiceEvents").createIndex({ uid: 1, at: -1 });
    await db.collection("practiceProgress").createIndex({ uid: 1, attempts: 1 });
  } catch {
    // best-effort; everything works (more slowly) without them
  }
}

type Counter = Map<string, number>;
const toMap = (rows: { _id: unknown; n: number }[]): Counter => new Map(rows.map((r) => [String(r._id), Number(r.n)]));
const get = (m: Counter, k: string) => m.get(k) ?? 0;

export async function loadPracticeStats(db: Db, uid: string, now: Date = new Date()): Promise<PracticeStats> {
  await ensureIndexes(db);
  const progress = db.collection("practiceProgress");
  const events = db.collection("practiceEvents");
  const today = istDayKey(now);
  // Last 7 IST days including today: from IST midnight six days ago.
  const weekStart = new Date(`${addDays(today, -6)}T00:00:00+05:30`);

  const answered = { uid, attempts: { $gt: 0 } };
  const [solvedRows, correctRows, dueRows, eventTotal] = await Promise.all([
    progress.aggregate([{ $match: answered }, { $group: { _id: EXAM_OF, n: { $sum: 1 } } }]).toArray(),
    progress.aggregate([{ $match: { ...answered, correct: true } }, { $group: { _id: EXAM_OF, n: { $sum: 1 } } }]).toArray(),
    // Same filter as the revision button (TodaySummary.due / the notebook's "due"), so the numbers always match it.
    progress.aggregate([{ $match: { uid, nextReviewAt: { $lte: now }, mastered: { $ne: true } } }, { $group: { _id: EXAM_OF, n: { $sum: 1 } } }]).toArray(),
    events.countDocuments({ uid, outcome: { $ne: "revealed" } }, { limit: 1 }),
  ]);

  const solved = toMap(solvedRows as { _id: unknown; n: number }[]);
  const correct = toMap(correctRows as { _id: unknown; n: number }[]);
  const due = toMap(dueRows as { _id: unknown; n: number }[]);
  const questionsAnswered = [...solved.values()].reduce((a, b) => a + b, 0);
  if (questionsAnswered === 0 && due.size === 0) return { ...EMPTY_PRACTICE_STATS };

  // Week + distinct days come from the append-only event log. A student who practised before it existed has no
  // events, so we fall back to practiceProgress (latest answer per question) and flag the result approximate.
  const approximate = eventTotal === 0;
  const src = approximate
    ? { col: progress, match: answered, at: "$updatedAt", weekMatch: { ...answered, updatedAt: { $gte: weekStart } } }
    : { col: events, match: { uid, outcome: { $ne: "revealed" } }, at: "$at", weekMatch: { uid, outcome: { $ne: "revealed" }, at: { $gte: weekStart } } };

  const [weekRows, dayRows] = await Promise.all([
    src.col.aggregate([{ $match: src.weekMatch }, { $group: { _id: EXAM_OF, n: { $sum: 1 } } }]).toArray(),
    src.col.aggregate([{ $match: src.match }, { $group: { _id: { exam: EXAM_OF, day: IST_DAY(src.at) } } }]).toArray(),
  ]);
  const week = toMap(weekRows as { _id: unknown; n: number }[]);
  const daysByExam = new Map<string, Set<string>>();
  const allDays = new Set<string>();
  for (const r of dayRows as { _id: { exam: unknown; day: unknown } }[]) {
    const day = String(r._id.day ?? "");
    if (!day || day === "null") continue;
    const exam = String(r._id.exam);
    if (!daysByExam.has(exam)) daysByExam.set(exam, new Set());
    daysByExam.get(exam)!.add(day);
    allDays.add(day);
  }

  const byExam: PracticeStats["byExam"] = {};
  for (const e of EXAMS) {
    const s = get(solved, e), d = get(due, e);
    if (s === 0 && d === 0) continue;
    byExam[e] = buildExamStats({ solved: s, correct: get(correct, e), weekAnswered: get(week, e), distinctDays: daysByExam.get(e)?.size ?? 0, due: d });
  }
  const overall: ExamStats = buildExamStats({
    solved: questionsAnswered,
    correct: [...correct.values()].reduce((a, b) => a + b, 0),
    weekAnswered: [...week.values()].reduce((a, b) => a + b, 0),
    distinctDays: allDays.size,
    due: [...due.values()].reduce((a, b) => a + b, 0),
  });

  return { questionsAnswered, overall, byExam, lastAttempt: await lastAttemptFor(db, uid, approximate), approximate };
}

/** The most recent real answer (not a peek), resolved to a displayable subject + chapter. */
async function lastAttemptFor(db: Db, uid: string, approximate: boolean): Promise<LastAttempt | null> {
  try {
    const row = approximate
      ? await db.collection("practiceProgress").find({ uid, attempts: { $gt: 0 } }).sort({ updatedAt: -1 }).limit(1).next()
      : await db.collection("practiceEvents").find({ uid, outcome: { $ne: "revealed" } }).sort({ at: -1 }).limit(1).next();
    if (!row) return null;
    const at = (approximate ? row.updatedAt : row.at) as Date | undefined;
    let subject = String(row.subject ?? "");
    let chapter = "";
    if (/^[a-f0-9]{24}$/i.test(String(row.questionId))) {
      const { ObjectId } = await import("mongodb");
      const q = await db.collection("questions").findOne({ _id: new ObjectId(String(row.questionId)) }, { projection: { subject: 1, chapter: 1 } });
      if (q) {
        subject = String(q.subject ?? subject);
        chapter = String(q.chapter ?? "").trim();
      } else {
        chapter = String(row.chapterKey ?? ""); // question since deleted: the stored (lower-case) key still matches the practice filter
      }
    }
    if (!subject) return null;
    if (chapter.toLowerCase() === "not yet tagged") chapter = "";
    return { subject, chapter, exam: (row.exam as string | undefined) ?? null, at: at instanceof Date ? at.toISOString() : new Date().toISOString() };
  } catch {
    return null; // a hiccup here must never take the dashboard down
  }
}

export const getPracticeStats = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<PracticeStats> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    return loadPracticeStats(db, decoded.uid);
  });
