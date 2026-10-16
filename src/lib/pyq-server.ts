// Shared server-side helpers for every PYQ / practice server function. Lives in
// lib/ (not server-functions/) on purpose: this repo's rule is that server
// function files never import helpers from each other, so shared code goes
// here, the same way lib/attempt-topics.ts does. Everything takes `db` as a
// parameter; nothing here talks to auth.
import type { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { buildPyqSource } from "@/lib/pyq-label";
import { EXAM_KEYS, type ExamKey } from "@/lib/admin-types";
import { OUT_OF_SYLLABUS } from "@/lib/ncert-syllabus";
import {
  GENERAL_TOPIC,
  GUEST_PYQ_LIMIT,
  UNTAGGED_CHAPTER,
  type Difficulty,
  type OptionKey,
  type PyqQuestion,
  type PyqStatus,
  type PyqTree,
} from "@/lib/pyq-types";

export type Db = Awaited<ReturnType<typeof getDb>>;

const eligibleBundlesCache = createTtlCache<string[]>(5 * 60_000);

const bundleInfoCache = createTtlCache<{ title: string; exam: string | null }>(10 * 60_000);

const testNameCache = createTtlCache<string>(10 * 60_000);

let indexesEnsured = false;

export async function ensureProgressIndexes(db: Db) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const c = db.collection("practiceProgress");
    await c.createIndex({ uid: 1, questionId: 1 }, { unique: true });
    await c.createIndex({ uid: 1, subject: 1 });
  } catch {
    // Index creation is best-effort; reads/writes work without it.
  }
}

let questionIndexesEnsured = false;

/**
 * Every PYQ list endpoint matches on `isPYQ` + `bundleId` (+ usually `subject`),
 * then narrows further with an `$expr` over chapter/topic that can't use an
 * index on its own. Without these, Mongo has no way to use an index at all and
 * falls back to a full collection scan of `questions` on every request — the
 * main cause of slow/frozen PYQ practice loads. These let it jump straight to
 * the matching subject within the eligible bundles before evaluating the
 * (unindexable) chapter/topic expression on a much smaller candidate set.
 */
export async function ensureQuestionIndexes(db: Db) {
  if (questionIndexesEnsured) return;
  questionIndexesEnsured = true;
  try {
    const c = db.collection("questions");
    await c.createIndex({ isPYQ: 1, bundleId: 1, subject: 1 });
    await c.createIndex({ bundleId: 1, isPYQ: 1 });
  } catch {
    // Index creation is best-effort; reads/writes work without it.
  }
}

/** Turn a stored/typed value ("JEE", "jee", "JEE Mains") into an ExamKey, or null. */
export function toExamKey(v: unknown): ExamKey | null {
  const t = String(v ?? "").toLowerCase();
  return EXAM_KEYS.find((k) => t.includes(k)) ?? null;
}

/**
 * Which exam's PYQs this student should see. An explicit, valid `requested`
 * exam (the switcher chips) wins; otherwise we use the student's saved
 * targetExam. null = unknown → show everything (old behaviour).
 */
export async function resolveExam(db: Db, uid: string, requested?: string): Promise<ExamKey | null> {
  const asked = toExamKey(requested);
  if (asked) return asked;
  const profile = await db.collection("profiles").findOne({ uid }, { projection: { targetExam: 1 } });
  return toExamKey(profile?.targetExam);
}

/** Bundles whose PYQs may be shown (never mentor batch series), optionally for ONE exam. */
export async function eligibleBundleIds(db: Db, exam: ExamKey | null = null): Promise<string[]> {
  const cacheKey = exam ?? "all";
  const hit = eligibleBundlesCache.get(cacheKey);
  if (hit) return hit;
  const filter: Record<string, unknown> = { kind: { $ne: "mentorBatchSeries" } };
  if (exam) {
    // Old bundles have no `exam` field — the rest of the app treats those as NEET.
    filter.exam = exam === "neet" ? { $in: ["neet", null] } : exam;
  }
  const rows = await db.collection("bundles").find(filter, { projection: { _id: 1 } }).toArray();
  const ids = rows.map((r) => String(r._id));
  eligibleBundlesCache.set(cacheKey, ids);
  return ids;
}

