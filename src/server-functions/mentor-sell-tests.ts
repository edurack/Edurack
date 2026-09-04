// Mentor-initiated "Sell Tests" flow: request access, create a standalone
// test, pay the locked ₹1/question ingestion fee to Edurack via Razorpay
// (the MENTOR is the payer here — the reverse direction from every other
// Razorpay flow in this app, where students pay for content), wait for
// admin to ingest the questions and send them over for review, approve the
// content, then wait for admin to set/approve the final price. Once live,
// it's sold through the EXISTING student purchase flow (payments.ts,
// itemType "mentorTest") exactly like a standalone Test Series test.
//
// Session verification duplicated from mentor-test-series.ts /
// mentor-earnings.ts rather than imported — matches this codebase's
// existing convention (see those files' own comments on why).
import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { INGESTION_FEE_PER_QUESTION } from "@/lib/admin-types";
import type { SubjectWeightage, SoldTestInput, SellTestsAccessStatus, SoldTestIngestionProgress } from "@/lib/admin-types";

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
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const mentor = await db
    .collection("mentors")
    .findOne({ _id: new ObjectId(verified.mentorId) }, { projection: { status: 1 } });
  if (!mentor || mentor.status === "terminated") {
    throw new Error("This account has been deactivated. Please contact Edurack support.");
  }
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

async function requireSellTestsAccess(mentorId: string) {
  const db = await getDb();
  const request = await db.collection("sellTestsAccessRequests").findOne({ mentorId });
  if (!request?.adminGranted) throw new Error("You don't have Sell Tests access yet. Request it first.");
}

// ─── Access request/status — same pattern as Test Series ──────────────────
export const getSellTestsAccessStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const request = await db.collection("sellTestsAccessRequests").findOne({ mentorId });

    let status: SellTestsAccessStatus;
    if (request?.adminGranted) {
      status = {
        hasAccess: true,
        source: "admin_granted",
        requested: true,
        requestedAt: request.requestedAt instanceof Date ? request.requestedAt.toISOString() : null,
      };
    } else {
      status = {
        hasAccess: false,
        source: "none",
        requested: Boolean(request),
        requestedAt: request?.requestedAt instanceof Date ? request.requestedAt.toISOString() : null,
      };
    }
    return { status };
  });

export const requestSellTestsAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const existing = await db.collection("sellTestsAccessRequests").findOne({ mentorId });
    if (existing) return { ok: true, alreadyRequested: true };
    await db.collection("sellTestsAccessRequests").insertOne({ mentorId, adminGranted: false, requestedAt: new Date() });
    return { ok: true, alreadyRequested: false };
  });

