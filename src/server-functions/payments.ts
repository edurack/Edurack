// Real Razorpay integration: order creation (price looked up server-side,
// never trusted from the client), signature verification, and the actual
// `purchases` collection write that unlocks paywalled content elsewhere.
//
// node:crypto is imported dynamically (inside verifySignature below), never
// statically at module top level — a static import broke mentor-auth.ts
// once it became reachable from a client component; this file is reachable
// from client components too (bundle/mentorship purchase flow, and now
// the mentor-session booking dialog), so it follows the same safe pattern.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import {
  purchaseConfirmationEmailHtml,
  sessionBookingConfirmationEmailHtml,
  sessionBookingNotificationEmailHtml,
} from "@/lib/email-templates";
import { PLATFORM_COMMISSION_PERCENT, QUESTION_INGESTION_FEE_PERCENT, MENTOR_TEST_STANDALONE_COMMISSION_PERCENT } from "@/lib/admin-types";
import { SESSION_PLATFORM_COMMISSION_PERCENT, splitSessionPrice } from "@/lib/session-types";

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

async function computeRazorpaySignature(orderId: string, paymentId: string, secret: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

// "mentorTest" — a single paid test appended to a mentor's batch series,
// bought standalone (no batch purchase required). See testCores.price /
// testCores.publishedToBatch in admin-types.ts.
// "mentorSession" — a single booked slot from the Mentor Sessions feature
// (Supabase-backed, see server-functions/mentor-sessions.ts /
// student-sessions.ts). itemId for this type is the offering id.
type ItemType = "bundle" | "mentorship" | "mentorTest" | "mentorSession";

// Looks up a mentor's public name/photo and (best-effort) email. Email
// isn't stored on the mentor document directly — it only exists on the
// creatorApplications document behind mentorOnboardingDetails, same
// resolution admin.ts's getAdminMentorFullDetail uses. Returns null name
// fields gracefully rather than throwing, since this is only used for a
// best-effort notification email.
async function lookupMentorPublicInfo(mentorId: string): Promise<{ name: string; photoUrl: string | null; email: string | null } | null> {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(mentorId) });
  if (!mentor) return null;

  let email: string | null = null;
  const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId });
  if (onboarding?.applicationId) {
    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(onboarding.applicationId as string) });
    email = (app?.personal as { email?: string } | undefined)?.email ?? null;
  }

  return {
    name: (mentor.name as string) ?? "Mentor",
    photoUrl: (mentor.profilePictureUrl as string | null) ?? null,
    email,
  };
}

async function lookupItemPriceAndTitle(itemType: ItemType, itemId: string) {
  if (itemType === "mentorSession") {
    const { data: offering, error } = await supabase
      .from("mentor_session_offerings")
      .select("*")
      .eq("id", itemId)
      .eq("active", true)
      .single();
    if (error || !offering) throw new Error("This session is no longer available.");
    return { sellingPrice: offering.is_free ? 0 : Number(offering.price), title: offering.title as string };
  }

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
// unchanged) — mentorship batches and standalone mentorTest sales carry a
// mentor split, and mentorSession is a flat 5% platform commission.
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
  return null; // bundle — ledger already treats this as 100% platform
}

// ─── Promoter coupon integration ────────────────────────────────────────────
// Coupons only ever apply to mentorship batches — promoters never promote
// bundles, standalone tests, or sessions (see promoter-portal.ts:
// listPromotableBatches only reads mentorshipBatches).
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
// The unique index on mentor_session_bookings(offering_id, session_date,
// start_time) is the real race-safe guard (enforced at insert time below).
// This is just a fast, friendly pre-check so a student doesn't pay for a
// slot that's obviously already gone before Razorpay is even involved.
async function assertSessionSlotOpen(offeringId: string, date: string, startTime: string) {
  const { data: existing } = await supabase
    .from("mentor_session_bookings")
    .select("id")
    .eq("offering_id", offeringId)
    .eq("session_date", date)
    .eq("start_time", startTime)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existing) throw new Error("Sorry, that slot has already been booked.");
}