// Mongo expression: the chapter/topic as a trimmed, lower-cased key, with the
// "untagged"/"general" fallback — so "Kinematics" and "kinematics " group together.
export const keyExpr = (field: "chapter" | "topic", fallback: string) => ({
  $toLower: {
    $let: {
      vars: { c: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ""] } } } } },
      in: { $cond: [{ $eq: ["$$c", ""] }, fallback, "$$c"] },
    },
  },
});

export const displayExpr = (field: "chapter" | "topic", fallback: string) => ({
  $let: {
    vars: { c: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ""] } } } } },
    in: { $cond: [{ $eq: ["$$c", ""] }, fallback, "$$c"] },
  },
});

export async function pyqMatch(db: Db, exam: ExamKey | null = null) {
  return { isPYQ: true, bundleId: { $in: await eligibleBundleIds(db, exam) } };
}

export async function loadSources(db: Db, docs: Record<string, unknown>[]) {
  const { ObjectId } = await import("mongodb");
  const bundleIds = [...new Set(docs.map((d) => String(d.bundleId ?? "")).filter(Boolean))];
  const testIds = [...new Set(docs.map((d) => String(d.testId ?? "")).filter(Boolean))];
  const safeOid = (id: string) => (/^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null);

  const missingBundles = bundleIds.filter((id) => !bundleInfoCache.get(id));
  if (missingBundles.length) {
    const rows = await db
      .collection("bundles")
      .find({ _id: { $in: missingBundles.map(safeOid).filter((x): x is InstanceType<typeof ObjectId> => !!x) } }, { projection: { title: 1, exam: 1 } })
      .toArray();
    for (const r of rows) bundleInfoCache.set(String(r._id), { title: (r.title as string) ?? "", exam: (r.exam as string) ?? null });
  }
  const missingTests = testIds.filter((id) => testNameCache.get(id) === undefined);
  if (missingTests.length) {
    const rows = await db
      .collection("testCores")
      .find({ _id: { $in: missingTests.map(safeOid).filter((x): x is InstanceType<typeof ObjectId> => !!x) } }, { projection: { name: 1 } })
      .toArray();
    for (const r of rows) testNameCache.set(String(r._id), (r.name as string) ?? "");
  }
  return { bundleInfo: (id: string) => bundleInfoCache.get(id), testName: (id: string) => testNameCache.get(id) };
}

export const statusOf = (p?: Record<string, unknown> | null): PyqStatus => {
  if (!p) return "new";
  if (p.correct === true) return "correct";
  if (Number(p.attempts ?? 0) > 0) return "wrong";
  return p.revealed === true ? "revealed" : "new";
};

// What the student is allowed to see about a question — never the answer or solution.
export const QUESTION_PROJECTION = {
  // Deliberately NOT projected: correctOption, correctAnswer, solution.
  subject: 1, chapter: 1, topic: 1, type: 1, body: 1, options: 1, difficulty: 1, pyqYear: 1, bundleId: 1, testId: 1,
} as const;

