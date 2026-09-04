// A mentor's test series is NOT a separate product — it's tests appended
// into ONE auto-created Bundle per (mentor, batch) pair, named
// "{Mentor} {Batch} Test Series". Admin ingests questions into it via the
// normal Test Core / Question Ingestion flow. Students access it two ways:
// free tests unlock for anyone who purchased the batch; paid tests can be
// bought standalone by anyone, batch purchase not required — mirrored in
// the exam-engine access check (not shown here — see note at bottom).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SubjectWeightage,
  MentorTestResultsOverview,
  MentorTestSubjectComparison,
  MentorTestStudentResult,
  MentorTestIngestionProgress,
} from "@/lib/admin-types";

function getSessionSecret(): string {
  const secret = process.env.MENTOR_SESSION_SECRET;
  if (!secret) throw new Error("Server misconfigured: MENTOR_SESSION_SECRET is not set");
  return secret;
}

function verifyMentorToken(token: string): { mentorId: string } | null {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [mentorId, expiresAtStr, signature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(`${mentorId}.${expiresAtStr}`).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  if (Date.now() > Number(expiresAtStr)) return null;
  return { mentorId };
}

async function requireMentor(token: string): Promise<string> {
  const verified = verifyMentorToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.mentorId;
}

async function requireOwnsBatch(mentorId: string, batchId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(batchId) });
  if (!batch) throw new Error("Batch not found.");
  if (batch.assignedMentorId !== mentorId) throw new Error("You are not the assigned mentor for this batch.");
  return batch;
}

async function requireTestSeriesAccess(mentorId: string) {
  const db = await getDb();
  const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId });
  const request = await db.collection("testSeriesAccessRequests").findOne({ mentorId });
  const hasAccess = Boolean(onboarding?.wantsToSellTestSeries) || Boolean(request?.adminGranted);
  if (!hasAccess) throw new Error("You don't have test series access yet. Request it from your Earnings tab.");
}

// ─── Get-or-create the one bundle backing this mentor's batch series ──────
async function getOrCreateBatchSeriesBundle(mentorId: string, batchId: string): Promise<string> {
  const db = await getDb();
  const existing = await db.collection("bundles").findOne({ mentorId, batchId, kind: "mentorBatchSeries" });
  if (existing) return String(existing._id);

  const { ObjectId } = await import("mongodb");
  const [mentor, batch] = await Promise.all([
    db.collection("mentors").findOne({ _id: new ObjectId(mentorId) }),
    db.collection("mentorshipBatches").findOne({ _id: new ObjectId(batchId) }),
  ]);
  if (!mentor || !batch) throw new Error("Could not resolve mentor or batch.");

  const now = new Date();
  const result = await db.collection("bundles").insertOne({
    kind: "mentorBatchSeries",
    title: `${mentor.name as string} ${batch.name as string} Test Series`,
    track: batch.track,
    exam: batch.exam,
    domainSubject: null,
    features: [],
    // Not sold as a whole — placeholders only, admin UI hides these for this kind.
    sellingPrice: 0,
    crossedPrice: 0,
    uploadWindowStart: now.toISOString().slice(0, 10),
    uploadWindowEnd: now.toISOString().slice(0, 10),
    expiryDate: now.toISOString().slice(0, 10),
    thumbnailUrl: null,
    syllabusPdfUrls: [],
    plannerUrls: [],
    mentorId,
    batchId,
    createdAt: now,
    updatedAt: now,
  });
  return String(result.insertedId);
}

// ─── Append a test to this mentor's batch series ───────────────────────────
type AppendTestInput = {
  batchId: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightage[];
  liveStart: string;
  liveEnd: string;
  instructions: string;
  referencePdfUrl: string | null;
  price: number | null; // null/0 = free
};

