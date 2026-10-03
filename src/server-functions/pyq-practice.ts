// PYQ practice: browse every Previous Year Question by Subject → Chapter →
// Topic and practise it with instant feedback.
//
// Rules this file enforces:
//  • Only questions flagged isPYQ AND belonging to one of OUR batches are
//    served. Mentor batch series (kind "mentorBatchSeries") are mentors' paid
//    content and are never exposed here.
//  • The list endpoint never returns correctOption / correctAnswer / solution.
//    Those come back only from submitPyqAnswer, after the student has tried
//    (or explicitly chosen "show solution"), so the bank can't be scraped
//    from the network tab in one request.
//  • Progress lives in its own collection (practiceProgress) and never touches
//    testAttempts, leaderboards or ranks.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { buildPyqSource } from "@/lib/pyq-label";
import { loadAttemptTopicAnalysis } from "@/lib/attempt-topics";
import { pickWeakQuestions, weakKey } from "@/lib/pyq-weak";
import { EXAM_KEYS, type ExamKey } from "@/lib/admin-types";
import {
  GENERAL_TOPIC,
  UNTAGGED_CHAPTER,
  type Difficulty,
  type OptionKey,
  type PyqAnswer,
  type PyqCheckResult,
  type PyqList,
  type PyqQuestion,
  type PyqStatus,
  type PyqTree,
  type WeakPyqSummary,
} from "@/lib/pyq-types";

const MAX_LIST = 300;
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

// ─── Public (same-for-everyone) data is cached; per-user data never is ─────
const eligibleBundlesCache = createTtlCache<string[]>(5 * 60_000);
const bundleInfoCache = createTtlCache<{ title: string; exam: string | null }>(10 * 60_000);
const testNameCache = createTtlCache<string>(10 * 60_000);
const treeCache = createTtlCache<TreeRow[]>(10 * 60_000); // keyed by exam

type Db = Awaited<ReturnType<typeof getDb>>;
type TreeRow = { subject: string; chapter: string; topic: string; chapterKey: string; topicKey: string; count: number };

let indexesEnsured = false;
async function ensureProgressIndexes(db: Db) {
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

/** Turn a stored/typed value ("JEE", "jee", "JEE Mains") into an ExamKey, or null. */
function toExamKey(v: unknown): ExamKey | null {
  const t = String(v ?? "").toLowerCase();
  return EXAM_KEYS.find((k) => t.includes(k)) ?? null;
}

/**
 * Which exam's PYQs this student should see. An explicit, valid `requested`
 * exam (the switcher chips) wins; otherwise we use the student's saved
 * targetExam. null = unknown → show everything (old behaviour).
 */
async function resolveExam(db: Db, uid: string, requested?: string): Promise<ExamKey | null> {
  const asked = toExamKey(requested);
  if (asked) return asked;
  const profile = await db.collection("profiles").findOne({ uid }, { projection: { targetExam: 1 } });
  return toExamKey(profile?.targetExam);
}

/** Bundles whose PYQs may be shown (never mentor batch series), optionally for ONE exam. */
async function eligibleBundleIds(db: Db, exam: ExamKey | null = null): Promise<string[]> {
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
const keyExpr = (field: "chapter" | "topic", fallback: string) => ({
  $toLower: {
    $let: {
      vars: { c: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ""] } } } } },
      in: { $cond: [{ $eq: ["$$c", ""] }, fallback, "$$c"] },
    },
  },
});
const displayExpr = (field: "chapter" | "topic", fallback: string) => ({
  $let: {
    vars: { c: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ""] } } } } },
    in: { $cond: [{ $eq: ["$$c", ""] }, fallback, "$$c"] },
  },
});

async function pyqMatch(db: Db, exam: ExamKey | null = null) {
  return { isPYQ: true, bundleId: { $in: await eligibleBundleIds(db, exam) } };
}

