// Server functions for the actual CBT test-taking engine. Two important
// security properties enforced here, not just in the UI:
//   1. Purchase/access is re-checked server-side before handing out
//      questions — the paywall isn't just a client-side visual lock.
//   2. Grading happens server-side. getTestForTaking deliberately never
//      sends `correctOption` or `solution` to the client — only after
//      submitTestAttempt runs does the score get computed and returned.
//
// A test can come from either "testCores" (Test Series / admin bundles)
// or "soldTests" (standalone Sell Tests) — findTest checks both, since a
// testId alone doesn't say which collection it lives in.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { findRuleForQuestion, type AttemptRule } from "@/lib/attempt-rules";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

type TestSource = "testCore" | "soldTest";

async function findTest(testId: string): Promise<{ source: TestSource; doc: Record<string, any> } | null> {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const oid = new ObjectId(testId);

  const testCore = await db.collection("testCores").findOne({ _id: oid });
  if (testCore) return { source: "testCore", doc: testCore };

  const soldTest = await db.collection("soldTests").findOne({ _id: oid });
  if (soldTest) return { source: "soldTest", doc: soldTest };

  return null;
}

// A test's access rule depends on where it comes from:
//   - testCores, "standard" (admin-created) bundle → needs a bundle purchase.
//   - testCores, "mentorBatchSeries" bundle → free test unlocks for anyone
//     who bought the mentor's mentorship batch; paid test unlocks via its
//     own standalone "mentorTest" purchase, batch purchase not required.
//   - soldTests → must be "live" (admin approved a price). Unlocks via a
//     direct standalone "mentorTest" purchase of this exact testId, OR if
//     this test is attached to a mentorship batch the student purchased.
async function verifyTestAccess(uid: string, source: TestSource, test: Record<string, any>): Promise<void> {
  const db = await getDb();

  if (source === "soldTest") {
    if (test.status !== "live" || !test.approvedPrice) {
      throw new Error("This test isn't available yet.");
    }
    const directPurchase = await db
      .collection("purchases")
      .findOne({ uid, itemType: "mentorTest", itemId: String(test._id) });
    if (directPurchase) return;

    const attachedBatchIds = (test.attachedBatchIds as string[]) ?? [];
    if (attachedBatchIds.length > 0) {
      const batchPurchase = await db
        .collection("purchases")
        .findOne({ uid, itemType: "mentorship", itemId: { $in: attachedBatchIds } });
      if (batchPurchase) return;
    }
    throw new Error("This test hasn't been purchased.");
  }

  // source === "testCore"
  const { ObjectId } = await import("mongodb");
  const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(test.bundleId as string) });
  if (!bundle) throw new Error("This test's series is no longer available.");

  if (bundle.kind === "mentorBatchSeries") {
    if (!test.publishedToBatch) throw new Error("This test hasn't been made available by your mentor yet.");

    const isPaid = Boolean(test.price) && (test.price as number) > 0;
    const purchase = isPaid
      ? await db.collection("purchases").findOne({ uid, itemType: "mentorTest", itemId: String(test._id) })
      : await db.collection("purchases").findOne({ uid, itemType: "mentorship", itemId: bundle.batchId as string });

    if (!purchase) {
      throw new Error(isPaid ? "This test hasn't been purchased." : "This batch hasn't been purchased.");
    }
    return;
  }

  const purchase = await db.collection("purchases").findOne({
    uid,
    itemType: "bundle",
    itemId: test.bundleId as string,
  });
  if (!purchase) throw new Error("This batch hasn't been purchased.");
}

export const getTestForTaking = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const found = await findTest(data.testId);
    if (!found) throw new Error("Test not found");
    const { source, doc: test } = found;

    // Re-verify purchase server-side — never trust a client-side access flag alone.
    await verifyTestAccess(decoded.uid, source, test);

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
        timeLimitMinutes: (test.durationMinutes as number) ?? 180,
        // Empty for almost every test; only set when the admin turned on an
        // "attempt any N of M" group in Question Ingestion.
        attemptRules: ((test.attemptRules as AttemptRule[]) ?? []),
      },
      attemptNumber: priorAttemptCount + 1,
      questions: questionDocs.map((q) => {
        const type = (q.type as "mcq" | "integer") ?? "mcq";
        return {
          id: String(q._id),
          subject: q.subject as string,
          questionNo: q.questionNo as number,
          body: q.body as string,
          type,
          options: type === "mcq" ? (q.options as { A: string; B: string; C: string; D: string }) : undefined,
          // Deliberately omitted: correctOption, correctAnswer, solution.
        };
      }),
    };
  });

