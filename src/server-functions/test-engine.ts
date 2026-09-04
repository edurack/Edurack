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
      },
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
      selectedOption: "A" | "B" | "C" | "D" | null;
      correctOption: "A" | "B" | "C" | "D";
      isCorrect: boolean;
      marksAwarded: number;
    }[] = [];

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