// PYQ practice for visitors who are NOT logged in.
//
// What a guest gets (and why it is safe to open up):
//  • The browse tree (subjects → chapters → topics, with counts). No per-student
//    progress, since there is no student.
//  • Only the first GUEST_PYQ_LIMIT questions of a chapter/topic, newest paper
//    first. Not the whole list.
//  • Answers/solutions only through checkGuestPyqAnswer, and only for those same
//    free questions (isGuestQuestion), so the rest of the bank can't be pulled
//    out through this endpoint.
//  • Nothing is written: no practiceProgress, streaks, or bookmarks. Those need
//    an account, and the practice screen asks the guest to sign up.
// The signed-in endpoints in pyq-practice.ts are unchanged.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import {
  QUESTION_PROJECTION,
  assembleTree,
  buildQuestions,
  eligibleBundleIds,
  ensureQuestionIndexes,
  guestScopeDocs,
  isGuestQuestion,
  loadTreeRows,
  practiceKeysFor,
  scopeMatch,
  toExamKey,
} from "@/lib/pyq-server";
import type { OptionKey, PyqAnswer, PyqCheckResult, PyqList, PyqTree } from "@/lib/pyq-types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
// Guests with no exam picked get NEET, the exam this program is built around.
const guestExam = (requested?: string) => toExamKey(requested) ?? "neet";

export const getGuestPyqTree = createServerFn({ method: "GET" })
  .validator((data: { exam?: string }) => data)
  .handler(async ({ data }): Promise<PyqTree> => {
    const db = await getDb();
    await ensureQuestionIndexes(db);
    const exam = guestExam(data.exam);
    return assembleTree(await loadTreeRows(db, exam), new Map(), exam);
  });

export const listGuestPyqQuestions = createServerFn({ method: "GET" })
  .validator((data: { subject: string; chapter: string; topic?: string; exam?: string }) => data)
  .handler(async ({ data }): Promise<PyqList> => {
    if (typeof data.subject !== "string" || typeof data.chapter !== "string") throw new Error("Question set not found.");
    const db = await getDb();
    await ensureQuestionIndexes(db);
    const match = await scopeMatch(db, guestExam(data.exam), data.subject, data.chapter, data.topic);

    const [docs, total] = await Promise.all([
      guestScopeDocs(db, match, QUESTION_PROJECTION as unknown as Record<string, 0 | 1>),
      db.collection("questions").countDocuments(match),
    ]);
    // uid "" never matches a progress row, so every status comes back "new" and nothing is bookmarked.
    const questions = await buildQuestions(db, "", docs);
    const years = [...new Set(questions.map((q) => q.source.year).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a));
    return { questions, years, total };
  });

export const checkGuestPyqAnswer = createServerFn({ method: "POST" })
  .validator((data: { questionId: string; answer: PyqAnswer }) => data)
  .handler(async ({ data }): Promise<PyqCheckResult> => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    if (typeof data.questionId !== "string" || !/^[a-f0-9]{24}$/i.test(data.questionId)) throw new Error("Question not found.");
    const q = await db.collection("questions").findOne({ _id: new ObjectId(data.questionId) });
    // Same gate as the signed-in endpoint: a PYQ in one of OUR batches...
    if (!q || q.isPYQ !== true || !(await eligibleBundleIds(db)).includes(String(q.bundleId))) throw new Error("Question not found.");
    // ...and, for guests, one of the free questions of its chapter/topic.
    const { exam } = await practiceKeysFor(db, q);
    if (!(await isGuestQuestion(db, exam, q))) throw new Error("Log in to practise the rest of this chapter.");

    const reveal: Pick<PyqCheckResult, "correctOption" | "correctAnswer" | "solution"> = {
      ...(q.type === "mcq" ? { correctOption: q.correctOption as OptionKey } : { correctAnswer: q.correctAnswer as number }),
      solution: (q.solution as string) ?? "",
    };

    if (data.answer === null) return { isCorrect: false, revealed: true, ...reveal, status: "revealed" };

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
    return { isCorrect, revealed: false, ...reveal, status: isCorrect ? "correct" : "wrong" };
  });
