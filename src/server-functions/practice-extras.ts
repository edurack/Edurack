// Everything that keeps students practising between tests: the Today summary
// (streak, daily question, revision due, next weak chapter), the revision
// notebook (due / mistakes / bookmarks), timed drills, and the post-session
// upsell.
//
// Same rules as pyq-practice.ts: only eligible PYQs (our own batches, never
// mentor series) are ever served, the question lists never carry answers or
// solutions, and progress lives in practiceProgress, never in testAttempts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { loadAttemptTopicAnalysis } from "@/lib/attempt-topics";
import { recordPracticeOutcomes } from "@/lib/practice-progress";
import {
  balancedPick,
  DRILL_QUESTIONS,
  EMPTY_STREAK,
  effectiveStreak,
  istDayKey,
  pickDailyIndex,
  remainingSeconds,
  scoreDrill,
  weekStrip,
  type DrillAnswer,
} from "@/lib/practice-schedule";
import {
  buildQuestions,
  chapterOr,
  displayExpr,
  eligibleBundleIds,
  examForAttempt,
  loadOwnedAttempt,
  practiceKeysFor,
  practiceKeysBatch,
  pyqMatch,
  QUESTION_PROJECTION,
  resolveExam,
  weakChapterAvailability,
  type Db,
} from "@/lib/pyq-server";
import {
  UNTAGGED_CHAPTER,
  type Difficulty,
  type DrillResult,
  type DrillSet,
  type DrillState,
  type NotebookSummary,
  type OptionKey,
  type PyqList,
  type PyqStatus,
  type SessionKind,
  type TodaySummary,
  type UpsellBundle,
  type WeakUpsell,
} from "@/lib/pyq-types";
import type { ExamKey } from "@/lib/admin-types";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

const OID = /^[a-f0-9]{24}$/i;
const SECONDS_PER_DRILL_QUESTION = 90;
const MIN_DRILL_QUESTIONS = 5;
const MAX_SESSION = 300;
const weakFocusCache = createTtlCache<{ subject: string; chapter: string }[]>(10 * 60_000);

let indexesEnsured = false;
async function ensureExtrasIndexes(db: Db) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await db.collection("dailyPyq").createIndex({ key: 1 }, { unique: true });
    await db.collection("practiceStreaks").createIndex({ uid: 1 }, { unique: true });
    await db.collection("practiceProgress").createIndex({ uid: 1, nextReviewAt: 1 });
    await db.collection("pyqDrills").createIndex({ uid: 1, startedAt: -1 });
  } catch {
    // best-effort; everything works without them
  }
}

// ─── Today's question: one per exam per IST day, the same for everyone ─────
async function dailyQuestionId(db: Db, exam: ExamKey | null, day: string): Promise<string | null> {
  const key = `${exam ?? "all"}|${day}`;
  const col = db.collection("dailyPyq");
  const hit = await col.findOne({ key });
  if (hit) return hit.questionId as string;

  const pool = await db.collection("questions").find(await pyqMatch(db, exam), { projection: { _id: 1 } }).sort({ _id: 1 }).limit(5000).toArray();
  if (pool.length === 0) return null;
  const id = String(pool[pickDailyIndex(key, pool.length)]._id);
  // Two students opening the app at once must still see the same question.
  await col.updateOne({ key }, { $setOnInsert: { key, day, exam, questionId: id, createdAt: new Date() } }, { upsert: true });
  return ((await col.findOne({ key }))?.questionId as string | undefined) ?? id;
}

/** The weakest chapter of the student's latest test that has PYQs to practise. */
async function latestWeakChapter(db: Db, uid: string): Promise<TodaySummary["weak"]> {
  const attempt = await db.collection("testAttempts").find({ uid }).sort({ submittedAt: -1, _id: -1 }).limit(1).next();
  if (!attempt) return null;
  const attemptId = String(attempt._id);
  let focus = weakFocusCache.get(attemptId);
  if (!focus) {
    focus = (await loadAttemptTopicAnalysis(db, attempt)).focus.map((f) => ({ subject: f.subject, chapter: f.chapter }));
    weakFocusCache.set(attemptId, focus);
  }
  if (focus.length === 0) return null;
  const exam = await examForAttempt(db, uid, attempt);
  const avail = await weakChapterAvailability(db, uid, exam, focus);
  const next = avail.find((c) => c.available > c.solved) ?? null; // first weak chapter with something left to practise
  return next ? { attemptId, subject: next.subject, chapter: next.chapter, available: next.available - next.solved } : null;
}