// ─── Create / edit a draft (before submission locks it) ───────────────────
export const upsertSoldTest = createServerFn({ method: "POST" })
  .validator((data: { token: string; id?: string; test: SoldTestInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireSellTestsAccess(mentorId);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const { name, totalQuestions, durationMinutes, subjects, weightage, referencePdfUrl, proposedPrice } = data.test;
    if (!name.trim()) throw new Error("Give this test a name.");
    if (!totalQuestions || totalQuestions <= 0) throw new Error("Enter a valid total question count.");
    if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid test duration.");
    validateWeightage(totalQuestions, subjects, weightage);
    if (!referencePdfUrl) throw new Error("Upload the question paper PDF for Edurack to ingest from.");
    if (!proposedPrice || proposedPrice <= 0) throw new Error("Enter the price you'd like to sell this test for.");

    const ingestionFeeAmount = totalQuestions * INGESTION_FEE_PER_QUESTION;

    if (data.id) {
      const existing = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
      if (!existing || existing.mentorId !== mentorId) throw new Error("Test not found.");
      if (existing.status !== "draft") {
        throw new Error("This test has already been submitted and can no longer be edited here.");
      }
      await db.collection("soldTests").updateOne(
        { _id: new ObjectId(data.id) },
        {
          $set: {
            name: name.trim(),
            totalQuestions,
            durationMinutes,
            subjects,
            weightage,
            instructions: data.test.instructions.trim(),
            referencePdfUrl,
            proposedPrice,
            ingestionFeeAmount,
            updatedAt: new Date(),
          },
        },
      );
      return { ok: true, id: data.id };
    }

    const now = new Date();
    const result = await db.collection("soldTests").insertOne({
      mentorId,
      name: name.trim(),
      totalQuestions,
      durationMinutes,
      subjects,
      weightage,
      instructions: data.test.instructions.trim(),
      referencePdfUrl,
      ingestionFeeAmount,
      ingestionFeePaid: false,
      ingestionFeeRazorpayPaymentId: null,
      proposedPrice,
      approvedPrice: null,
      status: "draft",
      sentToMentorAt: null,
      contentApprovedByMentor: false,
      mentorReviewedAt: null,
      attachedBatchIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listMySoldTests = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db.collection("soldTests").find({ mentorId }).sort({ createdAt: -1 }).toArray();

    const testIds = rows.map((t) => String(t._id));
    const questionRows = testIds.length
      ? await db.collection("questions").find({ testId: { $in: testIds } }, { projection: { testId: 1, subject: 1 } }).toArray()
      : [];

    const progress: SoldTestIngestionProgress[] = rows.map((t) => {
      const testId = String(t._id);
      const weightage = (t.weightage as SubjectWeightage[]) ?? [];
      const mine = questionRows.filter((q) => q.testId === testId);
      const subjects = weightage.map((w) => ({
        subject: w.subject,
        required: w.questionCount,
        added: mine.filter((q) => q.subject === w.subject).length,
      }));
      return { testId, testName: t.name as string, totalQuestions: t.totalQuestions as number, subjects, totalAdded: mine.length };
    });

    return {
      tests: rows.map((t, i) => ({
        id: String(t._id),
        name: t.name as string,
        totalQuestions: t.totalQuestions as number,
        durationMinutes: t.durationMinutes as number,
        subjects: (t.subjects as string[]) ?? [],
        weightage: (t.weightage as SubjectWeightage[]) ?? [],
        instructions: (t.instructions as string) ?? "",
        referencePdfUrl: (t.referencePdfUrl as string | null) ?? null,
        ingestionFeeAmount: t.ingestionFeeAmount as number,
        ingestionFeePaid: Boolean(t.ingestionFeePaid),
        proposedPrice: t.proposedPrice as number,
        approvedPrice: (t.approvedPrice as number | null) ?? null,
        status: t.status as string,
        sentToMentorAt: t.sentToMentorAt instanceof Date ? t.sentToMentorAt.toISOString() : null,
        contentApprovedByMentor: Boolean(t.contentApprovedByMentor),
        mentorReviewedAt: t.mentorReviewedAt instanceof Date ? t.mentorReviewedAt.toISOString() : null,
        attachedBatchIds: (t.attachedBatchIds as string[]) ?? [],
        progress: progress[i],
      })),
    };
  });

// Locks editing — a mentor can't change subjects/questions after paying
// the fee for a different count.
export const submitSoldTestForPayment = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    if (test.status !== "draft") throw new Error("This test has already been submitted.");
    await db.collection("soldTests").updateOne({ _id: new ObjectId(data.id) }, { $set: { status: "awaiting_payment" } });
    return { ok: true };
  });

// ─── Mentor pays the ingestion fee via Razorpay ────────────────────────────
function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Server misconfigured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  return { keyId, keySecret };
}

export const createIngestionFeeOrder = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    if (test.status !== "awaiting_payment") throw new Error("This test isn't awaiting payment.");
    if (test.ingestionFeePaid) throw new Error("The ingestion fee has already been paid for this test.");

    const { keyId, keySecret } = getRazorpayCredentials();
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const amountPaise = Math.round((test.ingestionFeeAmount as number) * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `ing_${data.id.slice(-12)}_${Date.now()}`,
      notes: { mentorId, soldTestId: data.id, kind: "ingestion_fee" },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      testName: test.name as string,
      feeAmount: test.ingestionFeeAmount as number,
    };
  });