// ─── Browse tree with this student's progress ──────────────────────────────
export const getPyqTree = createServerFn({ method: "GET" })
  .validator((data: { token: string; exam?: string }) => data)
  .handler(async ({ data }): Promise<PyqTree> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    await ensureProgressIndexes(db);
    const exam = await resolveExam(db, decoded.uid, data.exam);
    const treeKey = exam ?? "all";

    let rows = treeCache.get(treeKey);
    if (!rows) {
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
      rows = agg.map((a) => ({
        subject: a._id.subject as string,
        chapterKey: a._id.chapterKey as string,
        topicKey: a._id.topicKey as string,
        chapter: a.chapter as string,
        topic: a.topic as string,
        count: a.count as number,
      }));
      treeCache.set(treeKey, rows);
    }

    // Per-student progress (never cached).
    const prog = await db
      .collection("practiceProgress")
      .aggregate([
        { $match: { uid: decoded.uid, ...(exam ? { $or: [{ exam }, { exam: { $exists: false } }] } : {}) } },
        {
          $group: {
            _id: { subject: "$subject", chapterKey: "$chapterKey", topicKey: "$topicKey" },
            attempted: { $sum: { $cond: [{ $gt: ["$attempts", 0] }, 1, 0] } },
            correct: { $sum: { $cond: ["$correct", 1, 0] } },
          },
        },
      ])
      .toArray();
    const progMap = new Map(
      prog.map((p) => [`${p._id.subject}|${p._id.chapterKey}|${p._id.topicKey}`, { attempted: p.attempted as number, correct: p.correct as number }]),
    );

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
      if (a === UNTAGGED_CHAPTER) return 1;
      if (b === UNTAGGED_CHAPTER) return -1;
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
  });

// ─── Resolve "JEE Mains 2022 29 June Shift 2" for a set of questions ───────
async function loadSources(db: Db, docs: Record<string, unknown>[]) {
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

const statusOf = (p?: Record<string, unknown> | null): PyqStatus => {
  if (!p) return "new";
  if (p.correct === true) return "correct";
  if (Number(p.attempts ?? 0) > 0) return "wrong";
  return p.revealed === true ? "revealed" : "new";
};

// What the student is allowed to see about a question — never the answer or solution.
const QUESTION_PROJECTION = {
  // Deliberately NOT projected: correctOption, correctAnswer, solution.
  subject: 1, chapter: 1, topic: 1, type: 1, body: 1, options: 1, difficulty: 1, pyqYear: 1, bundleId: 1, testId: 1,
} as const;

/** Question docs → what the client gets (source label + this student's status). Shared by every list endpoint. */
async function buildQuestions(db: Db, uid: string, docs: Record<string, unknown>[]): Promise<PyqQuestion[]> {
    const sources = await loadSources(db, docs);
    const progress = await db
      .collection("practiceProgress")
      .find({ uid, questionId: { $in: docs.map((d) => String(d._id)) } })
      .toArray();
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
      };
    });
}