export const getTodaySummary = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<TodaySummary> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    await ensureExtrasIndexes(db);
    const uid = decoded.uid;
    const now = new Date();
    const exam = await resolveExam(db, uid);

    const streakDoc = await db.collection("practiceStreaks").findOne({ uid });
    const rawStreak = streakDoc
      ? { current: Number(streakDoc.current ?? 0), longest: Number(streakDoc.longest ?? 0), lastDay: (streakDoc.lastDay as string | null) ?? null }
      : EMPTY_STREAK;
    const today = istDayKey(now);
    const streak = {
      ...effectiveStreak(rawStreak, today),
      week: weekStrip(today, Array.isArray(streakDoc?.recentDays) ? (streakDoc!.recentDays as string[]) : null, rawStreak),
    };

    const dailyId = await dailyQuestionId(db, exam, istDayKey(now));
    const dailyDone = dailyId ? Boolean(await db.collection("practiceProgress").findOne({ uid, questionId: dailyId, attempts: { $gt: 0 } })) : false;
    const due = await db.collection("practiceProgress").countDocuments({ uid, nextReviewAt: { $lte: now }, mastered: { $ne: true } });
    const weak = await latestWeakChapter(db, uid).catch(() => null); // a hiccup here must never break the dashboard

    return { exam, streak, daily: { available: dailyId !== null, done: dailyDone }, due, weak };
  });

// ─── Notebook ──────────────────────────────────────────────────────────────
export const getNotebookSummary = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<NotebookSummary> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const uid = decoded.uid;
    const now = new Date();
    const col = db.collection("practiceProgress");
    const [due, wrong, bookmarked, mastered, upcoming] = await Promise.all([
      col.countDocuments({ uid, nextReviewAt: { $lte: now }, mastered: { $ne: true } }),
      col.countDocuments({ uid, attempts: { $gt: 0 }, correct: false }),
      col.countDocuments({ uid, bookmarked: true }),
      col.countDocuments({ uid, mastered: true }),
      col.find({ uid, nextReviewAt: { $gt: now } }).sort({ nextReviewAt: 1 }).limit(1).next(),
    ]);
    return {
      exam: await resolveExam(db, uid),
      due,
      wrong,
      bookmarked,
      mastered,
      nextDueAt: upcoming?.nextReviewAt instanceof Date ? upcoming.nextReviewAt.toISOString() : null,
    };
  });

// A ready-made session: today's PYQ, revision that's due, mistakes, or bookmarks.
export const listPyqSession = createServerFn({ method: "GET" })
  .validator(
    (data: { token: string; kind: SessionKind; difficulty?: Difficulty; year?: string; status?: PyqStatus | "unsolved" }) => data,
  )
  .handler(async ({ data }): Promise<PyqList> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const uid = decoded.uid;
    const now = new Date();
    const col = db.collection("practiceProgress");

    let ids: string[] = [];
    if (data.kind === "daily") {
      const id = await dailyQuestionId(db, await resolveExam(db, uid), istDayKey(now));
      ids = id ? [id] : [];
    } else {
      const filter =
        data.kind === "due"
          ? { uid, nextReviewAt: { $lte: now }, mastered: { $ne: true } }
          : data.kind === "wrong"
            ? { uid, attempts: { $gt: 0 }, correct: false }
            : { uid, bookmarked: true };
      const sort = data.kind === "due" ? { nextReviewAt: 1 as const } : { updatedAt: -1 as const };
      const rows = await col.find(filter).sort(sort).limit(MAX_SESSION).toArray();
      ids = rows.map((r) => r.questionId as string);
    }
    ids = ids.filter((id) => OID.test(id));
    if (ids.length === 0) return { questions: [], years: [], total: 0 };

    const { ObjectId } = await import("mongodb");
    const match: Record<string, unknown> = { ...(await pyqMatch(db, null)), _id: { $in: ids.map((id) => new ObjectId(id)) } };
    if (data.difficulty) match.difficulty = data.difficulty;
    const docs = await db.collection("questions").find(match, { projection: QUESTION_PROJECTION }).toArray();
    const order = new Map(ids.map((id, i) => [id, i]));
    docs.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0)); // keep the session's own order
    let questions = await buildQuestions(db, uid, docs);

    const years = [...new Set(questions.map((q) => q.source.year).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a));
    if (data.year) questions = questions.filter((q) => q.source.year === data.year);
    if (data.status === "unsolved") questions = questions.filter((q) => q.status !== "correct");
    else if (data.status) questions = questions.filter((q) => q.status === data.status);
    return { questions: questions.slice(0, MAX_SESSION), years, total: questions.length };
  });

