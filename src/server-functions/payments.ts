// Real Razorpay integration: order creation (price looked up server-side,
// never trusted from the client), signature verification, and the actual
// `purchases` collection write that unlocks paywalled content elsewhere.
//
// node:crypto is imported dynamically (inside computeRazorpaySignature),
// never statically at module top level — see mentor-auth.ts's comment on
// why that matters for any file reachable from a client component.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { purchaseConfirmationEmailHtml } from "@/lib/email-templates";
import { PLATFORM_COMMISSION_PERCENT, QUESTION_INGESTION_FEE_PERCENT, MENTOR_TEST_STANDALONE_COMMISSION_PERCENT } from "@/lib/admin-types";
import { SESSION_PLATFORM_COMMISSION_PERCENT } from "@/lib/session-types";
import { expandOfferingToSlots } from "@/lib/session-slots";
import { rowToOffering } from "@/lib/session-rows";
import { istDateString } from "@/lib/session-time";
import {
  ITEM_TYPES,
  completeProPlanPayment,
  completeSessionPayment,
  createSessionBookingRecord,
  getRazorpayCredentials,
  lookupItemPriceAndTitle,
  lookupProPlan,
  recordPaidPurchase,
  userAlreadyOwns,
  type ItemType,
} from "@/lib/payment-core";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}

async function computeRazorpaySignature(orderId: string, paymentId: string, secret: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

// Constant-time comparison, so response timing can't be used to guess a valid signature.
async function signaturesMatch(expected: string, received: string): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(received ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Per-student ceilings, so a script can't spam Razorpay orders or guess coupon codes.
async function limitOrThrow(uid: string, bucket: string, limit: number) {
  const { hitRateLimit } = await import("@/lib/pyq-public-server");
  if (!(await hitRateLimit(await getDb(), `pay:${bucket}:${uid}`, limit, 60))) {
    throw new Error("Too many attempts. Please wait a minute and try again.");
  }
}

// Used as the validator for every function that takes an itemType.
function checkedItemInput<T extends { itemType: ItemType }>(data: T): T {
  if (!ITEM_TYPES.includes(data.itemType)) throw new Error("Invalid item type.");
  return data;
}

async function mentorHasTestSeriesAccess(mentorId: string): Promise<boolean> {
  const db = await getDb();
  const [onboarding, request] = await Promise.all([
    db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId }),
    db.collection("testSeriesAccessRequests").findOne({ mentorId }),
  ]);
  return Boolean(onboarding?.wantsToSellTestSeries) || Boolean(request?.adminGranted);
}

async function resolveCommissionPercent(itemType: ItemType, itemId: string): Promise<number | null> {
  if (itemType === "mentorSession") return SESSION_PLATFORM_COMMISSION_PERCENT;
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
  return null;
}

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

// ─── Session slot helpers ────────────────────────────────────────────────
// Fast, friendly pre-check before a Razorpay order is even created — the
// real, race-safe guard is the `enforce_session_capacity` Postgres trigger
// (see sql/002_session_capacity.sql), which runs atomically at insert time
// in createSessionBookingRecord below. This just avoids sending someone to
// checkout for a slot that's obviously already full.
async function assertSeatAvailable(offeringId: string, date: string, startTime: string) {
  const { data: row, error: offeringErr } = await supabase
    .from("mentor_session_offerings")
    .select("*")
    .eq("id", offeringId)
    .eq("active", true)
    .single();
  if (offeringErr || !row) throw new Error("This session is no longer available.");

  const { data: bookingRows, error } = await supabase
    .from("mentor_session_bookings")
    .select("offering_id, session_date, start_time")
    .eq("offering_id", offeringId)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);

  const seatCounts = new Map<string, number>();
  for (const b of bookingRows ?? []) {
    const key = `${b.offering_id}:${b.session_date}:${b.start_time}`;
    seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
  }

  // The client used to be able to ask for ANY date/time: an order was created
  // as long as that exact slot wasn't full — including slots in the past or
  // ones the mentor never offered. Now the slot has to be one the offering
  // actually has open right now.
  const open = expandOfferingToSlots(rowToOffering(row), seatCounts, 45);
  const match = open.find((s) => s.date === date && s.startTime === startTime.slice(0, 5));
  if (match) return;

  const stillExists = expandOfferingToSlots(rowToOffering(row), new Map(), 45).some((s) => s.date === date && s.startTime === startTime.slice(0, 5));
  throw new Error(stillExists ? "Sorry, that slot is full." : "That time isn't available for this session anymore. Please pick another.");
}