// ─── Questions for a chapter / topic (no answers, no solutions) ────────────
export const listPyqQuestions = createServerFn({ method: "GET" })
  .validator(
    (data: {
      token: string;
      subject: string;
      chapter: string;
      topic?: string;
      difficulty?: Difficulty;
      year?: string;
      status?: PyqStatus | "unsolved";
      exam?: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<PyqList> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const exam = await resolveExam(db, decoded.uid, data.exam);

    const and: Record<string, unknown>[] = [
      { $expr: { $eq: [keyExpr("chapter", UNTAGGED_CHAPTER), data.chapter.trim().toLowerCase()] } },
    ];
    if (data.topic) and.push({ $expr: { $eq: [keyExpr("topic", GENERAL_TOPIC), data.topic.trim().toLowerCase()] } });
    const match: Record<string, unknown> = { ...(await pyqMatch(db, exam)), subject: data.subject, $and: and };
    if (data.difficulty) match.difficulty = data.difficulty;

    const docs = await db
      .collection("questions")
      .find(match, { projection: QUESTION_PROJECTION })
      .sort({ _id: 1 })
      .limit(1000)
      .toArray();

    let questions = await buildQuestions(db, decoded.uid, docs);

    const years = [...new Set(questions.map((q) => q.source.year).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a));

    if (data.year) questions = questions.filter((q) => q.source.year === data.year);
    if (data.status === "unsolved") questions = questions.filter((q) => q.status !== "correct");
    else if (data.status) questions = questions.filter((q) => q.status === data.status);

    // Newest paper first; stable within a paper.
    questions = questions
      .map((q, i) => ({ q, i }))
      .sort((a, b) => (b.q.source.year ?? "").localeCompare(a.q.source.year ?? "") || a.i - b.i)
      .map((x) => x.q);

    return { questions: questions.slice(0, MAX_LIST), years, total: questions.length };
  });

// ─── Check an answer (or reveal the solution) and save progress ────────────
export const submitPyqAnswer = createServerFn({ method: "POST" })
  .validator((data: { token: string; questionId: string; answer: PyqAnswer }) => data)
  .handler(async ({ data }): Promise<PyqCheckResult> => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await ensureProgressIndexes(db);

    if (!/^[a-f0-9]{24}$/i.test(data.questionId)) throw new Error("Question not found.");
    const q = await db.collection("questions").findOne({ _id: new ObjectId(data.questionId) });
    // Same gate as the list: PYQ in one of OUR batches. Without it this endpoint
    // would hand out answers/solutions for paid, non-PYQ questions.
    if (!q || q.isPYQ !== true || !(await eligibleBundleIds(db)).includes(String(q.bundleId))) {
      throw new Error("Question not found.");
    }

    const chapter = String(q.chapter ?? "").trim() || UNTAGGED_CHAPTER;
    const topic = String(q.topic ?? "").trim() || GENERAL_TOPIC;
    const where = { uid: decoded.uid, questionId: data.questionId };
    const qBundle = await db.collection("bundles").findOne({ _id: new ObjectId(String(q.bundleId)) }, { projection: { exam: 1 } });
    const keys = { exam: toExamKey(qBundle?.exam) ?? "neet", subject: q.subject as string, chapterKey: chapter.toLowerCase(), topicKey: topic.toLowerCase() };
    const now = new Date();
    const col = db.collection("practiceProgress");

    const reveal: Pick<PyqCheckResult, "correctOption" | "correctAnswer" | "solution"> = {
      ...(q.type === "mcq" ? { correctOption: q.correctOption as OptionKey } : { correctAnswer: q.correctAnswer as number }),
      solution: (q.solution as string) ?? "",
    };

    // "Show solution" without answering.
    if (data.answer === null) {
      await col.updateOne(
        where,
        { $set: { ...keys, revealed: true, updatedAt: now }, $setOnInsert: { attempts: 0, correct: false, createdAt: now } },
        { upsert: true },
      );
      const after = await col.findOne(where);
      return { isCorrect: false, revealed: true, ...reveal, status: statusOf(after) };
    }

    let isCorrect = false;
    let lastAnswer: string | number;
    if (q.type === "mcq") {
      const opt = data.answer.option;
      if (!opt || !OPTION_KEYS.includes(opt)) throw new Error("Pick an option first.");
      isCorrect = opt === q.correctOption;
      lastAnswer = opt;
    } else {
      const v = data.answer.value;
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Enter a number first.");
      isCorrect = Math.abs(v - (q.correctAnswer as number)) < 1e-6; // same tolerance as the test engine
      lastAnswer = v;
    }

    await col.updateOne(
      where,
      {
        $set: { ...keys, correct: isCorrect, lastAnswer, updatedAt: now },
        $inc: { attempts: 1 },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    const after = await col.findOne(where);
    return { isCorrect, revealed: false, ...reveal, status: statusOf(after) };
  });

// ─── "Practice my weak topics" ─────────────────────────────────────────────
// Turns the chapters that cost a student marks in one attempt into a PYQ
// practice session. Weak chapters are derived server-side from the attempt
// itself (the client only sends the attempt id), so the result page and the
// session always agree, and a student can't ask for someone else's.

async function loadOwnedAttempt(db: Db, uid: string, attemptId: string) {
  const { ObjectId } = await import("mongodb");
  if (!/^[a-f0-9]{24}$/i.test(attemptId)) throw new Error("Attempt not found");
  const attempt = await db.collection("testAttempts").findOne({ _id: new ObjectId(attemptId) });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.uid !== uid) throw new Error("You don't have access to this attempt.");
  return attempt;
}

/** The exam this attempt belongs to: its batch's exam, else the student's saved target exam, else null. */
async function examForAttempt(db: Db, uid: string, attempt: Record<string, unknown>): Promise<ExamKey | null> {
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

const chapterOr = (chapters: { subject: string; chapter: string }[]) =>
  chapters.map((c) => ({
    subject: c.subject,
    $expr: { $eq: [keyExpr("chapter", UNTAGGED_CHAPTER), c.chapter.trim().toLowerCase()] },
  }));

// How many PYQs can the student practise for each weak chapter? (Drives the buttons on the result page.)
export const getWeakPyqSummary = createServerFn({ method: "GET" })
  .validator((data: { token: string; attemptId: string }) => data)
  .handler(async ({ data }): Promise<WeakPyqSummary> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const attempt = await loadOwnedAttempt(db, decoded.uid, data.attemptId);
    const { focus } = await loadAttemptTopicAnalysis(db, attempt);
    const exam = await examForAttempt(db, decoded.uid, attempt);
    if (focus.length === 0) return { exam, chapters: [], totalAvailable: 0 };

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
        { $match: { uid: decoded.uid, $or: focus.map((f) => ({ subject: f.subject, chapterKey: f.chapter.trim().toLowerCase() })) } },
        { $group: { _id: { subject: "$subject", chapterKey: "$chapterKey" }, n: { $sum: { $cond: ["$correct", 1, 0] } } } },
      ])
      .toArray();
    const availMap = new Map(available.map((a) => [`${a._id.subject}|${a._id.chapterKey}`, a.n as number]));
    const solvedMap = new Map(solved.map((a) => [`${a._id.subject}|${a._id.chapterKey}`, a.n as number]));

    const chapters = focus.map((f) => {
      const k = weakKey(f.subject, f.chapter);
      const n = availMap.get(k) ?? 0;
      return { subject: f.subject, chapter: f.chapter, available: n, solved: Math.min(solvedMap.get(k) ?? 0, n) };
    });
    return { exam, chapters, totalAvailable: chapters.reduce((n, c) => n + c.available, 0) };
  });

