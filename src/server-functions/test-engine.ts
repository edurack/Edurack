// Server functions for the actual CBT test-taking engine. Two important
// security properties enforced here, not just in the UI:
//   1. Purchase is re-checked server-side before handing out questions —
//      the paywall isn't just a client-side visual lock.
//   2. Grading happens server-side. getTestForTaking deliberately never
//      sends `correctOption` or `solution` to the client — only after
//      submitTestAttempt runs does the score get computed and returned.
//      Sending correct answers to the browser during an active exam would
//      make them readable via dev tools/network tab.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

export const getTestForTaking = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.testId) });
    if (!test) throw new Error("Test not found");

    // Re-verify purchase server-side — never trust a client-side isPurchased
    // flag alone to gate access to actual exam content.
    const purchase = await db.collection("purchases").findOne({
      uid: decoded.uid,
      itemType: "bundle",
      itemId: test.bundleId as string,
    });
    if (!purchase) throw new Error("This batch hasn't been purchased.");

    const [questionDocs, priorAttemptCount] = await Promise.all([
      db.collection("questions").find({ testId: data.testId }).sort({ subject: 1, questionNo: 1 }).toArray(),
      db.collection("testAttempts").countDocuments({ uid: decoded.uid, testId: data.testId }),
    ]);

    return {
      test: {
        id: String(test._id),
        name: test.name as string,
        subjects: (test.subjects as string[]) ?? [],
        totalQuestions: test.totalQuestions as number,
        // FIXED: this was reading `test.timeLimitMinutes`, a field that
        // was never actually written to testCores documents anywhere —
        // Test Core stores the duration as `durationMinutes` (see
        // admin.ts createTestCore/updateTestCore and admin-types.ts
        // TestCore). That mismatch meant every test silently fell
        // through to the `?? 180` fallback, no matter what duration was
        // set when the test was created — which is why the countdown
        // timer on the exam page always showed ~180 minutes regardless
        // of what Test Core displayed. Reading the real field now.
        timeLimitMinutes: (test.durationMinutes as number) ?? 180,
      },
      // Which attempt this will be if submitted (1st, 2nd, ...) — shown in
      // the test UI so a student retaking a test knows which attempt
      // they're on.
      attemptNumber: priorAttemptCount + 1,
      questions: questionDocs.map((q) => ({
        id: String(q._id),
        subject: q.subject as string,
        questionNo: q.questionNo as number,
        body: q.body as string,
        options: q.options as { A: string; B: string; C: string; D: string },
        // Deliberately omitted: correctOption, solution.
      })),
    };
  });

export const submitTestAttempt = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      testId: string;
      answers: Record<string, "A" | "B" | "C" | "D" | undefined>;
      timeTakenMinutes: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.testId) });
    if (!test) throw new Error("Test not found");

    const purchase = await db.collection("purchases").findOne({
      uid: decoded.uid,
      itemType: "bundle",
      itemId: test.bundleId as string,
    });
    if (!purchase) throw new Error("This batch hasn't been purchased.");

    const questionDocs = await db.collection("questions").find({ testId: data.testId }).toArray();

    // Standard NEET marking scheme: +4 correct, -1 incorrect, 0 unanswered.
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    // Per-question breakdown (selected answer, correct answer, marks) —
    // this is what lets a student review exactly which questions they got
    // wrong later, question by question.
    const questionResults: {
      questionId: string;
      questionNo: number;
      subject: string;
      selectedOption: "A" | "B" | "C" | "D" | null;
      correctOption: "A" | "B" | "C" | "D";
      isCorrect: boolean;
      marksAwarded: number;
    }[] = [];

    // Per-subject rollup (Physics/Chemistry/Biology breakdown).
    const subjectTally = new Map<string, { correct: number; incorrect: number; unanswered: number; marks: number }>();

    for (const q of questionDocs) {
      const questionId = String(q._id);
      const given = data.answers[questionId] ?? null;
      const correctOption = q.correctOption as "A" | "B" | "C" | "D";
      const subject = q.subject as string;

      let marksAwarded = 0;
      let isCorrect = false;

      if (!given) {
        unansweredCount++;
      } else if (given === correctOption) {
        correctCount++;
        marksAwarded = 4;
        isCorrect = true;
      } else {
        incorrectCount++;
        marksAwarded = -1;
      }

      questionResults.push({
        questionId,
        questionNo: q.questionNo as number,
        subject,
        selectedOption: given,
        correctOption,
        isCorrect,
        marksAwarded,
      });

      const tally = subjectTally.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0, marks: 0 };
      if (!given) tally.unanswered++;
      else if (isCorrect) tally.correct++;
      else tally.incorrect++;
      tally.marks += marksAwarded;
      subjectTally.set(subject, tally);
    }

    const score = correctCount * 4 - incorrectCount * 1;
    const totalMarks = questionDocs.length * 4;
    const attemptNumber = (await db.collection("testAttempts").countDocuments({ uid: decoded.uid, testId: data.testId })) + 1;

    const subjectBreakdown = Array.from(subjectTally.entries()).map(([subject, tally]) => ({
      subject,
      ...tally,
    }));

    const result = await db.collection("testAttempts").insertOne({
      uid: decoded.uid,
      testId: data.testId,
      testName: test.name as string,
      bundleId: test.bundleId as string,
      attemptNumber,
      score,
      totalMarks,
      correctCount,
      incorrectCount,
      unansweredCount,
      timeTakenMinutes: data.timeTakenMinutes,
      subjectBreakdown,
      questionResults,
      submittedAt: new Date(),
    });

    return {
      attemptId: String(result.insertedId),
      score,
      totalMarks,
      correctCount,
      incorrectCount,
      unansweredCount,
    };
  });