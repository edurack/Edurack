// Admin-only: the "NCERT Line by Line" question bank — a NEW branch inside
// NEET Question Analytics. An admin picks one chapter + the topics it
// covers, uploads a JSON file of questions for just that chapter, and the
// screen auto-counts how many questions each topic now has. Separate from
// the bundle/test question pipeline in admin.ts: these questions carry no
// bundleId/testId, are tagged `source: "ncertLineByLine"`, and are NOT PYQs
// (isPYQ: false) — they're their own practice section (see
// server-functions/ncert-line-practice.ts) that the admin can keep hidden
// ("coming soon"), open to a handful of test emails ("beta"), or publish to
// everyone ("live").
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { logAdminAction } from "@/lib/team-core";
import { syllabusKey } from "@/lib/ncert-syllabus";
import {
  clearNcertVisibilityCache,
  ensureNcertIndexes,
  findNeetChapter,
  getNcertVisibility,
  loadNeetSyllabus,
  ncertTopicCounts,
} from "@/lib/ncert-line-server";
import { NCERT_SOURCE, NCERT_SUBJECTS, type NcertClassLevel, type NcertVisibility } from "@/lib/ncert-line-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

// ─── Syllabus for the chapter/topic picker ─────────────────────────────────
export const getNcertSyllabus = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    return { syllabus: await loadNeetSyllabus(db) };
  });

// ─── Live counts for the chapter the admin currently has open ─────────────
export const getNcertTopicCounts = createServerFn({ method: "POST" })
  .validator((data: { token: string; subject?: string; chapter?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const counts = await ncertTopicCounts(db, data.subject, data.chapter);
    return { counts, total: counts.reduce((n, c) => n + c.count, 0) };
  });

// ─── Bulk JSON upload, scoped to ONE chapter ───────────────────────────────
const MAX_QUESTIONS = 1000;
const OPTION_KEYS = ["A", "B", "C", "D"] as const;

type Row = {
  topic: string;
  body: string;
  type: "mcq" | "integer";
  options?: { A: string; B: string; C: string; D: string };
  correctOption?: "A" | "B" | "C" | "D";
  correctAnswer?: number;
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

function normalizeRow(raw: unknown, topics: string[]): { row?: Row; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["Not a JSON object."] };
  const r = raw as Record<string, unknown>;

  const topicRaw = typeof r.topic === "string" ? r.topic.trim() : "";
  if (!topicRaw) errors.push("`topic` is missing.");
  const topic = topics.find((t) => syllabusKey(t) === syllabusKey(topicRaw));
  if (topicRaw && !topic) {
    errors.push(`"${topicRaw}" isn't one of the selected topics (${topics.join(", ")}).`);
  }

  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!body) errors.push("`body` (the question text) is missing.");

  let type: "mcq" | "integer" | null = null;
  if (typeof r.type === "string") {
    const t = r.type.trim().toLowerCase();
    if (t === "mcq" || t === "integer") type = t;
    else errors.push(`\`type\` must be "mcq" or "integer" (got "${r.type}").`);
  } else {
    type = r.options !== undefined ? "mcq" : r.correctAnswer !== undefined ? "integer" : "mcq";
  }

  let options: Row["options"];
  let correctOption: Row["correctOption"];
  let correctAnswer: number | undefined;
  if (type === "mcq") {
    const o = r.options;
    const pick = (k: (typeof OPTION_KEYS)[number], i: number): unknown =>
      Array.isArray(o) ? o[i] : o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
    const vals = OPTION_KEYS.map((k, i) => {
      const v = pick(k, i);
      return typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    });
    if (vals.some((v) => !v)) errors.push("MCQ needs all four options A–D, none empty.");
    else options = { A: vals[0], B: vals[1], C: vals[2], D: vals[3] };
    const co = typeof r.correctOption === "string" ? r.correctOption.trim().toUpperCase() : "";
    if (co === "A" || co === "B" || co === "C" || co === "D") correctOption = co;
    else errors.push("`correctOption` must be A, B, C or D.");
  } else if (type === "integer") {
    const n = typeof r.correctAnswer === "string" ? Number(r.correctAnswer) : r.correctAnswer;
    if (typeof n === "number" && Number.isFinite(n)) correctAnswer = n;
    else errors.push("Integer questions need a numeric `correctAnswer`.");
  }

  const solution = typeof r.solution === "string" ? r.solution.trim() : "";
  if (!solution) errors.push("`solution` is missing.");

  let difficulty: Row["difficulty"] = "Medium";
  if (r.difficulty !== undefined) {
    const d = typeof r.difficulty === "string" ? r.difficulty.trim().toLowerCase() : "";
    if (d === "easy") difficulty = "Easy";
    else if (d === "medium") difficulty = "Medium";
    else if (d === "hard") difficulty = "Hard";
    else errors.push("`difficulty` must be Easy, Medium or Hard.");
  }

  if (errors.length > 0 || !type || !topic) return { errors };
  return { errors, row: { topic, body, type, options, correctOption, correctAnswer, solution, difficulty } };
}

