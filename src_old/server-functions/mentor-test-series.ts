// A mentor's test series is NOT a separate product — it's tests appended
// into ONE auto-created Bundle per (mentor, batch) pair, named
// "{Mentor} {Batch} Test Series". That bundle is marked kind:
// "mentorBatchSeries" and is filtered out of every public/student-facing
// bundle listing (see catalog.ts / batch-hub.ts) — it exists purely as an
// internal container so admin can find and ingest into it, never as a
// browsable or purchasable product in its own right.
//
// Every test here is free-with-batch, full stop — there is no per-test
// "sell individually" option in Test Series (that's what Sell Tests is
// for, a separate product). A test only becomes visible/attemptable to
// students once it's fully ingested by Edurack AND its scheduled liveStart
// has arrived — computed fresh on every read (see
// listMentorBatchSeriesTestsForStudent in batch-hub.ts), never through a
// manual "publish" step. The mentor's only obligation is submitting the
// test — PDF included — at least 24 hours (ideally 24-48) before its
// liveStart, so Edurack has time to add the questions.
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

const MIN_LEAD_TIME_HOURS = 24;
const MIN_LEAD_TIME_MS = MIN_LEAD_TIME_HOURS * 60 * 60 * 1000;

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
    // Never sold as a whole, never publicly listed — placeholders only.
    // catalog.ts and batch-hub.ts's public read paths explicitly exclude
    // kind: "mentorBatchSeries" from every student-facing listing/detail
    // call, so this bundle is reachable only through admin tooling.
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
// No `price` field anymore — every Test Series test is free-with-batch.
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

function validateLeadTime(liveStart: string) {
  const leadMs = new Date(liveStart).getTime() - Date.now();
  if (leadMs < MIN_LEAD_TIME_MS) {
    throw new Error(
      `Set the live start at least ${MIN_LEAD_TIME_HOURS} hours from now — ideally 24–48 hours — so Edurack has time to add the questions before this test needs to go live.`,
    );
  }
}

export const appendMentorTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; test: AppendTestInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireTestSeriesAccess(mentorId);
    await requireOwnsBatch(mentorId, data.test.batchId);

    const { name, totalQuestions, durationMinutes, subjects, weightage, liveStart, liveEnd } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter a valid total question count.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    validateWeightage(totalQuestions, subjects, weightage);
    if (!liveStart || !liveEnd) throw new Error("Set both the live start and end window.");
    if (new Date(liveEnd) <= new Date(liveStart)) throw new Error("Live end must be after live start.");
    validateLeadTime(liveStart);
    if (!data.test.referencePdfUrl) throw new Error("Upload the question paper PDF for Edurack to ingest from.");

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
      price: null, // Test Series tests are always free with the batch
      publishedToBatch: true, // not hidden — visibility is otherwise fully automatic (see batch-hub.ts)
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

    const { name, totalQuestions, durationMinutes, subjects, weightage, liveStart, liveEnd } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter a valid total question count.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    validateWeightage(totalQuestions, subjects, weightage);
    if (new Date(liveEnd) <= new Date(liveStart)) throw new Error("Live end must be after live start.");
    validateLeadTime(liveStart);

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
          price: null,
        },
      },
    );
    return { ok: true };
  });

// ─── Mentor-controlled kill switch — hide a test from students even after
// it would otherwise be ready. This is NOT a "publish" step (there is no
// publish step anymore); going live is fully automatic based on ingestion
// completeness + liveStart, computed in batch-hub.ts. This only ever moves
// a test from "visible" to "hidden" or back — it can be toggled anytime,
// no ingestion-completeness requirement.
export const setMentorTestVisibility = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; hidden: boolean }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");

    await db.collection("testCores").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { publishedToBatch: !data.hidden } },
    );
    return { ok: true };
  });

// ─── List every test appended for one batch, with live ingestion progress
// and a computed isReady flag — mentor sees the exact same "coming soon /
// live" status students do, without needing to take any action to flip it. ─
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

    const now = Date.now();

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
      tests: tests.map((t, i) => {
        const ingestionComplete = progress[i].totalAdded >= (t.totalQuestions as number);
        const isReady = ingestionComplete && now >= new Date(t.liveStart as string).getTime();
        return {
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
          hidden: t.publishedToBatch === false,
          isReady,
          progress: progress[i],
        };
      }),
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