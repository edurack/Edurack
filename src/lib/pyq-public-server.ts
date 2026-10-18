// SERVER-ONLY helpers for the public question pages (/question/$id).
// Lives in lib/ because this repo's rule is that server-function files never
// import from each other — shared server code goes here (same as pyq-server.ts).
//
// The one rule: the page and the sitemap may only ever see a question that is
//   • flagged isPYQ, AND
//   • in one of OUR bundles (never a mentor's paid batch series),
// which is exactly the gate the signed-in and guest PYQ endpoints already use.
import {
  QUESTION_PROJECTION,
  buildQuestions,
  eligibleBundleIds,
  practiceKeysFor,
  pyqMatch,
  scopeMatch,
  type Db,
} from "@/lib/pyq-server";
import { GENERAL_TOPIC, UNTAGGED_CHAPTER } from "@/lib/pyq-types";
import { isIndexable, plainText, questionParam, snippetOf, type PyqAdjacent, type PyqContext, type PyqPublicPage, type PyqRelated } from "@/lib/pyq-public";
import type { ExamKey } from "@/lib/admin-types";
import type { PyqQuestion } from "@/lib/pyq-types";
import { PAPER_LABELS, RANGE_LABEL, chapterInsights, findChapterByNames, getSubject, matchTopic } from "@/lib/neet-blueprint";

const RELATED_COUNT = 6;

// What the PAGE may read. Same as the practice list: never the answer or solution.
const PAGE_PROJECTION = { ...QUESTION_PROJECTION, isPYQ: 1 } as const;

/**
 * Find one public PYQ by id. `includeAnswer: true` returns the full document
 * (answer + solution) and is for the answer-check endpoint only; the page
 * loader must pass false.
 */
export async function loadPublicQuestionDoc(db: Db, id: string, includeAnswer: boolean) {
  const { ObjectId } = await import("mongodb");
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) return null;
  const q = await db
    .collection("questions")
    .findOne({ _id: new ObjectId(id) }, includeAnswer ? undefined : { projection: PAGE_PROJECTION as unknown as Record<string, 0 | 1> });
  if (!q || q.isPYQ !== true) return null;
  if (!(await eligibleBundleIds(db)).includes(String(q.bundleId))) return null;
  return q;
}

type Doc = Record<string, unknown> & { _id: unknown };

/**
 * "Next N questions in the same topic, then chapter" by _id, wrapping around.
 * Deliberately NOT "newest N": that would give the same six questions every
 * inbound link, and the rest of the chapter would only be reachable via the
 * sitemap. A rolling neighbourhood means every question is linked from some
 * other question, which is what lets Google discover and keep crawling them.
 */
async function neighbours(db: Db, match: Record<string, unknown>, doc: Doc, limit: number, skip: Set<string>) {
  const col = db.collection("questions");
  const projection = QUESTION_PROJECTION as unknown as Record<string, 0 | 1>;
  const after = await col
    .find({ ...match, _id: { $gt: doc._id } } as never, { projection })
    .sort({ _id: 1 })
    .limit(limit + skip.size)
    .toArray();
  let out = after.filter((d) => !skip.has(String(d._id)));
  if (out.length < limit) {
    const before = await col
      .find({ ...match, _id: { $lt: doc._id } } as never, { projection })
      .sort({ _id: 1 })
      .limit(limit - out.length + skip.size)
      .toArray();
    out = [...out, ...before.filter((d) => !skip.has(String(d._id)))];
  }
  return out.slice(0, limit);
}

