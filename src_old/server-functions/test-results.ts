// Server functions backing the Test Result page: a private, detailed
// review of one specific attempt (only the owner can view it), and a
// public-to-purchasers leaderboard for that test.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

type OptionKey = "A" | "B" | "C" | "D";

// ─── Full attempt detail + question-by-question review ────────────────────
export const getTestAttempt = createServerFn({ method: "GET" })
  .validator((data: { token: string; attemptId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const attempt = await db.collection("testAttempts").findOne({ _id: new ObjectId(data.attemptId) });
    if (!attempt) throw new Error("Attempt not found");

    // Only the student who took this attempt can view its detail — an
    // attemptId is guessable-ish (Mongo ObjectId), so this check matters.
    if (attempt.uid !== decoded.uid) {
      throw new Error("You don't have access to this attempt.");
    }

    const questionResults = (attempt.questionResults ?? []) as {
      questionId: string;
      questionNo: number;
      subject: string;
      type?: "mcq" | "integer"; // absent on attempts submitted before this change
      selectedOption: OptionKey | null;
      correctOption: OptionKey | null;
      selectedAnswer?: number | null;
      correctAnswer?: number | null;
      isCorrect: boolean;
      marksAwarded: number;
    }[];

    // questionResults only stored the graded outcome, not the actual
    // question text/options/solution — fetch those now (safe to show in
    // full, including the solution, since the test is already submitted).
    const { ObjectId: OID } = await import("mongodb");
    const questionDocs = await db
      .collection("questions")
      .find({ _id: { $in: questionResults.map((q) => new OID(q.questionId)) } })
      .toArray();
    const questionById = new Map(questionDocs.map((q) => [String(q._id), q]));

    const review = questionResults
      .map((r) => {
        const doc = questionById.get(r.questionId);
        if (!doc) return null;
        const type = r.type ?? (doc.type as "mcq" | "integer") ?? "mcq";
        return {
          questionNo: r.questionNo,
          subject: r.subject,
          type,
          body: doc.body as string,
          options: type === "mcq" ? (doc.options as Record<OptionKey, string>) : undefined,
          solution: doc.solution as string,
          selectedOption: r.selectedOption,
          correctOption: type === "mcq" ? (doc.correctOption as OptionKey) : undefined,
          selectedAnswer: r.selectedAnswer ?? null,
          correctAnswer: type === "integer" ? (doc.correctAnswer as number) : undefined,
          isCorrect: r.isCorrect,
          marksAwarded: r.marksAwarded,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.subject === b.subject ? a.questionNo - b.questionNo : a.subject.localeCompare(b.subject)));

    return {
      attempt: {
        id: String(attempt._id),
        testId: attempt.testId as string,
        testName: attempt.testName as string,
        attemptNumber: attempt.attemptNumber as number,
        score: attempt.score as number,
        totalMarks: attempt.totalMarks as number,
        correctCount: attempt.correctCount as number,
        incorrectCount: attempt.incorrectCount as number,
        unansweredCount: attempt.unansweredCount as number,
        timeTakenMinutes: attempt.timeTakenMinutes as number,
        subjectBreakdown: (attempt.subjectBreakdown ?? []) as {
          subject: string;
          correct: number;
          incorrect: number;
          unanswered: number;
          marks: number;
        }[],
        submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : null,
      },
      review,
    };
  });

// ─── This student's own attempts on a test (for the course hub + analysis) ─
export const listMyAttemptsForTest = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const rows = await db
      .collection("testAttempts")
      .find({ uid: decoded.uid, testId: data.testId })
      .sort({ attemptNumber: 1 })
      .toArray();

    return {
      attempts: rows.map((r) => ({
        id: String(r._id),
        attemptNumber: r.attemptNumber as number,
        score: r.score as number,
        totalMarks: r.totalMarks as number,
        timeTakenMinutes: r.timeTakenMinutes as number,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : null,
      })),
    };
  });