export const submitTestAttempt = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      testId: string;
      answers: Record<string, "A" | "B" | "C" | "D" | number | undefined>;
      timeTakenMinutes: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();

    const found = await findTest(data.testId);
    if (!found) throw new Error("Test not found");
    const { source, doc: test } = found;

    await verifyTestAccess(decoded.uid, source, test);

    const questionDocs = await db.collection("questions").find({ testId: data.testId }).toArray();

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const questionResults: {
      questionId: string;
      questionNo: number;
      subject: string;
      type: "mcq" | "integer";
      selectedOption: "A" | "B" | "C" | "D" | null;
      correctOption: "A" | "B" | "C" | "D" | null;
      selectedAnswer: number | null;
      correctAnswer: number | null;
      isCorrect: boolean;
      marksAwarded: number;
      // True when the student answered more than the "attempt any N" limit
      // allows and this answer fell outside the first N. Not graded.
      ignored?: boolean;
    }[] = [];

    const subjectTally = new Map<string, { correct: number; incorrect: number; unanswered: number; marks: number }>();
    const tallyFor = (subject: string) => {
      const t = subjectTally.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0, marks: 0 };
      subjectTally.set(subject, t);
      return t;
    };

    const isAnswered = (q: Record<string, any>) => {
      const given = data.answers[String(q._id)];
      return ((q.type as string) ?? "mcq") === "mcq"
        ? typeof given === "string" && ["A", "B", "C", "D"].includes(given)
        : typeof given === "number" && Number.isFinite(given);
    };

    // ── "Attempt any N of M" groups ──────────────────────────────────────
    // The client already stops a student from answering more than N, but
    // grading must not trust that. If extra answers arrive anyway, the first
    // N answered questions (lowest question number) are graded and the rest
    // are ignored — nobody gets extra credit for over-attempting.
    const rules = ((test.attemptRules as AttemptRule[]) ?? []);
    const ignoredIds = new Set<string>();
    const groupedIds = new Set<string>();
    let optionalSkippedMarks = 0; // questions that never count toward the total
    for (const rule of rules) {
      const members = questionDocs
        .filter((q) => findRuleForQuestion([rule], q.subject as string, q.questionNo as number))
        .sort((a, b) => (a.questionNo as number) - (b.questionNo as number));
      if (members.length === 0) continue;
      const n = Math.min(rule.attemptAny, members.length);
      const answered = members.filter(isAnswered);
      answered.slice(n).forEach((q) => ignoredIds.add(String(q._id)));
      members.forEach((q) => groupedIds.add(String(q._id)));
      optionalSkippedMarks += (members.length - n) * 4;
      // Unanswered slots are counted once per group (N − graded answers),
      // not once per untouched question, so a 5-of-10 group the student
      // skipped entirely reads as 5 skipped, not 10.
      const missing = n - Math.min(n, answered.length);
      unansweredCount += missing;
      tallyFor(rule.subject).unanswered += missing;
    }

    for (const q of questionDocs) {
      const questionId = String(q._id);
      const type = (q.type as "mcq" | "integer") ?? "mcq";
      const subject = q.subject as string;
      const given = data.answers[questionId];
      const ignored = ignoredIds.has(questionId);
      const answered = isAnswered(q);

      let marksAwarded = 0;
      let isCorrect = false;
      let selectedOption: "A" | "B" | "C" | "D" | null = null;
      let correctOption: "A" | "B" | "C" | "D" | null = null;
      let selectedAnswer: number | null = null;
      let correctAnswer: number | null = null;

      if (type === "mcq") {
        correctOption = q.correctOption as "A" | "B" | "C" | "D";
        selectedOption = answered ? (given as "A" | "B" | "C" | "D") : null;
        if (answered && !ignored) {
          if (selectedOption === correctOption) {
            marksAwarded = 4;
            isCorrect = true;
          } else {
            marksAwarded = -1;
          }
        }
      } else {
        // Integer/Numerical type — JEE convention: exact match, +4/0, no
        // negative marking. Epsilon guards against float rounding only
        // (e.g. 4.9999999 vs 5), it's not a lenient tolerance range.
        correctAnswer = q.correctAnswer as number;
        selectedAnswer = answered ? (given as number) : null;
        if (answered && !ignored && Math.abs((selectedAnswer as number) - correctAnswer) < 1e-6) {
          marksAwarded = 4;
          isCorrect = true;
        }
      }

      questionResults.push({
        questionId,
        questionNo: q.questionNo as number,
        subject,
        type,
        selectedOption,
        correctOption,
        selectedAnswer,
        correctAnswer,
        isCorrect,
        marksAwarded,
        ...(ignored ? { ignored: true } : {}),
      });

      // Ignored answers are not graded and never reach the tallies. Unanswered
      // questions inside an optional group were already accounted for above.
      if (ignored) continue;
      const tally = tallyFor(subject);
      if (!answered) {
        if (!groupedIds.has(questionId)) {
          unansweredCount++;
          tally.unanswered++;
        }
      } else if (isCorrect) {
        correctCount++;
        tally.correct++;
      } else {
        incorrectCount++;
        tally.incorrect++;
      }
      tally.marks += marksAwarded;
    }

    // Sum of per-question marks: MCQ wrong = −1, integer wrong = 0. (This used
    // to be correct×4 − incorrect×1, which also deducted 1 for every wrong
    // integer answer despite the no-negative-marking rule above.)
    const score = questionResults.reduce((sum, r) => sum + r.marksAwarded, 0);
    const totalMarks = questionDocs.length * 4 - optionalSkippedMarks;
    const attemptNumber = (await db.collection("testAttempts").countDocuments({ uid: decoded.uid, testId: data.testId })) + 1;

    const subjectBreakdown = Array.from(subjectTally.entries()).map(([subject, tally]) => ({
      subject,
      ...tally,
    }));

    const result = await db.collection("testAttempts").insertOne({
      uid: decoded.uid,
      testId: data.testId,
      testName: test.name as string,
      // Sold Tests have no bundle — bundleId stays null for them, matching
      // the optional bundleId on the Attempt type in the results page.
      bundleId: source === "testCore" ? (test.bundleId as string) : null,
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