// After successful payment, the test moves to "awaiting_ingestion" — this
// is where it becomes visible in the admin's Sell Tests → Ingestion queue,
// NOT straight to price approval (that was the bug: there was no step in
// between for admin to actually add the questions).
export const verifyIngestionFeePayment = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; id: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { keySecret } = getRazorpayCredentials();

    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");
    if (expectedSignature !== data.razorpaySignature) {
      throw new Error("Payment verification failed — signature mismatch.");
    }

    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");

    await db.collection("soldTests").updateOne(
      { _id: new ObjectId(data.id) },
      {
        $set: {
          ingestionFeePaid: true,
          ingestionFeeRazorpayPaymentId: data.razorpayPaymentId,
          status: "awaiting_ingestion",
          updatedAt: new Date(),
        },
      },
    );
    return { ok: true };
  });

// ─── Mentor content review — after admin finishes ingestion ───────────────
export const listSoldTestQuestionsForMentorReview = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    if (!["awaiting_mentor_review", "awaiting_price_approval", "live"].includes(test.status as string)) {
      throw new Error("This test isn't ready for review yet.");
    }

    const rows = await db.collection("questions").find({ testId: data.id }).sort({ subject: 1, questionNo: 1 }).toArray();
    return {
      questions: rows.map((r) => ({
        id: String(r._id),
        subject: r.subject as string,
        questionNo: r.questionNo as number,
        body: r.body as string,
        options: r.options as { A: string; B: string; C: string; D: string },
        correctOption: r.correctOption as "A" | "B" | "C" | "D",
        solution: r.solution as string,
        difficulty: r.difficulty as "Easy" | "Medium" | "Hard",
      })),
    };
  });

// Mentor's sign-off on the content — moves the test to
// "awaiting_price_approval", the ONLY status admin's approveSoldTestPrice
// will now accept.
export const approveSoldTestContent = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    if (test.status !== "awaiting_mentor_review") throw new Error("This test isn't awaiting your review.");

    const added = await db.collection("questions").countDocuments({ testId: data.id });
    if (added < (test.totalQuestions as number)) {
      throw new Error("Edurack hasn't finished adding all the questions yet.");
    }

    await db.collection("soldTests").updateOne(
      { _id: new ObjectId(data.id) },
      {
        $set: {
          status: "awaiting_price_approval",
          contentApprovedByMentor: true,
          mentorReviewedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return { ok: true };
  });

// ─── Attach a live test to one of the mentor's own batches ────────────────
export const attachSoldTestToBatch = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    if (!test.ingestionFeePaid) throw new Error("Pay the ingestion fee before appending this test to a batch.");
    if (test.status !== "live") throw new Error("This test isn't live yet — it needs admin's approval first.");

    const attached = (test.attachedBatchIds as string[]) ?? [];
    if (attached.includes(data.batchId)) return { ok: true, alreadyAttached: true };

    await db.collection("soldTests").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { attachedBatchIds: [...attached, data.batchId], updatedAt: new Date() } },
    );
    return { ok: true, alreadyAttached: false };
  });

export const detachSoldTestFromBatch = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test || test.mentorId !== mentorId) throw new Error("Test not found.");
    const attached = ((test.attachedBatchIds as string[]) ?? []).filter((b) => b !== data.batchId);
    await db.collection("soldTests").updateOne({ _id: new ObjectId(data.id) }, { $set: { attachedBatchIds: attached, updatedAt: new Date() } });
    return { ok: true };
  });

// For the attach-to-batch picker UI — list the mentor's own batches.
export const listMyBatchesForAttach = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db.collection("mentorshipBatches").find({ assignedMentorId: mentorId }).toArray();
    return { batches: rows.map((b) => ({ id: String(b._id), name: b.name as string })) };
  });