function validateWeightage(totalQuestions: number, subjects: string[], weightage: SubjectWeightage[]) {
  if (subjects.length === 0) throw new Error("Add at least one subject.");
  const sum = weightage.reduce((s, w) => s + w.questionCount, 0);
  if (sum !== totalQuestions) {
    throw new Error(`Subject counts total ${sum}, but Total Questions is ${totalQuestions}. They must match.`);
  }
  if (weightage.some((w) => w.questionCount <= 0)) {
    throw new Error("Every subject needs a question count greater than 0.");
  }
}

export const appendMentorTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; test: AppendTestInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireTestSeriesAccess(mentorId);
    await requireOwnsBatch(mentorId, data.test.batchId);

    const { name, totalQuestions, durationMinutes, subjects, weightage, liveStart, liveEnd, price } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter a valid total question count.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    validateWeightage(totalQuestions, subjects, weightage);
    if (!liveStart || !liveEnd) throw new Error("Set both the live start and end window.");
    if (new Date(liveEnd) <= new Date(liveStart)) throw new Error("Live end must be after live start.");
    if (!data.test.referencePdfUrl) throw new Error("Upload the question paper PDF for Edurack to ingest from.");
    if (price != null && price < 0) throw new Error("Price can't be negative.");

    const bundleId = await getOrCreateBatchSeriesBundle(mentorId, data.test.batchId);

    const db = await getDb();
    const result = await db.collection("testCores").insertOne({
      bundleId,
      name: name.trim(),
      totalQuestions,
      durationMinutes,
      subjects,
      weightage,
      liveStart,
      liveEnd,
      instructions: data.test.instructions.trim() || "Standard exam rules apply.",
      referencePdfUrl: data.test.referencePdfUrl,
      mentorId,
      price: price && price > 0 ? price : null,
      publishedToBatch: false, // never visible to students until mentor explicitly publishes
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId), bundleId };
  });

export const updateMentorTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; test: Omit<AppendTestInput, "batchId"> }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const existing = await db.collection("testCores").findOne({ _id: new ObjectId(data.id) });
    if (!existing || existing.mentorId !== mentorId) throw new Error("Test not found.");

    const { name, totalQuestions, durationMinutes, subjects, weightage, liveStart, liveEnd, price } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter a valid total question count.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    validateWeightage(totalQuestions, subjects, weightage);
    if (new Date(liveEnd) <= new Date(liveStart)) throw new Error("Live end must be after live start.");
    if (price != null && price < 0) throw new Error("Price can't be negative.");

    await db.collection("testCores").updateOne(
      { _id: new ObjectId(data.id) },
      {
        $set: {
          name: name.trim(),
          totalQuestions,
          durationMinutes,
          subjects,
          weightage,
          liveStart,
          liveEnd,
          instructions: data.test.instructions.trim(),
          referencePdfUrl: data.test.referencePdfUrl,
          price: price && price > 0 ? price : null,
        },
      },
    );
    return { ok: true };
  });

// ─── The publish gate — nothing is visible to students until this fires ───
export const setTestPublishedToBatch = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; published: boolean }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");

    if (data.published) {
      const added = await db.collection("questions").countDocuments({ testId: data.id });
      if (added < (test.totalQuestions as number)) {
        throw new Error(
          `Edurack has only added ${added} of ${test.totalQuestions} questions so far — you can publish once ingestion is complete.`,
        );
      }
    }

    await db.collection("testCores").updateOne({ _id: new ObjectId(data.id) }, { $set: { publishedToBatch: data.published } });
    return { ok: true };
  });

