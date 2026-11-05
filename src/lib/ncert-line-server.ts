// SERVER-ONLY. Shared helpers for the NCERT Line-by-Line question bank —
// admin ingestion, student practice, and Quick Mock's optional pool
// inclusion all read from here instead of duplicating queries. Same
// convention as pyq-server.ts: everything takes `db` as a parameter, nothing
// here talks to auth, and this file is never imported by another
// server-functions file directly (server function files only import shared
// logic from lib/).
import type { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { SYLLABUS_SEEDS, chaptersFor, syllabusKey, toSyllabusSubject, type Syllabus } from "@/lib/ncert-syllabus";
import type { OptionKey } from "@/lib/pyq-types";
import { NCERT_SOURCE, type NcertChapterNode, type NcertClassLevel, type NcertCheckResult, type NcertQuestion, type NcertStatus, type NcertSubjectNode, type NcertTopicNode, type NcertTree, type NcertVisibility } from "@/lib/ncert-line-types";

export type Db = Awaited<ReturnType<typeof getDb>>;

// ─── NEET syllabus (same stored doc the admin question-ingestion screen
// seeds/reads — see server-functions/admin.ts's loadSyllabus). Kept as its
// own tiny loader here, per the "shared code lives in lib/, server-function
// files don't import each other" rule, instead of reaching into admin.ts. ──
const syllabusCache = createTtlCache<Syllabus>(60_000);

export async function loadNeetSyllabus(db: Db): Promise<Syllabus> {
  const hit = syllabusCache.get("neet");
  if (hit) return hit;
  const seed = SYLLABUS_SEEDS.neet;
  const col = db.collection<{ _id: string; version: number; syllabus: Syllabus }>("syllabus");
  let doc = await col.findOne({ _id: seed.key });
  if (!doc || (doc.version ?? 0) < seed.version) {
    doc = { _id: seed.key, version: seed.version, syllabus: seed.syllabus };
    await col.replaceOne({ _id: seed.key }, doc, { upsert: true });
  }
  syllabusCache.set("neet", doc.syllabus);
  return doc.syllabus;
}

/** The chapter (canonical spelling) + its canonical topic list, or null if the syllabus doesn't have it. */
export function findNeetChapter(syllabus: Syllabus, subject: string, classLevel: NcertClassLevel, chapter: string) {
  const subj = toSyllabusSubject(subject);
  if (!subj) return null;
  const want = syllabusKey(chapter);
  return chaptersFor(syllabus, subj, classLevel).find((c) => syllabusKey(c.chapter) === want) ?? null;
}

// ─── Indexes ────────────────────────────────────────────────────────────────
let indexesEnsured = false;
export async function ensureNcertIndexes(db: Db) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const q = db.collection("questions");
    await q.createIndex({ source: 1, subject: 1, chapterKey: 1, topicKey: 1 }, { background: true });
    const p = db.collection("ncertProgress");
    await p.createIndex({ uid: 1, questionId: 1 }, { unique: true, background: true });
    await p.createIndex({ uid: 1, subject: 1, chapterKey: 1, topicKey: 1 }, { background: true });
  } catch {
    // Index creation is best-effort; reads/writes work without it.
  }
}

/** Mongo filter for every question in this bank. */
export const ncertMatch = { source: NCERT_SOURCE } as const;

export const statusOf = (p?: Record<string, unknown> | null): NcertStatus => {
  if (!p) return "new";
  if (p.correct === true) return "correct";
  if (Number(p.attempts ?? 0) > 0) return "wrong";
  return p.revealed === true ? "revealed" : "new";
};

// ─── Browse tree ────────────────────────────────────────────────────────────
export type NcertTreeRow = { subject: string; classLevel: NcertClassLevel; chapter: string; topic: string; chapterKey: string; topicKey: string; count: number };

const treeRowsCache = createTtlCache<NcertTreeRow[]>(60_000);