/** Question docs → what the client gets (source label + this student's status). Shared by every list endpoint. */
export async function buildQuestions(db: Db, uid: string, docs: Record<string, unknown>[]): Promise<PyqQuestion[]> {
    const sources = await loadSources(db, docs);
    // Guests (the public /question pages pass uid "") have no progress rows, so
    // skip the round trip instead of querying practiceProgress for uid: "".
    const progress = uid
      ? await db
          .collection("practiceProgress")
          .find({ uid, questionId: { $in: docs.map((d) => String(d._id)) } })
          .toArray()
      : [];
    const progMap = new Map(progress.map((p) => [p.questionId as string, p]));

    return docs.map((d) => {
      const bundle = sources.bundleInfo(String(d.bundleId ?? ""));
      const chapter = String(d.chapter ?? "").trim() || UNTAGGED_CHAPTER;
      const topic = String(d.topic ?? "").trim() || GENERAL_TOPIC;
      return {
        id: String(d._id),
        subject: d.subject as string,
        chapter,
        topic,
        type: (d.type as "mcq" | "integer") ?? "mcq",
        body: d.body as string,
        ...(d.type === "mcq" || !d.type ? { options: d.options as Record<OptionKey, string> } : {}),
        difficulty: d.difficulty as Difficulty,
        source: buildPyqSource({
          bundleTitle: bundle?.title,
          testName: sources.testName(String(d.testId ?? "")),
          pyqYear: (d.pyqYear as string | undefined) ?? null,
          examKey: bundle?.exam ?? null,
        }),
        status: statusOf(progMap.get(String(d._id))),
        bookmarked: Boolean(progMap.get(String(d._id))?.bookmarked),
      };
    });
}

export async function loadOwnedAttempt(db: Db, uid: string, attemptId: string) {
  const { ObjectId } = await import("mongodb");
  if (!/^[a-f0-9]{24}$/i.test(attemptId)) throw new Error("Attempt not found");
  const attempt = await db.collection("testAttempts").findOne({ _id: new ObjectId(attemptId) });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.uid !== uid) throw new Error("You don't have access to this attempt.");
  return attempt;
}

/** The exam this attempt belongs to: its batch's exam, else the student's saved target exam, else null. */
export async function examForAttempt(db: Db, uid: string, attempt: Record<string, unknown>): Promise<ExamKey | null> {
  try {
    const { ObjectId } = await import("mongodb");
    const test = await db.collection("testCores").findOne({ _id: new ObjectId(String(attempt.testId)) }, { projection: { bundleId: 1 } });
    if (test?.bundleId) {
      const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(String(test.bundleId)) }, { projection: { exam: 1 } });
      // Old bundles have no `exam` field — the rest of the app treats those as NEET.
      if (bundle) return toExamKey(bundle.exam) ?? "neet";
    }
  } catch {
    // fall through to the profile
  }
  return resolveExam(db, uid);
}

export const chapterOr = (chapters: { subject: string; chapter: string }[]) =>
  chapters.map((c) => ({
    subject: c.subject,
    $expr: { $eq: [keyExpr("chapter", UNTAGGED_CHAPTER), c.chapter.trim().toLowerCase()] },
  }));

/** The keys practiceProgress groups by (exam / subject / chapter / topic) for a question document. */
export async function practiceKeysFor(db: Db, q: Record<string, unknown>) {
  const { ObjectId } = await import("mongodb");
  const chapter = String(q.chapter ?? "").trim() || UNTAGGED_CHAPTER;
  const topic = String(q.topic ?? "").trim() || GENERAL_TOPIC;
  const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(String(q.bundleId)) }, { projection: { exam: 1 } });
  return { exam: toExamKey(bundle?.exam) ?? "neet", subject: q.subject as string, chapterKey: chapter.toLowerCase(), topicKey: topic.toLowerCase() };
}

/** Same as practiceKeysFor, for many questions with one bundle lookup per distinct bundle. */
export async function practiceKeysBatch(db: Db, docs: Record<string, unknown>[]) {
  const { ObjectId } = await import("mongodb");
  const bundleIds = [...new Set(docs.map((d) => String(d.bundleId ?? "")).filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
  const rows = bundleIds.length
    ? await db.collection("bundles").find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } }, { projection: { exam: 1 } }).toArray()
    : [];
  const examById = new Map(rows.map((r) => [String(r._id), toExamKey(r.exam) ?? "neet"]));
  return new Map(
    docs.map((q) => {
      const chapter = String(q.chapter ?? "").trim() || UNTAGGED_CHAPTER;
      const topic = String(q.topic ?? "").trim() || GENERAL_TOPIC;
      return [
        String(q._id),
        { exam: examById.get(String(q.bundleId)) ?? "neet", subject: q.subject as string, chapterKey: chapter.toLowerCase(), topicKey: topic.toLowerCase() },
      ] as const;
    }),
  );
}