// One UPCOMING booking per student per offering — a student holding a
// future slot on this offering can't book a second one until it's cancelled
// or has happened. (This used to count every non-cancelled booking, so once
// you'd attended a session you could never book that offering again — and
// there was no way to cancel to get out of it.) Checked
// before both a paid order is created and a free slot is claimed, so it
// can't be bypassed by either path.
async function assertStudentHasNotBookedOffering(offeringId: string, studentUid: string) {
  const { count, error } = await supabase
    .from("mentor_session_bookings")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", offeringId)
    .eq("student_uid", studentUid)
    .eq("status", "upcoming")
    .gte("session_date", istDateString());
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) {
    throw new Error("You already have an upcoming booking for this session. Cancel it from My Sessions if you'd like a different time.");
  }
}

export const previewCoupon = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemType: ItemType; itemId: string; couponCode: string }) => checkedItemInput(data))
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    await limitOrThrow(decoded.uid, "coupon", 15);
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

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      couponCode?: string;
      sessionDate?: string;
      sessionStartTime?: string;
    }) => checkedItemInput(data),
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    await limitOrThrow(decoded.uid, "order", 10);
    const { keyId, keySecret } = getRazorpayCredentials();
    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    // Don't take money for something the student already has (it would be a duplicate charge).
    if (data.itemType !== "mentorSession" && data.itemType !== "proPlan" && (await userAlreadyOwns(decoded.uid, data.itemType, data.itemId))) {
      throw new Error("You already have this. Find it in your purchases — no need to pay again.");
    }

    if (data.itemType === "mentorSession") {
      if (!data.sessionDate || !data.sessionStartTime) throw new Error("Missing session date/time.");
      if (sellingPrice <= 0) throw new Error("This session is free — use claimFreeItem instead.");
      await assertStudentHasNotBookedOffering(data.itemId, decoded.uid);
      await assertSeatAvailable(data.itemId, data.sessionDate, data.sessionStartTime);
    }

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
    // The length of Pro the student is buying, fixed now so a later edit to the plan can't change what they get.
    const proPlan = data.itemType === "proPlan" ? await lookupProPlan(data.itemId) : null;

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const receiptPrefix = data.itemType === "bundle" ? "b" : data.itemType === "mentorship" ? "m" : data.itemType === "mentorTest" ? "t" : data.itemType === "proPlan" ? "p" : "s";
    const amountPaise = Math.round(amountToCharge * 100);
    if (amountPaise < 100) throw new Error("This amount is too low to charge online.");
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `${receiptPrefix}_${data.itemId.slice(-12)}_${Date.now()}`,
      notes: {
        uid: decoded.uid,
        itemType: data.itemType,
        itemId: data.itemId,
        // The price the student was quoted, so promoter earnings are worked out from it even if the price is edited before they pay.
        originalPrice: String(sellingPrice),
        ...(commissionPercent != null ? { platformCommissionPercent: String(commissionPercent) } : {}),
        ...(data.itemType === "mentorSession" ? { sessionDate: data.sessionDate!, sessionStartTime: data.sessionStartTime! } : {}),
        ...(proPlan ? { durationDays: String(proPlan.durationDays), planName: proPlan.name, features: proPlan.features.join(",") } : {}),
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

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      studentNote?: string;
    }) => checkedItemInput(data),
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keyId, keySecret } = getRazorpayCredentials();

    const expectedSignature = await computeRazorpaySignature(data.razorpayOrderId, data.razorpayPaymentId, keySecret);
    if (!(await signaturesMatch(expectedSignature, data.razorpaySignature))) {
      throw new Error("Payment verification failed — signature mismatch.");
    }

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [order, payment] = await Promise.all([razorpay.orders.fetch(data.razorpayOrderId), razorpay.payments.fetch(data.razorpayPaymentId)]);
    const notes = (order.notes ?? {}) as Record<string, string>;
    const amountCharged = Number(order.amount) / 100;

    // The signature above only proves "this payment belongs to this order". What
    // the order was FOR, and who placed it, is in its notes (written server-side
    // by createRazorpayOrder). Without this check, a valid signature from a cheap
    // order could be replayed with a different itemId to unlock a pricier item,
    // or used from a different account.
    if (notes.itemType !== data.itemType || notes.itemId !== data.itemId || notes.uid !== decoded.uid) {
      console.warn(
        `[verifyRazorpayPayment] order/item mismatch: order=${data.razorpayOrderId} payment=${data.razorpayPaymentId}`,
      );
      throw new Error("Payment verification failed — this payment doesn't match the item being unlocked.");
    }

    // Access is granted only for money that has actually been captured, for the full order amount.
    // If the bank is still confirming, nothing is lost: the Razorpay webhook completes the purchase
    // a few minutes later (see routes/api.razorpay-webhook.ts), so the student must not pay twice.
    if (payment.order_id !== data.razorpayOrderId || Number(payment.amount) !== Number(order.amount) || payment.status !== "captured") {
      throw new Error("Your payment is still being confirmed. If you were charged, your access will appear within a few minutes — please don't pay again.");
    }

    if (data.itemType === "mentorSession") {
      const { bookingId } = await completeSessionPayment({
        offeringId: data.itemId,
        orderId: data.razorpayOrderId,
        paymentId: data.razorpayPaymentId,
        notes,
        amountPaid: amountCharged,
        studentUid: decoded.uid,
        studentName: decoded.name ?? "Student",
        studentEmail: decoded.email ?? null,
        studentNote: data.studentNote ?? "",
      });
      return { ok: true, bookingId };
    }

    if (data.itemType === "proPlan") {
      const { until } = await completeProPlanPayment({
        uid: decoded.uid,
        email: decoded.email ?? null,
        planId: data.itemId,
        orderId: data.razorpayOrderId,
        paymentId: data.razorpayPaymentId,
        amountCharged,
        notes,
      });
      return { ok: true, proUntil: until.toISOString() };
    }

    const outcome = await recordPaidPurchase({
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      itemType: data.itemType,
      itemId: data.itemId,
      orderId: data.razorpayOrderId,
      paymentId: data.razorpayPaymentId,
      amountCharged,
      notes,
    });
    if (outcome === "duplicate-refund-failed") {
      throw new Error(`You already have this item, so this second payment wasn't needed. We couldn't refund it automatically — please contact support with payment ID ${data.razorpayPaymentId}.`);
    }
    return { ok: true, ...(outcome === "duplicate-refunded" ? { duplicateRefunded: true } : {}) };
  });

