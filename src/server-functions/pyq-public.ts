// Public question pages (/question/$id) for visitors arriving from Google.
//
// What a logged-out visitor can get from here, and why it is safe:
//  • getPublicQuestion: the question text, options and source label, plus a few
//    related questions. Same projection as the practice list, so no answer and
//    no solution ever leave the server in this call.
//  • checkPublicPyqAnswer: whether their answer is right and what the correct
//    answer is (they may also just reveal it). NEVER the solution — that needs
//    an account and goes through the signed-in submitPyqAnswer in pyq-practice.ts.
//    Rate-limited per IP so the answer key can't be pulled out wholesale.
//  • Nothing is written: no progress, streaks or bookmarks for a guest.
// Signed-in endpoints and the 5-question guest preview are unchanged.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { getCurrentRequest } from "@/lib/get-request";
import { ensureQuestionIndexes } from "@/lib/pyq-server";
import { buildPublicPage, hitRateLimit, loadPublicQuestionDoc } from "@/lib/pyq-public-server";
import type { PublicCheckResult, PyqPublicPage } from "@/lib/pyq-public";
import type { OptionKey, PyqAnswer } from "@/lib/pyq-types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const CHECKS_PER_WINDOW = 40; // per IP...
const WINDOW_SECONDS = 600; // ...per 10 minutes

// Same header-based lookup as blog-public.ts / sessions.ts; read server-side, never from the body.
function clientIp(): string {
  const request = getCurrentRequest();
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request?.headers.get("x-real-ip") ?? "unknown";
}

export const getPublicQuestion = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<PyqPublicPage | null> => {
    const db = await getDb();
    await ensureQuestionIndexes(db);
    // includeAnswer=false: the doc is fetched with the no-answer projection.
    const doc = await loadPublicQuestionDoc(db, String(data.id), false);
    return doc ? buildPublicPage(db, doc) : null;
  });

export const checkPublicPyqAnswer = createServerFn({ method: "POST" })
  .validator((data: { questionId: string; answer: PyqAnswer }) => data)
  .handler(async ({ data }): Promise<PublicCheckResult> => {
    const db = await getDb();
    if (!(await hitRateLimit(db, `pyq-public-check:${clientIp()}`, CHECKS_PER_WINDOW, WINDOW_SECONDS))) {
      throw new Error("Too many checks from this network. Log in to keep practising, or try again in a few minutes.");
    }

    const q = await loadPublicQuestionDoc(db, String(data.questionId), true);
    if (!q) throw new Error("Question not found.");

    const reveal = {
      ...(q.type === "mcq" ? { correctOption: q.correctOption as OptionKey } : { correctAnswer: q.correctAnswer as number }),
      hasSolution: typeof q.solution === "string" && q.solution.trim().length > 0,
    };

    // "Show answer" without trying.
    if (data.answer === null) return { isCorrect: false, revealed: true, ...reveal };

    let isCorrect = false;
    if (q.type === "mcq") {
      const opt = data.answer?.option;
      if (!opt || !OPTION_KEYS.includes(opt)) throw new Error("Pick an option first.");
      isCorrect = opt === q.correctOption;
    } else {
      const v = data.answer?.value;
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Enter a number first.");
      isCorrect = Math.abs(v - (q.correctAnswer as number)) < 1e-6; // same tolerance as the signed-in endpoint
    }
    return { isCorrect, revealed: false, ...reveal };
  });