// ─── Full cross-attempt analysis: trend, subject accuracy, recurring mistakes ─
export const getTestAnalysis = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const attempts = await db
      .collection("testAttempts")
      .find({ uid: decoded.uid, testId: data.testId })
      .sort({ attemptNumber: 1 })
      .toArray();

    if (attempts.length === 0) {
      return { testName: null, attempts: [], subjectAccuracy: [], recurringMistakes: [] };
    }

    const testName = attempts[0].testName as string;

    // Aggregate subject-wise totals across every attempt, not just the
    // latest — a student who's always weak in Chemistry should see that
    // pattern, not just their most recent single result.
    const subjectTotals = new Map<string, { correct: number; incorrect: number; unanswered: number }>();
    // Per-question tally across all attempts, to surface "you keep getting
    // this one wrong" rather than just "you got X questions wrong once."
    const questionTally = new Map<string, { wrongCount: number; totalSeen: number; subject: string }>();

    for (const a of attempts) {
      const breakdown = (a.subjectBreakdown ?? []) as { subject: string; correct: number; incorrect: number; unanswered: number }[];
      for (const s of breakdown) {
        const t = subjectTotals.get(s.subject) ?? { correct: 0, incorrect: 0, unanswered: 0 };
        t.correct += s.correct;
        t.incorrect += s.incorrect;
        t.unanswered += s.unanswered;
        subjectTotals.set(s.subject, t);
      }

      const results = (a.questionResults ?? []) as {
        questionId: string;
        subject: string;
        isCorrect: boolean;
      }[];
      for (const r of results) {
        const t = questionTally.get(r.questionId) ?? { wrongCount: 0, totalSeen: 0, subject: r.subject };
        t.totalSeen += 1;
        if (!r.isCorrect) t.wrongCount += 1;
        questionTally.set(r.questionId, t);
      }
    }

    const subjectAccuracy = Array.from(subjectTotals.entries()).map(([subject, t]) => {
      const attempted = t.correct + t.incorrect;
      return {
        subject,
        correct: t.correct,
        incorrect: t.incorrect,
        unanswered: t.unanswered,
        accuracyPercent: attempted > 0 ? Math.round((t.correct / attempted) * 100) : 0,
      };
    });

    // "Recurring mistakes" — questions gotten wrong at least once, ranked by
    // how often they're wrong. Only worth surfacing across 2+ attempts;
    // with a single attempt this just lists everything missed once.
    const worstQuestionIds = Array.from(questionTally.entries())
      .filter(([, t]) => t.wrongCount > 0)
      .sort((a, b) => b[1].wrongCount / b[1].totalSeen - a[1].wrongCount / a[1].totalSeen)
      .slice(0, 8)
      .map(([id]) => id);

    const { ObjectId } = await import("mongodb");
    const questionDocs = await db
      .collection("questions")
      .find({ _id: { $in: worstQuestionIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const questionById = new Map(questionDocs.map((q) => [String(q._id), q]));

    const recurringMistakes = worstQuestionIds
      .map((id) => {
        const doc = questionById.get(id);
        const tally = questionTally.get(id)!;
        if (!doc) return null;
        const type = (doc.type as "mcq" | "integer") ?? "mcq";
        return {
          questionNo: doc.questionNo as number,
          subject: doc.subject as string,
          body: doc.body as string,
          type,
          correctOption: type === "mcq" ? (doc.correctOption as OptionKey) : undefined,
          correctAnswer: type === "integer" ? (doc.correctAnswer as number) : undefined,
          solution: doc.solution as string,
          wrongCount: tally.wrongCount,
          totalSeen: tally.totalSeen,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    return {
      testName,
      attempts: attempts.map((a) => ({
        id: String(a._id),
        attemptNumber: a.attemptNumber as number,
        score: a.score as number,
        totalMarks: a.totalMarks as number,
        timeTakenMinutes: a.timeTakenMinutes as number,
        submittedAt: a.submittedAt instanceof Date ? a.submittedAt.toISOString() : null,
      })),
      subjectAccuracy,
      recurringMistakes,
    };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    // One row per student — their highest score on this test — so retrying
    // a test can't be used to flood the board with duplicate entries.
    const bestAttempts = await db
      .collection("testAttempts")
      .aggregate([
        { $match: { testId: data.testId } },
        { $sort: { score: -1, timeTakenMinutes: 1 } },
        { $group: { _id: "$uid", score: { $first: "$score" }, totalMarks: { $first: "$totalMarks" } } },
        { $sort: { score: -1 } },
      ])
      .toArray();

    const uids = bestAttempts.map((r) => r._id as string);
    const profiles = await db
      .collection("profiles")
      .find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1 } })
      .toArray();
    const nameByUid = new Map(profiles.map((p) => [p.uid as string, (p.fullName as string) || "Student"]));

    const ranked = bestAttempts.map((r, i) => ({
      rank: i + 1,
      uid: r._id as string,
      name: nameByUid.get(r._id as string) ?? "Student",
      score: r.score as number,
      totalMarks: r.totalMarks as number,
      isYou: r._id === decoded.uid,
    }));

    const yourEntry = ranked.find((r) => r.isYou) ?? null;

    return {
      top: ranked.slice(0, 20),
      yourRank: yourEntry ? { rank: yourEntry.rank, score: yourEntry.score, totalMarks: yourEntry.totalMarks } : null,
      totalParticipants: ranked.length,
    };
  });