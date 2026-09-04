// Real Razorpay integration: order creation (price looked up server-side,
// never trusted from the client), signature verification, and the actual
// `purchases` collection write that unlocks paywalled content elsewhere.
import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "node:crypto";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { purchaseConfirmationEmailHtml } from "@/lib/email-templates";
import { PLATFORM_COMMISSION_PERCENT, QUESTION_INGESTION_FEE_PERCENT, MENTOR_TEST_STANDALONE_COMMISSION_PERCENT } from "@/lib/admin-types";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Server misconfigured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  }
  return { keyId, keySecret };
}

// "mentorTest" — a single paid test appended to a mentor's batch series,
// bought standalone (no batch purchase required). See testCores.price /
// testCores.publishedToBatch in admin-types.ts.
type ItemType = "bundle" | "mentorship" | "mentorTest";

async function lookupItemPriceAndTitle(itemType: ItemType, itemId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();

 if (itemType === "mentorTest") {
  const test = await db.collection("testCores").findOne({ _id: new ObjectId(itemId) });
  if (test) {
    if (!test.price || (test.price as number) <= 0) throw new Error("This test isn't sold individually.");
    if (!test.publishedToBatch) throw new Error("This test isn't available for purchase yet.");
    return { sellingPrice: test.price as number, title: test.name as string };
  }

  // Standalone Sell Tests — extra safety check beyond the old testCores
  // flow: status "live" only means admin approved a price, it says
  // nothing about whether Edurack has actually finished ingesting every
  // question yet. Count the real rows rather than trusting the flag.
  const soldTest = await db.collection("soldTests").findOne({ _id: new ObjectId(itemId) });
  if (!soldTest) throw new Error("Test not found");
  if (soldTest.status !== "live" || !soldTest.approvedPrice) {
    throw new Error("This test isn't available for purchase yet.");
  }
  const addedCount = await db.collection("questions").countDocuments({ testId: itemId });
  if (addedCount < (soldTest.totalQuestions as number)) {
    throw new Error(
      `Edurack has only added ${addedCount} of ${soldTest.totalQuestions} questions so far — this test isn't ready for purchase yet.`,
    );
  }
  return { sellingPrice: soldTest.approvedPrice as number, title: soldTest.name as string };
}

  const collection = itemType === "bundle" ? "bundles" : "mentorshipBatches";
  const doc = await db.collection(collection).findOne({ _id: new ObjectId(itemId) });
  if (!doc) throw new Error("Item not found");

  return {
    sellingPrice: doc.sellingPrice as number,
    title: (itemType === "bundle" ? doc.title : doc.name) as string,
  };
}

// Whether the mentor assigned to a mentorship batch currently has
// test-series access — mirrors requireTestSeriesAccess in
// mentor-test-series.ts, duplicated here (no shared mentor-session context
// in this file) rather than imported, matching this codebase's existing
// convention for cross-file session/access checks.
async function mentorHasTestSeriesAccess(mentorId: string): Promise<boolean> {
  const db = await getDb();
  const [onboarding, request] = await Promise.all([
    db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId }),
    db.collection("testSeriesAccessRequests").findOne({ mentorId }),
  ]);
  return Boolean(onboarding?.wantsToSellTestSeries) || Boolean(request?.adminGranted);
}

// The commission percent taken from a purchase — snapshotted into the
// Razorpay order's notes at creation time so it can never drift if the
// mentor's access status changes between order creation and payment
// verification (or afterward). Bundles are unaffected (100% platform,
// unchanged) — only mentorship batches and standalone mentorTest sales
// carry a mentor split.
async function resolveCommissionPercent(itemType: ItemType, itemId: string): Promise<number | null> {
  if (itemType === "mentorTest") return MENTOR_TEST_STANDALONE_COMMISSION_PERCENT;
  if (itemType === "mentorship") {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(itemId) });
    const mentorId = (batch?.assignedMentorId as string | null) ?? null;
    if (!mentorId) return PLATFORM_COMMISSION_PERCENT;
    const hasAccess = await mentorHasTestSeriesAccess(mentorId);
    return hasAccess ? PLATFORM_COMMISSION_PERCENT + QUESTION_INGESTION_FEE_PERCENT : PLATFORM_COMMISSION_PERCENT;
  }
  return null; // bundle — ledger already treats this as 100% platform
}

// ─── Promoter coupon integration ────────────────────────────────────────────
// Coupons only ever apply to mentorship batches — promoters never promote
// bundles or standalone tests (see promoter-portal.ts: listPromotableBatches
// only reads mentorshipBatches).
type ResolvedCoupon = {
  promoterId: string;
  couponCode: string;
  studentDiscountPercent: number;
  promoterEarningPercent: number;
};

async function resolveCoupon(itemType: ItemType, itemId: string, couponCode: string): Promise<ResolvedCoupon> {
  if (itemType !== "mentorship") {
    throw new Error("Coupons can only be applied to mentorship batches.");
  }
  const db = await getDb();
  const request = await db.collection("promoterCouponRequests").findOne({
    batchId: itemId,
    couponCode,
    status: "approved",
  });
  if (!request) throw new Error("That coupon code isn't valid for this batch.");

  return {
    promoterId: request.promoterId as string,
    couponCode,
    studentDiscountPercent: request.studentDiscountPercent as number,
    promoterEarningPercent: request.promoterEarningPercent as number,
  };
}

function applyCouponDiscount(sellingPrice: number, coupon: ResolvedCoupon) {
  const studentDiscountAmount = Math.round((sellingPrice * coupon.studentDiscountPercent) / 100);
  const promoterEarning = Math.round((sellingPrice * coupon.promoterEarningPercent) / 100);
  const discountedPrice = sellingPrice - studentDiscountAmount;
  return { studentDiscountAmount, promoterEarning, discountedPrice };
}