export async function loadNcertTreeRows(db: Db): Promise<NcertTreeRow[]> {
  const hit = treeRowsCache.get("all");
  if (hit) return hit;
  const agg = await db
    .collection("questions")
    .aggregate([
      { $match: ncertMatch },
      {
        $group: {
          _id: { subject: "$subject", classLevel: "$classLevel", chapterKey: "$chapterKey", topicKey: "$topicKey" },
          chapter: { $first: "$chapter" },
          topic: { $first: "$topic" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const rows = agg.map((a) => ({
    subject: a._id.subject as string,
    classLevel: (a._id.classLevel as NcertClassLevel) ?? "11",
    chapterKey: a._id.chapterKey as string,
    topicKey: a._id.topicKey as string,
    chapter: a.chapter as string,
    topic: a.topic as string,
    count: a.count as number,
  }));
  treeRowsCache.set("all", rows);
  return rows;
}

export function assembleNcertTree(rows: NcertTreeRow[], progMap: Map<string, { attempted: number; correct: number }>): NcertTree {
  const subjects = new Map<string, NcertSubjectNode>();
  for (const r of rows) {
    const p = progMap.get(`${r.subject}|${r.chapterKey}|${r.topicKey}`) ?? { attempted: 0, correct: 0 };
    const attempted = Math.min(p.attempted, r.count);
    const correct = Math.min(p.correct, r.count);

    const s = subjects.get(r.subject) ?? { subject: r.subject, count: 0, attempted: 0, correct: 0, chapters: [] };
    subjects.set(r.subject, s);
    let c = s.chapters.find((x) => x.chapter.toLowerCase() === r.chapter.toLowerCase());
    if (!c) {
      c = { chapter: r.chapter, classLevel: r.classLevel, count: 0, attempted: 0, correct: 0, topics: [] };
      s.chapters.push(c);
    }
    const t: NcertTopicNode = { topic: r.topic, count: r.count, attempted, correct };
    c.topics.push(t);
    for (const n of [c, s] as (NcertChapterNode | NcertSubjectNode)[]) {
      n.count += r.count;
      n.attempted += attempted;
      n.correct += correct;
    }
  }
  const out = Array.from(subjects.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  for (const s of out) {
    s.chapters.sort((a, b) => (a.classLevel === b.classLevel ? a.chapter.localeCompare(b.chapter) : a.classLevel.localeCompare(b.classLevel)));
    for (const c of s.chapters) c.topics.sort((a, b) => a.topic.localeCompare(b.topic));
  }
  return {
    subjects: out,
    totalQuestions: out.reduce((n, s) => n + s.count, 0),
    totalCorrect: out.reduce((n, s) => n + s.correct, 0),
  };
}

/** Current question count per topic (used by the admin upload screen's live counts). */
export async function ncertTopicCounts(db: Db, subject?: string, chapter?: string) {
  const rows = await loadNcertTreeRows(db);
  return rows
    .filter((r) => (!subject || r.subject === subject) && (!chapter || r.chapter.toLowerCase() === chapter.toLowerCase()))
    .map((r) => ({ subject: r.subject, classLevel: r.classLevel, chapter: r.chapter, topic: r.topic, count: r.count }));
}

// ─── Visibility (coming soon / beta testers / live) ────────────────────────
const FLAG_ID = "ncertLineByLine";
const visibilityCache = createTtlCache<NcertVisibility>(30_000);

type FlagDoc = { _id: string; mode?: string; betaEmails?: string[]; updatedAt?: Date };

export async function getNcertVisibility(db: Db): Promise<NcertVisibility> {
  const hit = visibilityCache.get(FLAG_ID);
  if (hit) return hit;
  const doc = await db.collection<FlagDoc>("featureFlags").findOne({ _id: FLAG_ID });
  const v: NcertVisibility = {
    mode: doc?.mode === "live" ? "live" : "beta",
    betaEmails: Array.isArray(doc?.betaEmails) ? (doc!.betaEmails as string[]) : [],
    updatedAt: doc?.updatedAt instanceof Date ? doc.updatedAt.toISOString() : null,
  };
  visibilityCache.set(FLAG_ID, v);
  return v;
}

export function clearNcertVisibilityCache() {
  visibilityCache.set(FLAG_ID, undefined as unknown as NcertVisibility);
}

/** Is this section open to `email` right now? (Always false for a missing/unverified email.) */
export function isNcertEnabledFor(visibility: NcertVisibility, email: string | null | undefined): boolean {
  if (visibility.mode === "live") return true;
  const e = email?.trim().toLowerCase();
  return Boolean(e) && visibility.betaEmails.includes(e!);
}

// ─── Question docs → what the student is sent (never the answer/solution) ──
export const NCERT_QUESTION_PROJECTION: Record<string, 1> = {
  subject: 1, classLevel: 1, chapter: 1, topic: 1, type: 1, body: 1, options: 1, difficulty: 1,
};

export async function buildNcertQuestions(db: Db, uid: string, docs: Record<string, unknown>[]): Promise<NcertQuestion[]> {
  const progress = uid
    ? await db.collection("ncertProgress").find({ uid, questionId: { $in: docs.map((d) => String(d._id)) } }).toArray()
    : [];
  const progMap = new Map(progress.map((p) => [p.questionId as string, p]));
  return docs.map((d) => ({
    id: String(d._id),
    subject: d.subject as string,
    classLevel: (d.classLevel as NcertClassLevel) ?? "11",
    chapter: d.chapter as string,
    topic: d.topic as string,
    type: (d.type as "mcq" | "integer") ?? "mcq",
    body: d.body as string,
    ...(d.type === "mcq" || !d.type ? { options: d.options as Record<OptionKey, string> } : {}),
    difficulty: d.difficulty as NcertQuestion["difficulty"],
    status: statusOf(progMap.get(String(d._id))),
  }));
}

export type { NcertCheckResult };
