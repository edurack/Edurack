// Mentor-owned Test Series — a separate product line from a mentor's
// mentorship batch. Gated by getTestSeriesAccessStatus in
// mentor-earnings.ts; nothing here re-checks that gate, since a mentor
// without access simply never gets shown the UI that calls these, and
// each write is scoped to mentorId regardless.
//
// NOTE: this file covers series/test authoring + the mentor's own results
// view. It deliberately does NOT include the student-facing "take this
// test" flow — that's the same shape of work as getTestForTaking /
// submitTestAttempt in test-engine.ts, just re-pointed at
// mentorTests/mentorQuestions instead of testCores/questions, and doesn't
// exist as a route yet. Flagging so it isn't mistaken for already wired
// up — listMentorTestResults below will simply return zero attempts until
// that student-facing submission path is built and starts writing to
// mentorTestAttempts.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  TEST_SERIES_PLATFORM_COMMISSION_PERCENT,
  DEFAULT_TEST_SERIES_MARKETING_PERCENT,
  type MentorTestSeries,
  type MentorTestSeriesInput,
  type MentorTest,
  type MentorTestInput,
  type SubjectWeightage,
  type MentorTestResultsOverview,
  type MentorTestSubjectComparison,
  type MentorTestStudentResult,
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

const MAX_MARKETING_PERCENT = 30;

// ─── Test Series (the sellable product) ─────────────────────────────────────
export const createMentorTestSeries = createServerFn({ method: "POST" })
  .validator((data: { token: string; series: MentorTestSeriesInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { name, price, marketingPercent } = data.series;

    if (!name.trim()) throw new Error("Give this test series a name.");
    if (!price || price <= 0) throw new Error("Enter a valid price.");
    if (marketingPercent < DEFAULT_TEST_SERIES_MARKETING_PERCENT || marketingPercent > MAX_MARKETING_PERCENT) {
      throw new Error(`Marketing percentage must be between ${DEFAULT_TEST_SERIES_MARKETING_PERCENT}% and ${MAX_MARKETING_PERCENT}%.`);
    }

    const db = await getDb();
    const result = await db.collection("mentorTestSeries").insertOne({
      mentorId,
      name: name.trim(),
      price,
      platformCommissionPercent: TEST_SERIES_PLATFORM_COMMISSION_PERCENT, // fixed, never mentor-set
      marketingPercent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const updateMentorTestSeries = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; series: MentorTestSeriesInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const existing = await db.collection("mentorTestSeries").findOne({ _id: new ObjectId(data.id) });
    if (!existing || existing.mentorId !== mentorId) throw new Error("Test series not found.");

    const { name, price, marketingPercent } = data.series;
    if (!name.trim()) throw new Error("Give this test series a name.");
    if (!price || price <= 0) throw new Error("Enter a valid price.");
    if (marketingPercent < DEFAULT_TEST_SERIES_MARKETING_PERCENT || marketingPercent > MAX_MARKETING_PERCENT) {
      throw new Error(`Marketing percentage must be between ${DEFAULT_TEST_SERIES_MARKETING_PERCENT}% and ${MAX_MARKETING_PERCENT}%.`);
    }

    await db.collection("mentorTestSeries").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { name: name.trim(), price, marketingPercent, updatedAt: new Date() } },
    );
    return { ok: true };
  });

export const listMyTestSeries = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db.collection("mentorTestSeries").find({ mentorId }).sort({ createdAt: -1 }).toArray();

    const series: MentorTestSeries[] = rows.map((r) => ({
      id: String(r._id),
      mentorId: r.mentorId as string,
      name: r.name as string,
      price: r.price as number,
      platformCommissionPercent: r.platformCommissionPercent as number,
      marketingPercent: r.marketingPercent as number,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
    }));
    return { series };
  });

async function requireOwnsSeries(mentorId: string, seriesId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const series = await db.collection("mentorTestSeries").findOne({ _id: new ObjectId(seriesId) });
  if (!series || series.mentorId !== mentorId) throw new Error("Test series not found.");
  return series;
}

// ─── Individual tests within a series ───────────────────────────────────────
function validateWeightage(totalQuestions: number, subjects: string[], weightage: SubjectWeightage[]) {
  if (subjects.length === 0) throw new Error("Add at least one subject.");
  const sum = weightage.reduce((s, w) => s + w.questionCount, 0);
  if (sum !== totalQuestions) {
    throw new Error(`Subject-wise question counts total ${sum}, but Total Questions is ${totalQuestions}. They must match.`);
  }
  if (weightage.some((w) => w.questionCount <= 0)) {
    throw new Error("Every subject needs a question count greater than 0.");
  }
}

export const createMentorTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; test: MentorTestInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsSeries(mentorId, data.test.testSeriesId);

    const { name, durationMinutes, totalQuestions, subjects, weightage, pdfUrl } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter the total number of questions.");
    validateWeightage(totalQuestions, subjects, weightage);

    const db = await getDb();
    const result = await db.collection("mentorTests").insertOne({
      testSeriesId: data.test.testSeriesId,
      mentorId,
      name: name.trim(),
      durationMinutes,
      totalQuestions,
      subjects,
      weightage,
      pdfUrl: pdfUrl?.trim() || null,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const updateMentorTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; test: MentorTestInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const existing = await db.collection("mentorTests").findOne({ _id: new ObjectId(data.id) });
    if (!existing || existing.mentorId !== mentorId) throw new Error("Test not found.");

    const { name, durationMinutes, totalQuestions, subjects, weightage, pdfUrl } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter the total number of questions.");
    validateWeightage(totalQuestions, subjects, weightage);

    await db.collection("mentorTests").updateOne(
      { _id: new ObjectId(data.id) },
      {
        $set: {
          name: name.trim(),
          durationMinutes,
          totalQuestions,
          subjects,
          weightage,
          pdfUrl: pdfUrl?.trim() || null,
        },
      },
    );
    return { ok: true };
  });

export const listMentorTestsForSeries = createServerFn({ method: "POST" })
  .validator((data: { token: string; testSeriesId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsSeries(mentorId, data.testSeriesId);

    const db = await getDb();
    const rows = await db
      .collection("mentorTests")
      .find({ testSeriesId: data.testSeriesId })
      .sort({ createdAt: -1 })
      .toArray();

    const tests: MentorTest[] = rows.map((r) => ({
      id: String(r._id),
      testSeriesId: r.testSeriesId as string,
      mentorId: r.mentorId as string,
      name: r.name as string,
      durationMinutes: r.durationMinutes as number,
      totalQuestions: r.totalQuestions as number,
      subjects: r.subjects as string[],
      weightage: r.weightage as SubjectWeightage[],
      pdfUrl: (r.pdfUrl as string | null) ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));
    return { tests };
  });

// ─── Results: subject comparison + per-student breakdown ───────────────────
// Reads from mentorTestAttempts — same shape family as testAttempts in
// test-engine.ts (subjectBreakdown per attempt) — populated once the
// student-facing submission endpoint mentioned at the top of this file is
// built. Until then this returns an honest zero-attempts result rather
// than throwing, so the UI can render its empty state.
export const getMentorTestResults = createServerFn({ method: "POST" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("mentorTests").findOne({ _id: new ObjectId(data.testId) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");

    const attempts = await db.collection("mentorTestAttempts").find({ testId: data.testId }).toArray();

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
      const breakdown = (a.subjectBreakdown ?? []) as {
        subject: string;
        correct: number;
        incorrect: number;
        unanswered: number;
        marks: number;
      }[];

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