// ─── List every test appended for one batch, with live ingestion progress ─
export const listMyBatchSeriesTests = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const bundle = await db.collection("bundles").findOne({ mentorId, batchId: data.batchId, kind: "mentorBatchSeries" });
    if (!bundle) return { tests: [] };

    const tests = await db
      .collection("testCores")
      .find({ bundleId: String(bundle._id), mentorId })
      .sort({ createdAt: -1 })
      .toArray();
    if (tests.length === 0) return { tests: [] };

    const testIds = tests.map((t) => String(t._id));
    const questionRows = await db
      .collection("questions")
      .find({ testId: { $in: testIds } }, { projection: { testId: 1, subject: 1 } })
      .toArray();

    const progress: MentorTestIngestionProgress[] = tests.map((t) => {
      const testId = String(t._id);
      const weightage = (t.weightage as SubjectWeightage[]) ?? [];
      const mine = questionRows.filter((q) => q.testId === testId);
      const subjects = weightage.map((w) => ({
        subject: w.subject,
        required: w.questionCount,
        added: mine.filter((q) => q.subject === w.subject).length,
      }));
      return {
        testId,
        testName: t.name as string,
        totalQuestions: t.totalQuestions as number,
        subjects,
        totalAdded: mine.length,
        publishedToBatch: Boolean(t.publishedToBatch),
      };
    });

    return {
      tests: tests.map((t, i) => ({
        id: String(t._id),
        name: t.name as string,
        totalQuestions: t.totalQuestions as number,
        durationMinutes: t.durationMinutes as number,
        subjects: (t.subjects as string[]) ?? [],
        weightage: (t.weightage as SubjectWeightage[]) ?? [],
        liveStart: t.liveStart as string,
        liveEnd: t.liveEnd as string,
        instructions: (t.instructions as string) ?? "",
        referencePdfUrl: (t.referencePdfUrl as string | null) ?? null,
        price: (t.price as number | null) ?? null,
        publishedToBatch: Boolean(t.publishedToBatch),
        progress: progress[i],
      })),
    };
  });

// ─── Results — unchanged from the real exam engine's testAttempts ─────────
export const getMentorTestResults = createServerFn({ method: "POST" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.testId) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");

    const attempts = await db.collection("testAttempts").find({ testId: data.testId }).toArray();
    if (attempts.length === 0) {
      const empty: MentorTestResultsOverview = {
        testId: data.testId,
        testName: test.name as string,
        attemptCount: 0,
        subjectComparison: [],
        studentResults: [],
      };
      return { overview: empty };
    }

    const studentUids = [...new Set(attempts.map((a) => a.uid as string))];
    const profiles = await db
      .collection("profiles")
      .find({ uid: { $in: studentUids } }, { projection: { uid: 1, fullName: 1 } })
      .toArray();
    const nameByUid = new Map(profiles.map((p) => [p.uid as string, (p.fullName as string) || "Student"]));

    const subjectTotals = new Map<string, { correct: number; incorrect: number; unanswered: number; percentSum: number; count: number }>();
    const studentResults: MentorTestStudentResult[] = attempts.map((a) => {
      const breakdown = (a.subjectBreakdown ?? []) as { subject: string; correct: number; incorrect: number; unanswered: number; marks: number }[];
      for (const s of breakdown) {
        const attempted = s.correct + s.incorrect;
        const percent = attempted > 0 ? (s.correct / attempted) * 100 : 0;
        const t = subjectTotals.get(s.subject) ?? { correct: 0, incorrect: 0, unanswered: 0, percentSum: 0, count: 0 };
        t.correct += s.correct;
        t.incorrect += s.incorrect;
        t.unanswered += s.unanswered;
        t.percentSum += percent;
        t.count += 1;
        subjectTotals.set(s.subject, t);
      }
      return {
        studentUid: a.uid as string,
        studentName: nameByUid.get(a.uid as string) ?? "Student",
        score: a.score as number,
        totalMarks: a.totalMarks as number,
        subjectBreakdown: breakdown,
        submittedAt: a.submittedAt instanceof Date ? a.submittedAt.toISOString() : null,
      };
    });

    const subjectComparison: MentorTestSubjectComparison[] = Array.from(subjectTotals.entries()).map(([subject, t]) => ({
      subject,
      correct: t.correct,
      incorrect: t.incorrect,
      unanswered: t.unanswered,
      averagePercent: t.count > 0 ? Math.round(t.percentSum / t.count) : 0,
    }));

    const overview: MentorTestResultsOverview = {
      testId: data.testId,
      testName: test.name as string,
      attemptCount: attempts.length,
      subjectComparison,
      studentResults: studentResults.sort((a, b) => b.score - a.score),
    };
    return { overview };
  });