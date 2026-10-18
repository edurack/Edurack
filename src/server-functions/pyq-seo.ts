// Server functions for the public SEO pages that read the question bank (question of the day, chapter sheets).
// Logic lives in lib/pyq-seo-server.ts (server-only). Nothing here writes anything.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { istDayKey, addDays } from "@/lib/practice-schedule";
import type { QotdPayload } from "@/lib/pyq-seo-server";
import type { PyqQuestion } from "@/lib/pyq-types";
import type { PyqRelated } from "@/lib/pyq-public";
import { getChapter } from "@/lib/neet-blueprint";

export type ChapterSheet = { questions: PyqQuestion[]; total: number };

/** Today's NEET question (IST day), with links to the last few days. No answer or solution in the payload. */
export const getQuestionOfTheDay = createServerFn({ method: "GET" }).handler(async (): Promise<QotdPayload | null> => {
  const { loadQotd } = await import("@/lib/pyq-seo-server");
  const db = await getDb();
  const day = istDayKey(new Date());
  return loadQotd(db, day, [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(day, -n)));
});

export const getChapterSheet = createServerFn({ method: "GET" })
  .validator((data: { subject: string; chapter: string }) => data)
  .handler(async ({ data }): Promise<ChapterSheet> => {
    if (typeof data.subject !== "string" || typeof data.chapter !== "string") throw new Error("Sheet not found.");
    const { loadChapterSheet } = await import("@/lib/pyq-seo-server");
    return loadChapterSheet(await getDb(), data.subject, data.chapter);
  });

/** Links from a chapter weightage page to that chapter's PYQ pages. Takes the blueprint keys, never free text. No answers in the payload. */
export const getChapterTopQuestions = createServerFn({ method: "GET" })
  .validator((data: { subject: string; chapter: string }) => data)
  .handler(async ({ data }): Promise<PyqRelated[]> => {
    if (typeof data.subject !== "string" || typeof data.chapter !== "string") return [];
    const c = getChapter(data.subject, data.chapter);
    if (!c) return [];
    const { loadChapterTopQuestions } = await import("@/lib/pyq-seo-server");
    return loadChapterTopQuestions(await getDb(), c.subjectName, c.name);
  });

/** The answer key is the reason to sign up: signed-in students only. */
export const getChapterSheetKey = createServerFn({ method: "POST" })
  .validator((data: { token: string; subject: string; chapter: string }) => data)
  .handler(async ({ data }): Promise<{ id: string; answer: string }[]> => {
    await adminAuth.verifyIdToken(data.token);
    const { loadChapterSheetKey } = await import("@/lib/pyq-seo-server");
    return loadChapterSheetKey(await getDb(), data.subject, data.chapter);
  });