export const togglePyqBookmark = createServerFn({ method: "POST" })
  .validator((data: { token: string; questionId: string; value: boolean }) => data)
  .handler(async ({ data }): Promise<{ bookmarked: boolean }> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    if (!OID.test(data.questionId)) throw new Error("Question not found.");
    const where = { uid: decoded.uid, questionId: data.questionId };
    const now = new Date();
    const col = db.collection("practiceProgress");

    if (!data.value) {
      await col.updateOne(where, { $set: { bookmarked: false, updatedAt: now } });
      return { bookmarked: false };
    }
    const q = await db.collection("questions").findOne({ _id: new ObjectId(data.questionId) }, { projection: { isPYQ: 1, bundleId: 1, subject: 1, chapter: 1, topic: 1 } });
    if (!q || q.isPYQ !== true || !(await eligibleBundleIds(db)).includes(String(q.bundleId))) throw new Error("Question not found.");
    await col.updateOne(
      where,
      {
        $set: { ...(await practiceKeysFor(db, q)), bookmarked: true, updatedAt: now },
        $setOnInsert: { attempts: 0, correct: false, createdAt: now },
      },
      { upsert: true },
    );
    return { bookmarked: true };
  });

// ─── Timed drills: 20 PYQs, 30 minutes, +4 / −1, server-side clock ─────────
const shuffle = <T,>(a: T[]) => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

async function drillSetFor(db: Db, uid: string, drill: Record<string, unknown>, now: Date): Promise<DrillSet> {
  const { ObjectId } = await import("mongodb");
  const ids = drill.questionIds as string[];
  const docs = await db.collection("questions").find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }, { projection: QUESTION_PROJECTION }).toArray();
  const order = new Map(ids.map((id, i) => [id, i]));
  docs.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
  const durationSec = drill.durationSec as number;
  return {
    drillId: String(drill._id),
    durationSec,
    remainingSec: remainingSeconds(drill.startedAt as Date, durationSec, now),
    questions: await buildQuestions(db, uid, docs),
  };
}

export const startPyqDrill = createServerFn({ method: "POST" })
  .validator((data: { token: string; exam?: string; subject?: string }) => data)
  .handler(async ({ data }): Promise<DrillSet> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    await ensureExtrasIndexes(db);
    const uid = decoded.uid;
    const now = new Date();
    const col = db.collection("pyqDrills");

    // Refreshing or re-tapping "Start" resumes the running drill instead of burning a new one.
    const running = await col.find({ uid, submittedAt: null }).sort({ startedAt: -1 }).limit(1).next();
    if (running && remainingSeconds(running.startedAt as Date, running.durationSec as number, now) > 0) return drillSetFor(db, uid, running, now);

    const exam = await resolveExam(db, uid, data.exam);
    const match: Record<string, unknown> = { ...(await pyqMatch(db, exam)) };
    if (data.subject) match.subject = data.subject;
    const pool = await db.collection("questions").find(match, { projection: { _id: 1, subject: 1 } }).limit(3000).toArray();

    // Unseen first, then past mistakes, then already-solved — shuffled inside each tier.
    const progress = await db
      .collection("practiceProgress")
      .find({ uid, questionId: { $in: pool.map((p) => String(p._id)) } }, { projection: { questionId: 1, attempts: 1, correct: 1 } })
      .toArray();
    const seen = new Map(progress.map((p) => [p.questionId as string, p]));
    const tier = (id: string) => {
      const p = seen.get(id);
      return !p || !(Number(p.attempts) > 0) ? 0 : p.correct === true ? 2 : 1;
    };
    const ranked = [0, 1, 2].flatMap((t) => shuffle(pool.filter((p) => tier(String(p._id)) === t))).map((p) => ({ id: String(p._id), subject: p.subject as string }));
    const picked = data.subject ? ranked.slice(0, DRILL_QUESTIONS) : balancedPick(ranked, DRILL_QUESTIONS);
    if (picked.length < MIN_DRILL_QUESTIONS) throw new Error("There aren't enough PYQs yet for a timed drill. Check back soon.");

    const questionIds = shuffle(picked).map((p) => p.id);
    const doc = {
      uid,
      exam,
      subject: data.subject ?? null,
      questionIds,
      durationSec: questionIds.length * SECONDS_PER_DRILL_QUESTION,
      startedAt: now,
      submittedAt: null as Date | null,
    };
    const res = await col.insertOne(doc);
    return drillSetFor(db, uid, { ...doc, _id: res.insertedId }, now);
  });