// Shared by verifyRazorpayPayment's mentorSession branch (paid) and
// claimFreeItem's mentorSession branch (free) — inserts the booking row
// and best-effort sends the two session emails. Never touches Mongo except
// to look up the mentor's public info for the notification email.
async function createSessionBookingRecord(params: {
  offeringId: string;
  date: string;
  startTime: string;
  studentNote: string;
  studentUid: string;
  studentName: string;
  studentEmail: string | null;
  paymentStatus: "paid" | "free";
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
}) {
  const { data: offering, error: offeringErr } = await supabase
    .from("mentor_session_offerings")
    .select("*")
    .eq("id", params.offeringId)
    .single();
  if (offeringErr || !offering) throw new Error("This session is no longer available.");

  await assertSessionSlotOpen(params.offeringId, params.date, params.startTime);

  const { platformAmount, mentorNetAmount } =
    params.paymentStatus === "free" ? { platformAmount: 0, mentorNetAmount: 0 } : splitSessionPrice(Number(offering.price));

  const { data: booking, error: insertErr } = await supabase
    .from("mentor_session_bookings")
    .insert({
      offering_id: offering.id,
      mentor_id: offering.mentor_id,
      student_uid: params.studentUid,
      student_name: params.studentName,
      student_email: params.studentEmail,
      student_note: params.studentNote.trim(),
      session_date: params.date,
      start_time: params.startTime,
      duration_minutes: offering.duration_minutes,
      price: params.paymentStatus === "free" ? 0 : offering.price,
      is_free: offering.is_free,
      platform_amount: platformAmount,
      mentor_net_amount: mentorNetAmount,
      payment_status: params.paymentStatus,
      razorpay_order_id: params.razorpayOrderId,
      razorpay_payment_id: params.razorpayPaymentId,
      status: "upcoming",
    })
    .select()
    .single();
  if (insertErr) {
    if (insertErr.code === "23505") throw new Error("Sorry, that slot was just booked by someone else.");
    throw new Error(insertErr.message);
  }

  const mentorInfo = await lookupMentorPublicInfo(offering.mentor_id);
  if (mentorInfo?.email) {
    try {
      await sendMail({
        to: mentorInfo.email,
        subject: `New booking: ${params.studentName} — ${offering.title}`,
        html: sessionBookingNotificationEmailHtml({
          mentorName: mentorInfo.name,
          studentName: params.studentName,
          title: offering.title,
          date: params.date,
          startTime: params.startTime,
        }),
      });
    } catch (err) {
      console.error(`[createSessionBookingRecord] mentor notification email failed for booking=${booking.id}:`, err);
    }
  }
  if (params.studentEmail) {
    try {
      await sendMail({
        to: params.studentEmail,
        subject: `Confirmed: ${offering.title} with ${mentorInfo?.name ?? "your mentor"}`,
        html: sessionBookingConfirmationEmailHtml({
          studentName: params.studentName,
          mentorName: mentorInfo?.name ?? "your mentor",
          title: offering.title,
          date: params.date,
          startTime: params.startTime,
        }),
      });
    } catch (err) {
      console.error(`[createSessionBookingRecord] student confirmation email failed for booking=${booking.id}:`, err);
    }
  }

  return { bookingId: booking.id as string, mentorId: offering.mentor_id as string };
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
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      couponCode?: string;
      // Only used (and required) when itemType === "mentorSession" — which
      // slot on the offering is being booked. Round-tripped through the
      // Razorpay order's notes so verifyRazorpayPayment reads them back
      // from Razorpay itself rather than trusting the client a second time.
      sessionDate?: string;
      sessionStartTime?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keyId, keySecret } = getRazorpayCredentials();
    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    if (data.itemType === "mentorSession") {
      if (!data.sessionDate || !data.sessionStartTime) throw new Error("Missing session date/time.");
      if (sellingPrice <= 0) throw new Error("This session is free — use claimFreeItem instead.");
      await assertSessionSlotOpen(data.itemId, data.sessionDate, data.sessionStartTime);
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

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const receiptPrefix = data.itemType === "bundle" ? "b" : data.itemType === "mentorship" ? "m" : data.itemType === "mentorTest" ? "t" : "s";
    const amountPaise = Math.round(amountToCharge * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      // Razorpay caps `receipt` at 40 characters — 1-letter type code + last
      // 12 chars of the id keeps this well under the limit for all types.
      receipt: `${receiptPrefix}_${data.itemId.slice(-12)}_${Date.now()}`,
      notes: {
        uid: decoded.uid,
        itemType: data.itemType,
        itemId: data.itemId,
        ...(commissionPercent != null ? { platformCommissionPercent: String(commissionPercent) } : {}),
        ...(data.itemType === "mentorSession" ? { sessionDate: data.sessionDate!, sessionStartTime: data.sessionStartTime! } : {}),
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
      // Only used when itemType === "mentorSession".
      studentNote?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keySecret } = getRazorpayCredentials();

    const expectedSignature = await computeRazorpaySignature(data.razorpayOrderId, data.razorpayPaymentId, keySecret);
    if (expectedSignature !== data.razorpaySignature) {
      throw new Error("Payment verification failed — signature mismatch.");
    }

    const { keyId } = getRazorpayCredentials();
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.fetch(data.razorpayOrderId);
    const notes = (order.notes ?? {}) as Record<string, string>;
    const amountCharged = Number(order.amount) / 100;

    // ── Session bookings: separate path, never touches Mongo `purchases` ──
    if (data.itemType === "mentorSession") {
      if (!notes.sessionDate || !notes.sessionStartTime) throw new Error("Session date/time missing from order.");
      const { bookingId } = await createSessionBookingRecord({
        offeringId: data.itemId,
        date: notes.sessionDate,
        startTime: notes.sessionStartTime,
        studentNote: data.studentNote ?? "",
        studentUid: decoded.uid,
        studentName: decoded.name ?? "Student",
        studentEmail: decoded.email ?? null,
        paymentStatus: "paid",
        razorpayOrderId: data.razorpayOrderId,
        razorpayPaymentId: data.razorpayPaymentId,
      });
      return { ok: true, bookingId };
    }

    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);
    const db = await getDb();

    const hasCoupon = Boolean(notes.couponCode && notes.promoterId);
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

  // ─── Claim a free item (selling price is literally 0) ──────────────────────
// Some bundles/mentorship batches are published at ₹0 (promos, giveaways),
// and mentor sessions can be marked free by the mentor. Razorpay can't
// create a ₹0 order, so this bypasses the payment gateway entirely — but it
// re-checks the price server-side via lookupItemPriceAndTitle before
// writing anything, so a client can't spoof "this is free" to grab a paid
// item for nothing. For bundle/mentorship/mentorTest, writes the exact same
// `purchases` shape verifyRazorpayPayment does, with a synthetic
// "free_..." id in place of a real Razorpay payment id. For mentorSession,
// writes a booking to Supabase instead (see createSessionBookingRecord) —
// same branch structure as verifyRazorpayPayment above.
export const claimFreeItem = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      itemType: ItemType;
      itemId: string;
      // Only used when itemType === "mentorSession".
      sessionDate?: string;
      sessionStartTime?: string;
      studentNote?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { sellingPrice } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    if (sellingPrice > 0) {
      throw new Error("This item isn't free — use regular checkout.");
    }

    if (data.itemType === "mentorSession") {
      if (!data.sessionDate || !data.sessionStartTime) throw new Error("Missing session date/time.");
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

    const { title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);
    const db = await getDb();
    const commissionPercent = await resolveCommissionPercent(data.itemType, data.itemId);
    const freePaymentId = `free_${decoded.uid}_${Date.now()}`;

    await db.collection("purchases").updateOne(
      { uid: decoded.uid, itemType: data.itemType, itemId: data.itemId },
      {
        $set: {
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