// ─── Preview a coupon (no Razorpay order created) ──────────────────────────
export const previewCoupon = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemType: ItemType; itemId: string; couponCode: string }) => data)
  .handler(async ({ data }) => {
    await requireSignedIn(data.token);
    const { sellingPrice } = await lookupItemPriceAndTitle(data.itemType, data.itemId);
    const coupon = await resolveCoupon(data.itemType, data.itemId, data.couponCode.trim());
    const { studentDiscountAmount, discountedPrice } = applyCouponDiscount(sellingPrice, coupon);

    return {
      valid: true,
      originalPrice: sellingPrice,
      studentDiscountAmount,
      discountedPrice,
      studentDiscountPercent: coupon.studentDiscountPercent,
    };
  });

// ─── Create order ──────────────────────────────────────────────────────────
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemType: ItemType; itemId: string; couponCode?: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keyId, keySecret } = getRazorpayCredentials();
    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    let amountToCharge = sellingPrice;
    let coupon: ResolvedCoupon | null = null;
    let studentDiscountAmount = 0;

    if (data.couponCode?.trim()) {
      coupon = await resolveCoupon(data.itemType, data.itemId, data.couponCode.trim());
      const applied = applyCouponDiscount(sellingPrice, coupon);
      amountToCharge = applied.discountedPrice;
      studentDiscountAmount = applied.studentDiscountAmount;
    }

    const commissionPercent = await resolveCommissionPercent(data.itemType, data.itemId);

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const amountPaise = Math.round(amountToCharge * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      // Razorpay caps `receipt` at 40 characters — 1-letter type code + last
      // 12 chars of the id keeps this well under the limit for all three types.
      receipt: `${data.itemType === "bundle" ? "b" : data.itemType === "mentorship" ? "m" : "t"}_${data.itemId.slice(-12)}_${Date.now()}`,
      notes: {
        uid: decoded.uid,
        itemType: data.itemType,
        itemId: data.itemId,
        ...(commissionPercent != null ? { platformCommissionPercent: String(commissionPercent) } : {}),
        ...(coupon
          ? {
              couponCode: coupon.couponCode,
              promoterId: coupon.promoterId,
              studentDiscountPercent: String(coupon.studentDiscountPercent),
              promoterEarningPercent: String(coupon.promoterEarningPercent),
            }
          : {}),
      },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      itemTitle: title,
      originalPrice: sellingPrice,
      studentDiscountAmount,
      couponApplied: coupon !== null,
    };
  });

// ─── Verify payment + write purchase record ────────────────────────────────
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keyId, keySecret } = getRazorpayCredentials();

    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== data.razorpaySignature) {
      throw new Error("Payment verification failed — signature mismatch.");
    }

    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);
    const db = await getDb();

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.fetch(data.razorpayOrderId);
    const notes = (order.notes ?? {}) as Record<string, string>;

    const hasCoupon = Boolean(notes.couponCode && notes.promoterId);
    const amountCharged = Number(order.amount) / 100;
    const platformCommissionPercent = notes.platformCommissionPercent ? Number(notes.platformCommissionPercent) : null;

    await db.collection("purchases").updateOne(
      { uid: decoded.uid, itemType: data.itemType, itemId: data.itemId },
      {
        $set: {
          uid: decoded.uid,
          itemType: data.itemType,
          itemId: data.itemId,
          amount: amountCharged,
          razorpayOrderId: data.razorpayOrderId,
          razorpayPaymentId: data.razorpayPaymentId,
          purchasedAt: new Date(),
          ...(platformCommissionPercent != null ? { platformCommissionPercent } : {}),
          ...(hasCoupon ? { couponCode: notes.couponCode, promoterId: notes.promoterId } : {}),
        },
      },
      { upsert: true },
    );

    if (hasCoupon) {
      try {
        const studentDiscountPercent = Number(notes.studentDiscountPercent);
        const promoterEarningPercent = Number(notes.promoterEarningPercent);
        const studentDiscountAmount = Math.round((sellingPrice * studentDiscountPercent) / 100);
        const promoterEarning = Math.round((sellingPrice * promoterEarningPercent) / 100);

        const profile = await db.collection("profiles").findOne({ uid: decoded.uid }, { projection: { fullName: 1 } });
        const studentName = (profile?.fullName as string) || decoded.name || "Student";

        await db.collection("promoterSales").updateOne(
          { promoterId: notes.promoterId, itemId: data.itemId, uid: decoded.uid },
          {
            $set: {
              promoterId: notes.promoterId,
              uid: decoded.uid,
              studentName,
              batchId: data.itemId,
              batchName: title,
              batchPrice: sellingPrice,
              studentDiscountAmount,
              totalPaid: amountCharged,
              promoterEarning,
              couponCode: notes.couponCode,
              purchasedAt: new Date(),
            },
          },
          { upsert: true },
        );
      } catch (err) {
        console.error(
          `[verifyRazorpayPayment] promoterSales write failed for uid=${decoded.uid}, itemId=${data.itemId}:`,
          err,
        );
      }
    }

    if (decoded.email) {
      try {
        await sendMail({
          to: decoded.email,
          subject: `Payment successful — ${title}`,
          html: purchaseConfirmationEmailHtml({
            itemTitle: title,
            itemType: data.itemType === "mentorTest" ? "bundle" : data.itemType, // template only distinguishes bundle/mentorship copy
            amount: amountCharged,
          }),
        });
      } catch (err) {
        console.error(`[verifyRazorpayPayment] confirmation email failed for uid=${decoded.uid}:`, err);
      }
    } else {
      console.warn(`[verifyRazorpayPayment] no email on token for uid=${decoded.uid}, skipping confirmation email`);
    }

    return { ok: true };
  });