async function drillResultFor(db: Db, uid: string, drill: Record<string, unknown>): Promise<DrillResult> {
  const { ObjectId } = await import("mongodb");
  const ids = drill.questionIds as string[];
  const docs = await db.collection("questions").find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }).toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const order = docs.slice().sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
  const stored = drill.result as Omit<DrillResult, "drillId" | "review" | "questions">;
  return {
    drillId: String(drill._id),
    ...stored,
    review: ids
      .map((id) => byId.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({
        id: String(d._id),
        ...(d.type === "mcq" ? { correctOption: d.correctOption as OptionKey } : { correctAnswer: d.correctAnswer as number }),
        solution: (d.solution as string) ?? "",
      })),
    questions: await buildQuestions(db, uid, order.map((d) => {
      // Only the student-safe fields go through the shared mapper.
      const { correctOption: _o, correctAnswer: _a, solution: _s, ...safe } = d as Record<string, unknown>;
      return safe;
    })),
  };
}

async function ownedDrill(db: Db, uid: string, drillId: string) {
  const { ObjectId } = await import("mongodb");
  if (!OID.test(drillId)) throw new Error("Drill not found.");
  const drill = await db.collection("pyqDrills").findOne({ _id: new ObjectId(drillId) });
  if (!drill || drill.uid !== uid) throw new Error("Drill not found.");
  return drill;
}

export const getPyqDrill = createServerFn({ method: "GET" })
  .validator((data: { token: string; drillId: string }) => data)
  .handler(async ({ data }): Promise<DrillState> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const drill = await ownedDrill(db, decoded.uid, data.drillId);
    if (drill.submittedAt) return { status: "done", result: await drillResultFor(db, decoded.uid, drill) };
    return { status: "running", set: await drillSetFor(db, decoded.uid, drill, new Date()) };
  });

export const submitPyqDrill = createServerFn({ method: "POST" })
  .validator((data: { token: string; drillId: string; answers: Record<string, DrillAnswer> }) => data)
  .handler(async ({ data }): Promise<DrillResult> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const uid = decoded.uid;
    const drill = await ownedDrill(db, uid, data.drillId);
    // Submitting twice (double tap, auto-submit racing the button) returns the same result.
    if (drill.submittedAt) return drillResultFor(db, uid, drill);

    const { ObjectId } = await import("mongodb");
    const ids = drill.questionIds as string[];
    const docs = await db.collection("questions").find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }).toArray();

    // Only answers for this drill's own questions, in the expected shape.
    const clean: Record<string, DrillAnswer> = {};
    for (const id of ids) {
      const a = data.answers?.[id];
      if (a && typeof a === "object") clean[id] = { option: typeof a.option === "string" ? a.option : undefined, value: typeof a.value === "number" ? a.value : undefined };
    }
    const scored = scoreDrill(
      docs.map((d) => ({ id: String(d._id), type: (d.type as "mcq" | "integer") ?? "mcq", correctOption: d.correctOption as string | undefined, correctAnswer: d.correctAnswer as number | undefined })),
      clean,
    );

    // Every answered question enters the same notebook as normal practice.
    const keys = await practiceKeysBatch(db, docs);
    const entries = scored.items
      .filter((i) => i.outcome !== "skipped")
      .map((i) => ({
        questionId: i.id,
        outcome: i.outcome as "correct" | "wrong",
        lastAnswer: (clean[i.id]?.option ?? clean[i.id]?.value) as string | number | undefined,
        keys: keys.get(i.id)!,
      }));
    await recordPracticeOutcomes(db, uid, entries);

    const now = new Date();
    const timeTakenSec = Math.min(drill.durationSec as number, Math.max(0, Math.round((now.getTime() - (drill.startedAt as Date).getTime()) / 1000)));
    const result = { ...scored, timeTakenSec };
    await db.collection("pyqDrills").updateOne({ _id: drill._id, submittedAt: null }, { $set: { submittedAt: now, answers: clean, result } });
    return drillResultFor(db, uid, { ...drill, submittedAt: now, result });
  });