/** For each weak chapter: how many PYQs exist for the exam, and how many this student already solved. */
export async function weakChapterAvailability(
  db: Db,
  uid: string,
  exam: ExamKey | null,
  focus: { subject: string; chapter: string }[],
): Promise<{ subject: string; chapter: string; available: number; solved: number }[]> {
  if (focus.length === 0) return [];
  const available = await db
    .collection("questions")
    .aggregate([
      { $match: { ...(await pyqMatch(db, exam)), $or: chapterOr(focus) } },
      { $group: { _id: { subject: "$subject", chapterKey: keyExpr("chapter", UNTAGGED_CHAPTER) }, n: { $sum: 1 } } },
    ])
    .toArray();
  const solved = await db
    .collection("practiceProgress")
    .aggregate([
      { $match: { uid, $or: focus.map((f) => ({ subject: f.subject, chapterKey: f.chapter.trim().toLowerCase() })) } },
      { $group: { _id: { subject: "$subject", chapterKey: "$chapterKey" }, n: { $sum: { $cond: ["$correct", 1, 0] } } } },
    ])
    .toArray();
  const key = (subject: string, chapter: string) => `${subject}|${chapter.trim().toLowerCase()}`;
  const availMap = new Map(available.map((a) => [key(a._id.subject, a._id.chapterKey), a.n as number]));
  const solvedMap = new Map(solved.map((a) => [key(a._id.subject, a._id.chapterKey), a.n as number]));
  return focus.map((f) => {
    const n = availMap.get(key(f.subject, f.chapter)) ?? 0;
    return { subject: f.subject, chapter: f.chapter, available: n, solved: Math.min(solvedMap.get(key(f.subject, f.chapter)) ?? 0, n) };
  });
}

// ─── Browse tree (shared by the signed-in and the guest endpoints) ─────────
export type TreeRow = { subject: string; chapter: string; topic: string; chapterKey: string; topicKey: string; count: number };

// Same for every caller (per exam), so it is cached. Per-student progress never is.
const treeRowsCache = createTtlCache<TreeRow[]>(10 * 60_000); // keyed by exam