export const claimFreeItem = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      sessionDate?: string;
      sessionStartTime?: string;
      studentNote?: string;
    }) => checkedItemInput(data),
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    if (data.itemType === "proPlan") throw new Error("This plan can't be claimed for free.");
    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    // Exactly 0 — not merely "not above 0", which a missing or broken price would also satisfy.
    if (sellingPrice !== 0) {
      throw new Error("This item isn't free — use regular checkout.");
    }

    if (data.itemType === "mentorSession") {
      if (!data.sessionDate || !data.sessionStartTime) throw new Error("Missing session date/time.");
      await assertStudentHasNotBookedOffering(data.itemId, decoded.uid);
      await assertSeatAvailable(data.itemId, data.sessionDate, data.sessionStartTime);
      const { bookingId } = await createSessionBookingRecord({
        offeringId: data.itemId,
        date: data.sessionDate,
        startTime: data.sessionStartTime,
        studentNote: data.studentNote ?? "",
        studentUid: decoded.uid,
        studentName: decoded.name ?? "Student",
        studentEmail: decoded.email ?? null,
        paymentStatus: "free",
        razorpayOrderId: null,
        razorpayPaymentId: null,
      });
      return { ok: true, bookingId };
    }

    const db = await getDb();
    // Already theirs (paid or claimed before): leave that record exactly as it is.
    if (await userAlreadyOwns(decoded.uid, data.itemType, data.itemId)) return { ok: true, alreadyOwned: true };

    const commissionPercent = await resolveCommissionPercent(data.itemType, data.itemId);
    const freePaymentId = `free_${decoded.uid}_${Date.now()}`;

    await db.collection("purchases").updateOne(
      { uid: decoded.uid, itemType: data.itemType, itemId: data.itemId },
      {
        $setOnInsert: {
          uid: decoded.uid,
          itemType: data.itemType,
          itemId: data.itemId,
          amount: 0,
          razorpayOrderId: freePaymentId,
          razorpayPaymentId: freePaymentId,
          purchasedAt: new Date(),
          ...(commissionPercent != null ? { platformCommissionPercent: commissionPercent } : {}),
        },
      },
      { upsert: true },
    );

    if (decoded.email) {
      try {
        await sendMail({
          to: decoded.email,
          subject: `You're enrolled — ${title}`,
          html: purchaseConfirmationEmailHtml({
            itemTitle: title,
            itemType: data.itemType === "mentorTest" ? "bundle" : data.itemType,
            amount: 0,
          }),
        });
      } catch (err) {
        console.error(`[claimFreeItem] confirmation email failed for uid=${decoded.uid}:`, err);
      }
    }

    return { ok: true };
  });