export const bulkUploadNcertQuestions = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      subject: string;
      classLevel: NcertClassLevel;
      chapter: string;
      /** The topics this upload may tag questions with — everything else chosen on the picker for this chapter. */
      topics: string[];
      questions: unknown[];
      /** Validate and report only — write nothing. */
      dryRun?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, "bulkUploadNcertQuestions", data, "Questions");

    if (!NCERT_SUBJECTS.includes(data.subject as (typeof NCERT_SUBJECTS)[number])) throw new Error("Pick a subject.");
    if (data.classLevel !== "11" && data.classLevel !== "12") throw new Error("Pick a class (11 or 12).");
    if (!data.chapter?.trim()) throw new Error("Pick a chapter.");
    if (!Array.isArray(data.topics) || data.topics.length === 0) throw new Error("Select at least one topic for this chapter.");
    if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error("The file doesn't contain any questions.");
    if (data.questions.length > MAX_QUESTIONS) throw new Error(`Too many questions in one upload (${data.questions.length}). Split the file into batches of ${MAX_QUESTIONS} or fewer.`);

    const db = await getDb();
    const syllabus = await loadNeetSyllabus(db);
    const chapterHit = findNeetChapter(syllabus, data.subject, data.classLevel, data.chapter);
    if (!chapterHit) throw new Error(`"${data.chapter}" isn't a ${data.subject} chapter for Class ${data.classLevel} in the NEET syllabus.`);
    // Only topics that really belong to this chapter (canonical spelling) can be used.
    const topics = data.topics
      .map((t) => chapterHit.topics.find((ct) => syllabusKey(ct) === syllabusKey(t)))
      .filter((t): t is string => Boolean(t));
    if (topics.length === 0) throw new Error("None of the selected topics belong to this chapter.");

    const rowErrors: { row: number; messages: string[] }[] = [];
    const rows: Row[] = [];
    data.questions.forEach((raw, i) => {
      const res = normalizeRow(raw, topics);
      if (res.errors.length) rowErrors.push({ row: i + 1, messages: res.errors });
      if (res.row) rows.push(res.row);
    });

    const perTopic = new Map<string, number>();
    for (const r of rows) perTopic.set(r.topic, (perTopic.get(r.topic) ?? 0) + 1);

    // Numbering per topic continues after what's already there.
    const existing = await db
      .collection("questions")
      .find({ source: NCERT_SOURCE, subject: data.subject, chapterKey: chapterHit.chapter.toLowerCase() }, { projection: { topic: 1, topicQuestionNo: 1 } })
      .toArray();
    const startByTopic = new Map<string, number>();
    const byTopic = [...perTopic.keys()].map((topic) => {
      const mine = existing.filter((e) => e.topic === topic);
      const startNo = Math.max(mine.length, ...mine.map((e) => Number(e.topicQuestionNo) || 0), 0) + 1;
      const count = perTopic.get(topic) ?? 0;
      startByTopic.set(topic, startNo);
      return { topic, count, startNo, endNo: startNo + count - 1 };
    });

    const summary = { total: data.questions.length, mcq: rows.filter((r) => r.type === "mcq").length, integer: rows.filter((r) => r.type === "integer").length, byTopic };

    if (rowErrors.length > 0 || rows.length !== data.questions.length) {
      return { ok: false as const, inserted: 0, ...summary, errors: rowErrors };
    }

    if (data.dryRun) return { ok: true as const, dryRun: true, inserted: 0, ...summary, errors: [] };

    const now = new Date();
    const nextNo = new Map(startByTopic);
    const docs = rows.map((r) => {
      const topicQuestionNo = nextNo.get(r.topic)!;
      nextNo.set(r.topic, topicQuestionNo + 1);
      return {
        source: NCERT_SOURCE,
        isPYQ: false,
        subject: data.subject,
        classLevel: data.classLevel,
        chapter: chapterHit.chapter,
        chapterKey: chapterHit.chapter.toLowerCase(),
        topic: r.topic,
        topicKey: r.topic.toLowerCase(),
        topicQuestionNo,
        body: r.body,
        type: r.type,
        ...(r.type === "mcq" ? { options: r.options, correctOption: r.correctOption } : { correctAnswer: r.correctAnswer }),
        solution: r.solution,
        difficulty: r.difficulty,
        createdAt: now,
      };
    });

    await db.collection("questions").insertMany(docs, { ordered: true });
    return { ok: true as const, dryRun: false, inserted: docs.length, ...summary, errors: [] };
  });

// ─── Visibility: coming soon / beta testers / live ─────────────────────────
export const getNcertVisibilityAdmin = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    return getNcertVisibility(db);
  });

export const setNcertVisibility = createServerFn({ method: "POST" })
  .validator((data: { token: string; mode: "beta" | "live"; betaEmails: string[] }) => data)
  .handler(async ({ data }): Promise<NcertVisibility> => {
    await requireAdmin(data.token);
    await logAdminAction(data.token, "setNcertVisibility", data, "Questions");
    if (data.mode !== "beta" && data.mode !== "live") throw new Error("Invalid mode.");
    const betaEmails = [...new Set((data.betaEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const db = await getDb();
    const now = new Date();
    await db.collection<{ _id: string; mode: string; betaEmails: string[]; updatedAt: Date }>("featureFlags").updateOne(
      { _id: "ncertLineByLine" },
      { $set: { mode: data.mode, betaEmails, updatedAt: now } },
      { upsert: true },
    );
    clearNcertVisibilityCache();
    return { mode: data.mode, betaEmails, updatedAt: now.toISOString() };
  });

export const ensureNcertIndexesOnce = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await ensureNcertIndexes(db);
    return { ok: true };
  });
