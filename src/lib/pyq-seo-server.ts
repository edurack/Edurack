// SERVER-ONLY helpers for the public SEO pages that read the question bank:
//   /neet/question-of-the-day                           (today's NEET PYQ, same one the dashboard serves)
//   /neet/chapter-wise-weightage/<subject>/<chapter>/sheet   (20 free questions to print)
// Same rule as pyq-public-server.ts: only isPYQ questions in OUR bundles are ever read, and the page
// payloads never carry an answer or a solution.
import { QUESTION_PROJECTION, buildQuestions, eligibleBundleIds, ensureQuestionIndexes, pyqMatch, scopeMatch, type Db } from "@/lib/pyq-server";
import { pickDailyIndex } from "@/lib/practice-schedule";
import { buildPublicPage } from "@/lib/pyq-public-server";
import { isIndexable, plainText, questionParam, type PyqPublicPage } from "@/lib/pyq-public";
import type { PyqQuestion } from "@/lib/pyq-types";

export const SHEET_SIZE = 20;
const QOTD_EXAM = "neet" as const;

/** Today's NEET question. Shares the dailyPyq collection with the dashboard, so both always show the same one. */
export async function neetDailyQuestionId(db: Db, day: string): Promise<string | null> {
  const key = `${QOTD_EXAM}|${day}`;
  const col = db.collection("dailyPyq");
  const hit = await col.findOne({ key });
  if (hit) return hit.questionId as string;

  const pool = await db.collection("questions").find(await pyqMatch(db, QOTD_EXAM), { projection: { _id: 1 } }).sort({ _id: 1 }).limit(5000).toArray();
  if (pool.length === 0) return null;
  const id = String(pool[pickDailyIndex(key, pool.length)]._id);
  await col.updateOne({ key }, { $setOnInsert: { key, day, exam: QOTD_EXAM, questionId: id, createdAt: new Date() } }, { upsert: true });
  return ((await col.findOne({ key }))?.questionId as string | undefined) ?? id;
}

export type QotdPayload = {
  day: string;
  page: PyqPublicPage;
  /** Earlier days' questions that exist, newest first: crawlable archive links. */
  earlier: { day: string; param: string; snippet: string }[];
};

export async function loadQotd(db: Db, day: string, previousDays: string[]): Promise<QotdPayload | null> {
  const { ObjectId } = await import("mongodb");
  await ensureQuestionIndexes(db);
  const id = await neetDailyQuestionId(db, day);
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
  const eligible = await eligibleBundleIds(db);
  const doc = await db.collection("questions").findOne({ _id: new ObjectId(id) }, { projection: { ...QUESTION_PROJECTION, isPYQ: 1 } as never });
  if (!doc || doc.isPYQ !== true || !eligible.includes(String(doc.bundleId))) return null;
  const page = await buildPublicPage(db, doc);

  const rows = await db.collection("dailyPyq").find({ key: { $in: previousDays.map((d) => `${QOTD_EXAM}|${d}`) } }).toArray();
  const earlier: QotdPayload["earlier"] = [];
  for (const d of previousDays) {
    const r = rows.find((x) => x.key === `${QOTD_EXAM}|${d}`);
    if (!r || !/^[a-f0-9]{24}$/i.test(String(r.questionId))) continue;
    const q = await db.collection("questions").findOne({ _id: new ObjectId(String(r.questionId)) }, { projection: { ...QUESTION_PROJECTION, isPYQ: 1 } as never });
    if (!q || q.isPYQ !== true || !eligible.includes(String(q.bundleId))) continue;
    const body = String(q.body ?? "");
    if (!isIndexable(plainText(body))) continue;
    earlier.push({ day: d, param: questionParam({ id: String(q._id), body, subject: String(q.subject ?? ""), chapter: String(q.chapter ?? "") }), snippet: plainText(body).slice(0, 110) });
  }
  return { day, page, earlier };
}

/** The sheet's question docs: first SHEET_SIZE readable questions of the chapter, newest paper first, stable order. */
async function sheetDocs(db: Db, subject: string, chapter: string, projection?: Record<string, 0 | 1>) {
  const match = await scopeMatch(db, QOTD_EXAM, subject, chapter);
  const docs = await db.collection("questions").find(match, projection ? { projection } : undefined).sort({ pyqYear: -1, _id: 1 }).limit(SHEET_SIZE * 3).toArray();
  return docs.filter((d) => isIndexable(plainText(String(d.body ?? "")))).slice(0, SHEET_SIZE);
}

export async function loadChapterSheet(db: Db, subject: string, chapter: string): Promise<{ questions: PyqQuestion[]; total: number }> {
  await ensureQuestionIndexes(db);
  const match = await scopeMatch(db, QOTD_EXAM, subject, chapter);
  const [docs, total] = await Promise.all([sheetDocs(db, subject, chapter, QUESTION_PROJECTION as unknown as Record<string, 0 | 1>), db.collection("questions").countDocuments(match)]);
  return { questions: await buildQuestions(db, "", docs), total };
}

/** Answer key for exactly the sheet's questions, in sheet order. Callers must have verified a signed-in user. */
export async function loadChapterSheetKey(db: Db, subject: string, chapter: string): Promise<{ id: string; answer: string }[]> {
  const docs = await sheetDocs(db, subject, chapter);
  return docs.map((d) => ({ id: String(d._id), answer: d.type === "mcq" ? String(d.correctOption ?? "") : String(d.correctAnswer ?? "") }));
}