async function loadRelated(db: Db, doc: Doc, exam: Awaited<ReturnType<typeof practiceKeysFor>>["exam"]): Promise<PyqRelated[]> {
  const subject = doc.subject as string;
  const chapter = String(doc.chapter ?? "").trim() || UNTAGGED_CHAPTER;
  const topic = String(doc.topic ?? "").trim() || GENERAL_TOPIC;
  const skip = new Set<string>([String(doc._id)]);

  let picked: Record<string, unknown>[] = [];
  if (chapter === UNTAGGED_CHAPTER) {
    // Nothing meaningful to group by: fall back to the subject.
    picked = await neighbours(db, { ...(await pyqMatch(db, exam)), subject }, doc, RELATED_COUNT, skip);
  } else {
    if (topic !== GENERAL_TOPIC) {
      picked = await neighbours(db, await scopeMatch(db, exam, subject, chapter, topic), doc, RELATED_COUNT, skip);
    }
    if (picked.length < RELATED_COUNT) {
      for (const p of picked) skip.add(String(p._id));
      const more = await neighbours(db, await scopeMatch(db, exam, subject, chapter), doc, RELATED_COUNT - picked.length, skip);
      picked = [...picked, ...more];
    }
  }

  const built = await buildQuestions(db, "", picked);
  return built.map((q) => ({
    param: questionParam(q),
    snippet: snippetOf(q.body),
    label: q.source.label,
    difficulty: q.difficulty,
    chapter: q.chapter,
    topic: q.topic,
  }));
}

const ADJACENT_SCAN = 6;

const toRelated = (q: PyqQuestion): PyqRelated => ({
  param: questionParam(q),
  snippet: snippetOf(q.body),
  label: q.source.label,
  difficulty: q.difficulty,
  chapter: q.chapter,
  topic: q.topic,
});

/**
 * The previous and next question of the same chapter by _id (no wrap-around),
 * skipping image-only ones that stay out of search. A fixed chain through the
 * chapter gives every page a stable crawl path in both directions.
 */
async function loadAdjacent(db: Db, doc: Doc, exam: ExamKey | null): Promise<PyqAdjacent> {
  const subject = doc.subject as string;
  const chapter = String(doc.chapter ?? "").trim() || UNTAGGED_CHAPTER;
  const match =
    chapter === UNTAGGED_CHAPTER ? { ...(await pyqMatch(db, exam)), subject } : await scopeMatch(db, exam, subject, chapter);
  const col = db.collection("questions");
  const projection = QUESTION_PROJECTION as unknown as Record<string, 0 | 1>;
  const [after, before] = await Promise.all([
    col.find({ ...match, _id: { $gt: doc._id } } as never, { projection }).sort({ _id: 1 }).limit(ADJACENT_SCAN).toArray(),
    col.find({ ...match, _id: { $lt: doc._id } } as never, { projection }).sort({ _id: -1 }).limit(ADJACENT_SCAN).toArray(),
  ]);
  const pick = (rows: Record<string, unknown>[]) => rows.find((d) => isIndexable(plainText(String(d.body ?? ""))));
  const next = pick(after);
  const prev = pick(before);
  const picked = [next, prev].filter((d): d is Record<string, unknown> => Boolean(d));
  if (picked.length === 0) return { prev: null, next: null };
  const built = await buildQuestions(db, "", picked);
  const byId = new Map(built.map((b) => [b.id, b]));
  const related = (d: Record<string, unknown> | undefined) => {
    const b = d ? byId.get(String(d._id)) : undefined;
    return b ? toRelated(b) : null;
  };
  return { prev: related(prev), next: related(next) };
}

/** Chapter weightage + topic repeat counts from the NEET blueprint. NEET questions with a chapter tag that matches the dataset only. */
function buildContext(q: PyqQuestion, exam: ExamKey | null): PyqContext | null {
  if (exam !== "neet" || q.chapter === UNTAGGED_CHAPTER) return null;
  const c = findChapterByNames(q.subject, q.chapter);
  const subject = c ? getSubject(c.subjectKey) : undefined;
  if (!c || !subject) return null;
  const ins = chapterInsights(c);
  const t = q.topic !== GENERAL_TOPIC ? matchTopic(c, q.topic) : null;
  return {
    subjectKey: c.subjectKey,
    subjectName: c.subjectName,
    chapterSlug: c.slug,
    chapterName: c.name,
    chapterTotal: c.total,
    subjectTotal: subject.total,
    share: c.share,
    rank: c.rank,
    chapterCount: subject.chapters.length,
    perPaperAvg: ins.perPaperAvg,
    trend: ins.trend,
    recentAvg: ins.recentAvg,
    earlierAvg: ins.earlierAvg,
    rangeLabel: RANGE_LABEL,
    paperCount: PAPER_LABELS.length,
    topic: t ? { name: q.topic, total: t.total, papers: t.papers } : null,
  };
}