export async function loadTreeRows(db: Db, exam: ExamKey | null): Promise<TreeRow[]> {
  const treeKey = exam ?? "all";
  const hit = treeRowsCache.get(treeKey);
  if (hit) return hit;
  const agg = await db
    .collection("questions")
    .aggregate([
      { $match: await pyqMatch(db, exam) },
      {
        $group: {
          _id: {
            subject: "$subject",
            chapterKey: keyExpr("chapter", UNTAGGED_CHAPTER),
            topicKey: keyExpr("topic", GENERAL_TOPIC),
          },
          chapter: { $first: displayExpr("chapter", UNTAGGED_CHAPTER) },
          topic: { $first: displayExpr("topic", GENERAL_TOPIC) },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const rows = agg.map((a) => ({
    subject: a._id.subject as string,
    chapterKey: a._id.chapterKey as string,
    topicKey: a._id.topicKey as string,
    chapter: a.chapter as string,
    topic: a.topic as string,
    count: a.count as number,
  }));
  treeRowsCache.set(treeKey, rows);
  return rows;
}

/** Rows (+ optional per-student progress keyed "subject|chapterKey|topicKey") → the Subject → Chapter → Topic tree. */
export function assembleTree(
  rows: TreeRow[],
  progMap: Map<string, { attempted: number; correct: number }>,
  exam: ExamKey | null,
): PyqTree {
  const subjects = new Map<string, PyqTree["subjects"][number]>();
  for (const r of rows) {
    const p = progMap.get(`${r.subject}|${r.chapterKey}|${r.topicKey}`) ?? { attempted: 0, correct: 0 };
    // Progress can outlive a deleted question; never show more than exists.
    const attempted = Math.min(p.attempted, r.count);
    const correct = Math.min(p.correct, r.count);

    const s = subjects.get(r.subject) ?? { subject: r.subject, count: 0, attempted: 0, correct: 0, chapters: [] };
    subjects.set(r.subject, s);
    let c = s.chapters.find((x) => x.chapter.toLowerCase() === r.chapter.toLowerCase());
    if (!c) {
      c = { chapter: r.chapter, count: 0, attempted: 0, correct: 0, topics: [] };
      s.chapters.push(c);
    }
    c.topics.push({ topic: r.topic, count: r.count, attempted, correct });
    for (const n of [c, s]) {
      n.count += r.count;
      n.attempted += attempted;
      n.correct += correct;
    }
  }

  const byName = (a: string, b: string) => {
    // The untagged bucket always sits last.
    if (a === UNTAGGED_CHAPTER || a === OUT_OF_SYLLABUS) return 1;
    if (b === UNTAGGED_CHAPTER || b === OUT_OF_SYLLABUS) return -1;
    if (a === GENERAL_TOPIC) return 1;
    if (b === GENERAL_TOPIC) return -1;
    return a.localeCompare(b);
  };
  const out = Array.from(subjects.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  for (const s of out) {
    s.chapters.sort((a, b) => byName(a.chapter, b.chapter));
    for (const c of s.chapters) c.topics.sort((a, b) => byName(a.topic, b.topic));
  }
  return {
    exam,
    subjects: out,
    totalQuestions: out.reduce((n, s) => n + s.count, 0),
    totalCorrect: out.reduce((n, s) => n + s.correct, 0),
  };
}

// ─── Guest (logged-out) practice ───────────────────────────────────────────
// A guest only ever sees the first GUEST_PYQ_LIMIT questions of a chapter (or
// of a topic), newest paper first. The same rule decides which questions a
// guest may submit an answer for, so the answer endpoint can't be used to pull
// solutions for the rest of the bank.

/** Mongo filter for one chapter (and optionally one topic) of a subject, within an exam's PYQ bundles. */
export async function scopeMatch(db: Db, exam: ExamKey | null, subject: string, chapter: string, topic?: string) {
  const and: Record<string, unknown>[] = [{ $expr: { $eq: [keyExpr("chapter", UNTAGGED_CHAPTER), chapter.trim().toLowerCase()] } }];
  if (topic) and.push({ $expr: { $eq: [keyExpr("topic", GENERAL_TOPIC), topic.trim().toLowerCase()] } });
  return { ...(await pyqMatch(db, exam)), subject, $and: and } as Record<string, unknown>;
}

/** The (at most GUEST_PYQ_LIMIT) question docs a guest may see for a scope. */
export async function guestScopeDocs(db: Db, match: Record<string, unknown>, projection?: Record<string, 0 | 1>) {
  return db
    .collection("questions")
    .find(match, projection ? { projection } : undefined)
    .sort({ pyqYear: -1, _id: 1 })
    .limit(GUEST_PYQ_LIMIT)
    .toArray();
}

/** May a guest answer this question? True if it is in the free slice of its chapter or of its topic. */
export async function isGuestQuestion(db: Db, exam: ExamKey | null, q: Record<string, unknown>): Promise<boolean> {
  const id = String(q._id);
  const subject = q.subject as string;
  const chapter = String(q.chapter ?? "").trim() || UNTAGGED_CHAPTER;
  const topic = String(q.topic ?? "").trim() || GENERAL_TOPIC;
  for (const t of [undefined, topic]) {
    const docs = await guestScopeDocs(db, await scopeMatch(db, exam, subject, chapter, t), { _id: 1 });
    if (docs.some((d) => String(d._id) === id)) return true;
  }
  return false;
}