// The mixed practice session itself: PYQs from the weak chapters, interleaved,
// unseen questions first. Same no-answers-in-the-list rule as everywhere else.
export const listWeakPyqQuestions = createServerFn({ method: "GET" })
  .validator(
    (data: { token: string; attemptId: string; difficulty?: Difficulty; year?: string; status?: PyqStatus | "unsolved" }) => data,
  )
  .handler(async ({ data }): Promise<PyqList> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const attempt = await loadOwnedAttempt(db, decoded.uid, data.attemptId);
    const { focus } = await loadAttemptTopicAnalysis(db, attempt);
    const exam = await examForAttempt(db, decoded.uid, attempt);
    if (focus.length === 0) return { questions: [], years: [], total: 0, weak: { chapters: [] } };

    const match: Record<string, unknown> = { ...(await pyqMatch(db, exam)), $or: chapterOr(focus) };
    if (data.difficulty) match.difficulty = data.difficulty;

    const docs = await db.collection("questions").find(match, { projection: QUESTION_PROJECTION }).sort({ _id: 1 }).limit(1000).toArray();
    let questions = await buildQuestions(db, decoded.uid, docs);

    const years = [...new Set(questions.map((q) => q.source.year).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a));
    if (data.year) questions = questions.filter((q) => q.source.year === data.year);
    if (data.status === "unsolved") questions = questions.filter((q) => q.status !== "correct");
    else if (data.status) questions = questions.filter((q) => q.status === data.status);

    // Newest paper first before picking, so "first 12 per chapter" means the most recent ones.
    questions = questions
      .map((q, i) => ({ q, i }))
      .sort((a, b) => (b.q.source.year ?? "").localeCompare(a.q.source.year ?? "") || a.i - b.i)
      .map((x) => x.q);

    const picked = pickWeakQuestions(focus, questions);
    return {
      questions: picked,
      years,
      total: questions.length,
      weak: {
        chapters: focus.map((f) => ({
          subject: f.subject,
          chapter: f.chapter,
          count: picked.filter((q) => weakKey(q.subject, q.chapter) === weakKey(f.subject, f.chapter)).length,
        })),
      },
    };
  });