export async function buildPublicPage(db: Db, doc: Doc): Promise<PyqPublicPage> {
  const [question] = await buildQuestions(db, "", [doc]);
  const keys = await practiceKeysFor(db, doc);
  const [related, adjacent] = await Promise.all([loadRelated(db, doc, keys.exam), loadAdjacent(db, doc, keys.exam)]);
  return {
    question,
    examKey: keys.exam,
    canonical: questionParam(question),
    indexable: isIndexable(plainText(question.body)),
    related,
    context: buildContext(question, keys.exam),
    adjacent,
  };
}

// ─── Sitemap ───────────────────────────────────────────────────────────────
// A sitemap file holds at most 50,000 urls (and 50 MB). Questions are served in
// chunks of this size from /sitemap-questions.xml?page=N, listed by the index at
// /sitemap.xml, so the bank can grow without ever hitting the limit.
export const SITEMAP_QUESTIONS_PER_FILE = 10_000;

const isoDate = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return null;
};

async function sitemapQuestionFilter(db: Db) {
  return { isPYQ: true, bundleId: { $in: await eligibleBundleIds(db) } };
}

/** How many question sitemap files exist (at least 1). Counts eligible questions, before the thin-page filter. */
export async function countSitemapQuestionPages(db: Db): Promise<number> {
  const n = await db.collection("questions").countDocuments(await sitemapQuestionFilter(db));
  return Math.max(1, Math.ceil(n / SITEMAP_QUESTIONS_PER_FILE));
}

/** Indexable public questions for one sitemap file (1-based page) as { path, lastmod } — thin/image-only ones are left out. */
export async function listSitemapQuestions(db: Db, page = 1): Promise<{ path: string; lastmod: string | null }[]> {
  const rows = await db
    .collection("questions")
    .find(await sitemapQuestionFilter(db), { projection: { body: 1, subject: 1, chapter: 1, updatedAt: 1, createdAt: 1 } })
    .sort({ _id: 1 })
    .skip((Math.max(1, page) - 1) * SITEMAP_QUESTIONS_PER_FILE)
    .limit(SITEMAP_QUESTIONS_PER_FILE)
    .toArray();

  const out: { path: string; lastmod: string | null }[] = [];
  for (const r of rows) {
    const body = String(r.body ?? "");
    if (!isIndexable(plainText(body))) continue;
    out.push({
      path: `/question/${questionParam({ id: String(r._id), body, subject: String(r.subject ?? ""), chapter: String(r.chapter ?? "") })}`,
      lastmod: isoDate(r.updatedAt ?? r.createdAt),
    });
  }
  return out;
}

// ─── Rate limit ────────────────────────────────────────────────────────────
// Fixed-window counter in Mongo (so it holds across serverless instances,
// unlike an in-memory Map). Fails OPEN: if Mongo hiccups, a student can still
// check an answer.
let rateIndexesEnsured = false;

export async function hitRateLimit(db: Db, key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const col = db.collection("rateLimits");
    if (!rateIndexesEnsured) {
      rateIndexesEnsured = true;
      try {
        await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await col.createIndex({ key: 1 }, { unique: true });
      } catch {
        // best-effort, same as the other ensure*Indexes helpers
      }
    }
    const bucket = Math.floor(Date.now() / (windowSec * 1000));
    const res = (await col.findOneAndUpdate(
      { key: `${key}:${bucket}` },
      { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowSec * 1000 + 60_000) } },
      { upsert: true, returnDocument: "after" },
    )) as unknown as { n?: number; value?: { n?: number } } | null;
    // mongodb v5 returns { value }, v6 returns the document itself.
    const n = res?.value?.n ?? res?.n ?? 1;
    return n <= limit;
  } catch {
    return true;
  }
}