// ─── Upsell after a weak-topics session ────────────────────────────────────
// Paid bundles (not already owned) whose tests actually contain questions from
// the student's weak chapters. Honest by construction: a bundle only appears
// if the match is real, and we say how many questions it has on those chapters.
export const getWeakUpsell = createServerFn({ method: "GET" })
  .validator((data: { token: string; attemptId: string }) => data)
  .handler(async ({ data }): Promise<WeakUpsell> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const uid = decoded.uid;
    const attempt = await loadOwnedAttempt(db, uid, data.attemptId);
    const { focus } = await loadAttemptTopicAnalysis(db, attempt);
    if (focus.length === 0) return { bundles: [], weakSubjects: [] };
    const exam = await examForAttempt(db, uid, attempt);

    const breakdown = (attempt.subjectBreakdown ?? []) as { subject: string; correct: number; incorrect: number; unanswered: number; marks: number }[];
    const weakSubjects = [...new Set(focus.map((f) => f.subject))].map((subject) => {
      const b = breakdown.find((x) => x.subject === subject);
      const total = b ? (b.correct + b.incorrect + b.unanswered) * 4 : 0;
      return { subject, percent: b && total > 0 ? Math.max(0, Math.min(100, Math.round((b.marks / total) * 100))) : 0 };
    });

    const owned = await db.collection("purchases").find({ uid, itemType: "bundle" }, { projection: { itemId: 1 } }).toArray();
    const ownedIds = new Set(owned.map((p) => String(p.itemId)));
    const attemptTest = await db.collection("testCores").findOne({ _id: new ObjectId(String(attempt.testId)) }, { projection: { bundleId: 1 } }).catch(() => null);
    if (attemptTest?.bundleId) ownedIds.add(String(attemptTest.bundleId)); // the bundle they're already inside

    // Our own paid bundles only: standard bundles carry no `kind`, mentor series are marked "mentorBatchSeries".
    const filter: Record<string, unknown> = { kind: { $ne: "mentorBatchSeries" }, sellingPrice: { $gt: 0 } };
    if (exam) filter.exam = exam === "neet" ? { $in: ["neet", null] } : exam;
    const today = new Date();
    const candidates = (await db.collection("bundles").find(filter).limit(200).toArray()).filter(
      (b) => !ownedIds.has(String(b._id)) && !(b.expiryDate && !Number.isNaN(Date.parse(String(b.expiryDate))) && new Date(String(b.expiryDate)) < today),
    );
    if (candidates.length === 0) return { bundles: [], weakSubjects };

    const rows = await db
      .collection("questions")
      .aggregate([
        { $match: { isPYQ: { $ne: true }, bundleId: { $in: candidates.map((c) => String(c._id)) }, $or: chapterOr(focus) } },
        { $group: { _id: "$bundleId", n: { $sum: 1 }, chapters: { $addToSet: displayExpr("chapter", UNTAGGED_CHAPTER) } } },
        { $sort: { n: -1 } },
        { $limit: 2 },
      ])
      .toArray();
    const byId = new Map(candidates.map((c) => [String(c._id), c]));
    const bundles: UpsellBundle[] = rows
      .map((r) => {
        const b = byId.get(String(r._id));
        if (!b) return null;
        return {
          id: String(b._id),
          title: String(b.title ?? ""),
          exam: ((b.exam as ExamKey | null | undefined) ?? null) as ExamKey | null,
          sellingPrice: Number(b.sellingPrice ?? 0),
          crossedPrice: Number(b.crossedPrice ?? 0),
          thumbnailUrl: (b.thumbnailUrl as string | null | undefined) ?? null,
          matchingQuestions: r.n as number,
          chapters: (r.chapters as string[]).slice(0, 4),
        };
      })
      .filter((b): b is UpsellBundle => b !== null);
    return { bundles, weakSubjects };
  });
