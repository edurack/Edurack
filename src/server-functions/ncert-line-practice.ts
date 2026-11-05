// NCERT Line-by-Line practice: browse the NCERT-syllabus question bank by
// Subject → Chapter → Topic and practise with instant feedback. Same safety
// rules as pyq-practice.ts — the list endpoint never returns the answer or
// solution, and progress lives in its own collection (ncertProgress), never
// touching practiceProgress/testAttempts/leaderboards.
//
// Gated by lib/ncert-line-server.ts's visibility flag: while the admin has
// this set to "beta", only the allow-listed emails can list/practice: anyone
// else gets a plain "not available yet" error (the UI shows a Coming soon
// card and never calls these for other students).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import {
  NCERT_QUESTION_PROJECTION,
  assembleNcertTree,
  buildNcertQuestions,
  ensureNcertIndexes,
  getNcertVisibility,
  isNcertEnabledFor,
  loadNcertTreeRows,
  ncertMatch,
  statusOf,
} from "@/lib/ncert-line-server";
import type { NcertAnswer, NcertCheckResult, NcertList, NcertTree } from "@/lib/ncert-line-types";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;
const MAX_LIST = 300;

async function requireAccess(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  const db = await getDb();
  const visibility = await getNcertVisibility(db);
  if (!isNcertEnabledFor(visibility, decoded.email)) {
    throw new Error("NCERT Line by Line isn't open to your account yet.");
  }
  return { decoded, db };
}

/** Whether THIS student can open the section right now — the PYQ page calls this to show Coming soon vs. a live card. */
export const getNcertAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ enabled: boolean; mode: "beta" | "live" }> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    const visibility = await getNcertVisibility(db);
    return { enabled: isNcertEnabledFor(visibility, decoded.email), mode: visibility.mode };
  });

export const getNcertTree = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<NcertTree> => {
    const { decoded, db } = await requireAccess(data.token);
    await ensureNcertIndexes(db);
    const rows = await loadNcertTreeRows(db);

    const prog = await db
      .collection("ncertProgress")
      .aggregate([
        { $match: { uid: decoded.uid } },
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
    return assembleNcertTree(rows, progMap);
  });

export const listNcertQuestions = createServerFn({ method: "POST" })
  .validator((data: { token: string; subject: string; chapter: string; topic?: string }) => data)
  .handler(async ({ data }): Promise<NcertList> => {
    const { decoded, db } = await requireAccess(data.token);
    await ensureNcertIndexes(db);

    const match: Record<string, unknown> = { ...ncertMatch, subject: data.subject, chapterKey: data.chapter.trim().toLowerCase() };
    if (data.topic) match.topicKey = data.topic.trim().toLowerCase();

    const docs = await db
      .collection("questions")
      .find(match, { projection: NCERT_QUESTION_PROJECTION })
      .sort({ topicKey: 1, topicQuestionNo: 1 })
      .limit(MAX_LIST)
      .toArray();

    const questions = await buildNcertQuestions(db, decoded.uid, docs);
    return { questions, total: questions.length };
  });

export const submitNcertAnswer = createServerFn({ method: "POST" })
  .validator((data: { token: string; questionId: string; answer: NcertAnswer }) => data)
  .handler(async ({ data }): Promise<NcertCheckResult> => {
    const { decoded, db } = await requireAccess(data.token);
    await ensureNcertIndexes(db);

    if (!/^[a-f0-9]{24}$/i.test(data.questionId)) throw new Error("Question not found.");
    const { ObjectId } = await import("mongodb");
    const q = await db.collection("questions").findOne({ _id: new ObjectId(data.questionId) });
    if (!q || q.source !== "ncertLineByLine") throw new Error("Question not found.");

    const col = db.collection("ncertProgress");
    const where = { uid: decoded.uid, questionId: data.questionId };
    const keys = { subject: q.subject as string, chapterKey: q.chapterKey as string, topicKey: q.topicKey as string };

    const reveal = {
      ...(q.type === "mcq" ? { correctOption: q.correctOption as "A" | "B" | "C" | "D" } : { correctAnswer: q.correctAnswer as number }),
      solution: (q.solution as string) ?? "",
    };

    if (data.answer === null) {
      await col.updateOne(where, { $set: { ...keys, revealed: true, updatedAt: new Date() }, $setOnInsert: { attempts: 0, correct: false, uid: decoded.uid, questionId: data.questionId } }, { upsert: true });
      return { isCorrect: false, revealed: true, ...reveal, status: statusOf(await col.findOne(where)) };
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
      isCorrect = v === q.correctAnswer;
      lastAnswer = v;
    }

    await col.updateOne(
      where,
      {
        $set: { ...keys, correct: isCorrect, lastAnswer, updatedAt: new Date() },
        $inc: { attempts: 1 },
        $setOnInsert: { uid: decoded.uid, questionId: data.questionId, revealed: false },
      },
      { upsert: true },
    );

    return { isCorrect, revealed: false, ...reveal, status: statusOf(await col.findOne(where)) };
  });
