// SERVER-ONLY helpers for the public NCERT question pages (/ncert/$id) and their sitemap.
// Lives in lib/ because this repo's rule is that server-function files never import from each other.
//
// The one rule: the page and the sitemap may only ever see a question that
//   • belongs to the NCERT Line-by-Line bank, AND
//   • is read while the section is LIVE (not "coming soon" / beta).
// While it isn't live every function here answers "nothing": the page 404s and the sitemap is empty, so beta content is
// never public and never listed. And only NCERT_QUESTION_PROJECTION fields are read, so no answer or solution leaves here.
import { NCERT_QUESTION_PROJECTION, buildNcertQuestions, getNcertVisibility, ncertMatch, type Db } from "@/lib/ncert-line-server";
import { isNcertIndexable, ncertQuestionParam, ncertSnippet, type NcertPublicPage, type NcertRelated } from "@/lib/ncert-public";

const RELATED_COUNT = 6;
const ADJACENT_SCAN = 6;
/** A sitemap file holds at most 50,000 urls; stay well under it (same size as the PYQ chunks). */
export const SITEMAP_NCERT_PER_FILE = 10_000;

const PAGE_PROJECTION = { ...NCERT_QUESTION_PROJECTION, chapterKey: 1, topicKey: 1 } as unknown as Record<string, 0 | 1>;
type Doc = Record<string, unknown> & { _id: unknown };

export async function isNcertLive(db: Db): Promise<boolean> {
  return (await getNcertVisibility(db)).mode === "live";
}

/** One NCERT question by id, only while the section is live. Never includes the answer or solution. */
export async function loadPublicNcertDoc(db: Db, id: string): Promise<Doc | null> {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) return null;
  if (!(await isNcertLive(db))) return null;
  const { ObjectId } = await import("mongodb");
  const q = await db.collection("questions").findOne({ _id: new ObjectId(id), ...ncertMatch } as never, { projection: PAGE_PROJECTION });
  return (q as Doc | null) ?? null;
}

const scopeOf = (doc: Doc, withTopic: boolean) => ({
  ...ncertMatch,
  subject: doc.subject,
  ...(doc.chapterKey ? { chapterKey: doc.chapterKey } : { chapter: doc.chapter }),
  ...(withTopic && doc.topicKey ? { topicKey: doc.topicKey } : {}),
});

/** "Next N questions in the same topic/chapter" by _id, wrapping around, so every question is linked from another one. */
async function neighbours(db: Db, match: Record<string, unknown>, doc: Doc, limit: number, skip: Set<string>) {
  const col = db.collection("questions");
  const after = await col.find({ ...match, _id: { $gt: doc._id } } as never, { projection: PAGE_PROJECTION }).sort({ _id: 1 }).limit(limit + skip.size).toArray();
  let out = after.filter((d) => !skip.has(String(d._id)));
  if (out.length < limit) {
    const before = await col.find({ ...match, _id: { $lt: doc._id } } as never, { projection: PAGE_PROJECTION }).sort({ _id: 1 }).limit(limit - out.length + skip.size).toArray();
    out = [...out, ...before.filter((d) => !skip.has(String(d._id)))];
  }
  return out.slice(0, limit);
}

async function toRelated(db: Db, docs: Record<string, unknown>[]): Promise<NcertRelated[]> {
  const built = await buildNcertQuestions(db, "", docs);
  return built.map((q) => ({ param: ncertQuestionParam(q), snippet: ncertSnippet(q.body), chapter: q.chapter, topic: q.topic, difficulty: q.difficulty }));
}

export async function buildPublicNcertPage(db: Db, doc: Doc): Promise<NcertPublicPage> {
  const [built] = await buildNcertQuestions(db, "", [doc]);
  const { status: _status, ...question } = built;

  // Related: same topic first, then the rest of the chapter.
  const skip = new Set<string>([String(doc._id)]);
  let picked = doc.topicKey ? await neighbours(db, scopeOf(doc, true), doc, RELATED_COUNT, skip) : [];
  if (picked.length < RELATED_COUNT) {
    for (const p of picked) skip.add(String(p._id));
    picked = [...picked, ...(await neighbours(db, scopeOf(doc, false), doc, RELATED_COUNT - picked.length, skip))];
  }

  // Previous / next in the chapter by _id (no wrap-around), skipping thin pages that stay out of search.
  const col = db.collection("questions");
  const chapterScope = scopeOf(doc, false);
  const [after, before] = await Promise.all([
    col.find({ ...chapterScope, _id: { $gt: doc._id } } as never, { projection: PAGE_PROJECTION }).sort({ _id: 1 }).limit(ADJACENT_SCAN).toArray(),
    col.find({ ...chapterScope, _id: { $lt: doc._id } } as never, { projection: PAGE_PROJECTION }).sort({ _id: -1 }).limit(ADJACENT_SCAN).toArray(),
  ]);
  const pick = (rows: Record<string, unknown>[]) => rows.find((d) => isNcertIndexable({ body: String(d.body ?? "") }));
  const next = pick(after);
  const prev = pick(before);

  const [related, adj] = await Promise.all([toRelated(db, picked), toRelated(db, [next, prev].filter((d): d is Record<string, unknown> => Boolean(d)))]);
  const byParam = (d: Record<string, unknown> | undefined) => (d ? adj.find((a) => a.param.endsWith(String(d._id))) ?? null : null);

  return {
    question,
    canonical: ncertQuestionParam(question),
    indexable: isNcertIndexable(question),
    related,
    adjacent: { prev: byParam(prev), next: byParam(next) },
  };
}

// ─── Sitemap ───────────────────────────────────────────────────────────────
const isoDate = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return null;
};

/** How many NCERT sitemap files exist. 0 while the section isn't live (so the index doesn't list one at all). */
export async function countNcertSitemapPages(db: Db): Promise<number> {
  if (!(await isNcertLive(db))) return 0;
  const n = await db.collection("questions").countDocuments(ncertMatch as never);
  return Math.max(1, Math.ceil(n / SITEMAP_NCERT_PER_FILE));
}

/** Indexable NCERT questions for one sitemap file (1-based page) as { path, lastmod }. Empty while not live. */
export async function listNcertSitemapQuestions(db: Db, page = 1): Promise<{ path: string; lastmod: string | null }[]> {
  if (!(await isNcertLive(db))) return [];
  const rows = await db
    .collection("questions")
    .find(ncertMatch as never, { projection: { body: 1, subject: 1, chapter: 1, type: 1, updatedAt: 1, createdAt: 1 } })
    .sort({ _id: 1 })
    .skip((Math.max(1, page) - 1) * SITEMAP_NCERT_PER_FILE)
    .limit(SITEMAP_NCERT_PER_FILE)
    .toArray();

  const out: { path: string; lastmod: string | null }[] = [];
  for (const r of rows) {
    const body = String(r.body ?? "");
    if (!isNcertIndexable({ body })) continue;
    out.push({
      path: `/ncert/${ncertQuestionParam({ id: String(r._id), body, subject: String(r.subject ?? ""), chapter: String(r.chapter ?? "") })}`,
      lastmod: isoDate(r.updatedAt ?? r.createdAt),
    });
  }
  return out;
}
