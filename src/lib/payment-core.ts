// SERVER-ONLY. The parts of the payment flow shared by the checkout server functions
// (server-functions/payments.ts) and the Razorpay webhook (routes/api.razorpay-webhook.ts):
// price lookup, booking a paid session, and recording a paid purchase.
//
// Everything that turns a captured payment into access is idempotent, so the browser's
// verify call and the webhook can both run for the same payment without double-granting,
// double-emailing, or overwriting an earlier purchase.
//
// node:crypto is deliberately NOT imported here (this file is reachable from client-side
// imports of payments.ts) — see mentor-auth.ts's comment on why that matters.
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { purchaseConfirmationEmailHtml, sessionBookingConfirmationEmailHtml, sessionBookingNotificationEmailHtml } from "@/lib/email-templates";
import { splitSessionPrice } from "@/lib/session-types";
import { refundRazorpayPayment } from "@/lib/razorpay-refund";

// "mentorTest" — a single paid test appended to a mentor's batch series,
// bought standalone (no batch purchase required). See testCores.price /
// testCores.publishedToBatch in admin-types.ts.
// "mentorSession" — a single booked slot from the Mentor Sessions feature
// (Supabase-backed, see server-functions/mentor-sessions.ts /
// student-sessions.ts). itemId for this type is the offering id.
// "proPlan" — a period of Edurack Pro (unlimited timed drills + the custom drill builder). itemId is
// the plan's id in `proPlans`. Not a one-time item: buying again while Pro is active extends it, so
// the "already owned" check and the `purchases` collection are not used for it (see lib/pro-server.ts).
export type ItemType = "bundle" | "mentorship" | "mentorTest" | "mentorSession" | "proPlan";
export const ITEM_TYPES: readonly string[] = ["bundle", "mentorship", "mentorTest", "mentorSession", "proPlan"];

export function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Server misconfigured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  }
  return { keyId, keySecret };
}

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

/** An Edurack Pro plan that can be sold right now. Throws when it doesn't exist, is switched off, or has a bad price or length. */
export async function lookupProPlan(planId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const plan = await db.collection("proPlans").findOne({ _id: new ObjectId(planId), active: true });
  const price = plan?.price;
  const days = plan?.durationDays;
  if (!plan || typeof price !== "number" || !Number.isFinite(price) || price < 1 || !Number.isInteger(days) || (days as number) < 1) {
    throw new Error("This plan isn't available right now.");
  }
  return { name: String(plan.name ?? "Edurack Pro"), price, durationDays: days as number };
}

export async function lookupItemPriceAndTitle(itemType: ItemType, itemId: string) {
  if (itemType === "proPlan") {
    const plan = await lookupProPlan(itemId);
    return { sellingPrice: plan.price, title: plan.name };
  }
  if (itemType === "mentorSession") {
    const { data: offering, error } = await supabase
      .from("mentor_session_offerings")
      .select("*")
      .eq("id", itemId)
      .eq("active", true)
      .single();
    if (error || !offering) throw new Error("This session is no longer available.");
    const sessionPrice = offering.is_free ? 0 : Number(offering.price);
    if (!Number.isFinite(sessionPrice) || sessionPrice < 0) throw new Error("This session isn't available for purchase right now.");
    return { sellingPrice: sessionPrice, title: offering.title as string };
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

  // A missing, non-numeric or negative price must never be read as "free": claimFreeItem
  // treats price 0 as free, and `undefined > 0` is false.
  const price = doc.sellingPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("This item isn't available for purchase right now.");
  }
  return {
    sellingPrice: price,
    title: (itemType === "bundle" ? doc.title : doc.name) as string,
  };
}

// Shared by verifyRazorpayPayment's mentorSession branch (paid) and
// claimFreeItem's mentorSession branch (free) — inserts the booking row
// and best-effort sends the two session emails.
export async function createSessionBookingRecord(params: {
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
  /** Rupees actually charged (from the Razorpay order). Falls back to the offering price when absent. */
  amountPaid?: number;
}) {
  const { data: offering, error: offeringErr } = await supabase
    .from("mentor_session_offerings")
    .select("*")
    .eq("id", params.offeringId)
    .single();
  if (offeringErr || !offering) throw new Error("This session is no longer available.");

  const { platformAmount, mentorNetAmount } =
    params.paymentStatus === "free" ? { platformAmount: 0, mentorNetAmount: 0 } : splitSessionPrice(params.amountPaid ?? Number(offering.price));

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
      price: params.paymentStatus === "free" ? 0 : (params.amountPaid ?? offering.price),
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
    // Raised by the enforce_session_capacity trigger (sql/002) when the
    // slot filled up between the pre-check above and this insert.
    if (insertErr.message?.includes("slot is full")) throw new Error("Sorry, that slot just filled up.");
    throw new Error(insertErr.message);
  }

  const mentorInfo = await lookupMentorPublicInfo(offering.mentor_id);
  // The two emails are independent and best-effort — send them concurrently so
  // the student isn't waiting on two mail round trips back to back.
  await Promise.all([
    (async () => {
      if (!mentorInfo?.email) return;
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
    })(),
    (async () => {
      if (!params.studentEmail) return;
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
    })(),
  ]);

  return { bookingId: booking.id as string, mentorId: offering.mentor_id as string };
}


/** Title for emails and records. Never throws: a payment that already went through must not fail because the item was edited afterwards. */
async function lookupItemTitleSafe(itemType: ItemType, itemId: string): Promise<{ title: string; currentPrice: number | null }> {
  try {
    const r = await lookupItemPriceAndTitle(itemType, itemId);
    return { title: r.title, currentPrice: r.sellingPrice };
  } catch {
    return { title: "your purchase", currentPrice: null };
  }
}

// ─── Paid sessions ───────────────────────────────────────────────────────

/**
 * Books the session a captured payment was for, once. If this payment already produced a
 * booking it returns that one (a retry, a double-click, or the webhook arriving after the
 * browser's verify call). If the seat is gone, the payment is refunded automatically and an
 * Error explaining that is thrown.
 */
export async function completeSessionPayment(p: {
  offeringId: string;
  orderId: string;
  paymentId: string;
  notes: Record<string, string>;
  amountPaid: number;
  studentUid: string;
  studentName: string;
  studentEmail: string | null;
  studentNote: string;
}): Promise<{ bookingId: string }> {
  if (!p.notes.sessionDate || !p.notes.sessionStartTime) throw new Error("Session date/time missing from order.");

  const { data: existing } = await supabase.from("mentor_session_bookings").select("id").eq("razorpay_payment_id", p.paymentId).maybeSingle();
  if (existing) return { bookingId: existing.id as string };

  try {
    const { bookingId } = await createSessionBookingRecord({
      offeringId: p.offeringId,
      date: p.notes.sessionDate,
      startTime: p.notes.sessionStartTime,
      studentNote: p.studentNote,
      studentUid: p.studentUid,
      studentName: p.studentName,
      studentEmail: p.studentEmail,
      paymentStatus: "paid",
      razorpayOrderId: p.orderId,
      razorpayPaymentId: p.paymentId,
      amountPaid: p.amountPaid,
    });
    return { bookingId };
  } catch (bookingErr) {
    // Money was captured but there's no seat (the slot filled while they were paying, or the
    // offering was paused). Don't leave them charged with nothing to show for it.
    const reason = bookingErr instanceof Error ? bookingErr.message : "We couldn't complete your booking.";
    let tail: string;
    try {
      const r = await refundRazorpayPayment(p.paymentId, { reason: "booking failed after payment", orderId: p.orderId });
      tail = r.refunded ? " You haven't been charged — your payment has been refunded automatically." : "";
    } catch (refundErr) {
      console.error(`[completeSessionPayment] auto-refund failed for payment=${p.paymentId}:`, refundErr);
      tail = ` We couldn't refund you automatically — please contact support with payment ID ${p.paymentId} and we'll sort it out right away.`;
    }
    throw new Error(`${reason}${tail}`);
  }
}

// ─── Paid purchases (bundles, mentorship batches, standalone tests) ──────

let purchaseIndexesEnsured = false;

/** One purchase per student per item, enforced by the database. Best-effort, like the other ensure*Indexes helpers. */
async function ensurePurchaseIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  if (purchaseIndexesEnsured) return;
  purchaseIndexesEnsured = true;
  try {
    await db.collection("purchases").createIndex({ uid: 1, itemType: 1, itemId: 1 }, { unique: true });
    await db.collection("purchases").createIndex({ razorpayPaymentId: 1 });
  } catch (err) {
    // Fails if duplicates already exist; the code below is still safe without the index.
    console.error("[payment-core] couldn't create purchases indexes:", err);
  }
}

export async function userAlreadyOwns(uid: string, itemType: ItemType, itemId: string): Promise<boolean> {
  const db = await getDb();
  return Boolean(await db.collection("purchases").findOne({ uid, itemType, itemId }, { projection: { _id: 1 } }));
}

export type PurchaseOutcome = "created" | "already" | "duplicate-refunded" | "duplicate-refund-failed";

/**
 * Turns a captured payment into a `purchases` record, once.
 *  - created: this call granted access (and sent the receipt / wrote the promoter sale).
 *  - already: this very payment was recorded before — nothing more to do.
 *  - duplicate-*: the student already owned the item from a different payment, so this one is
 *    refunded instead of overwriting the original record.
 */
export async function recordPaidPurchase(p: {
  uid: string;
  email: string | null;
  name: string | null;
  itemType: Exclude<ItemType, "mentorSession" | "proPlan">;
  itemId: string;
  orderId: string;
  paymentId: string;
  amountCharged: number;
  notes: Record<string, string>;
}): Promise<PurchaseOutcome> {
  const db = await getDb();
  await ensurePurchaseIndexes(db);
  const col = db.collection("purchases");
  const key = { uid: p.uid, itemType: p.itemType, itemId: p.itemId };

  const settleExisting = async (existing: Record<string, unknown> | null): Promise<PurchaseOutcome> => {
    if (existing && existing.razorpayPaymentId === p.paymentId) return "already";
    try {
      await refundRazorpayPayment(p.paymentId, { reason: "duplicate purchase", orderId: p.orderId });
      console.warn(`[recordPaidPurchase] duplicate payment refunded: payment=${p.paymentId} uid=${p.uid} item=${p.itemId}`);
      return "duplicate-refunded";
    } catch (err) {
      console.error(`[recordPaidPurchase] duplicate payment NOT refunded, needs manual refund: payment=${p.paymentId} uid=${p.uid} item=${p.itemId}`, err);
      return "duplicate-refund-failed";
    }
  };

  const before = await col.findOne(key, { projection: { razorpayPaymentId: 1 } });
  if (before) return settleExisting(before);

  const hasCoupon = Boolean(p.notes.couponCode && p.notes.promoterId);
  const platformCommissionPercent = p.notes.platformCommissionPercent ? Number(p.notes.platformCommissionPercent) : null;

  // $setOnInsert: if two requests race, the loser changes nothing instead of overwriting the winner.
  const res = await col.updateOne(
    key,
    {
      $setOnInsert: {
        uid: p.uid,
        itemType: p.itemType,
        itemId: p.itemId,
        amount: p.amountCharged,
        razorpayOrderId: p.orderId,
        razorpayPaymentId: p.paymentId,
        purchasedAt: new Date(),
        ...(platformCommissionPercent != null ? { platformCommissionPercent } : {}),
        ...(hasCoupon ? { couponCode: p.notes.couponCode, promoterId: p.notes.promoterId } : {}),
      },
    },
    { upsert: true },
  );
  if (res.upsertedCount === 0) return settleExisting(await col.findOne(key, { projection: { razorpayPaymentId: 1 } }));

  // From here the student has access. The rest is bookkeeping and must never undo that.
  const { title, currentPrice } = await lookupItemTitleSafe(p.itemType, p.itemId);

  if (hasCoupon) {
    try {
      // The price the student was quoted, taken from the order — not today's price, which an admin may have changed since.
      const quoted = Number(p.notes.originalPrice);
      const basePrice = Number.isFinite(quoted) && quoted > 0 ? quoted : (currentPrice ?? p.amountCharged);
      const studentDiscountAmount = Math.round((basePrice * Number(p.notes.studentDiscountPercent)) / 100);
      const promoterEarning = Math.round((basePrice * Number(p.notes.promoterEarningPercent)) / 100);
      const profile = await db.collection("profiles").findOne({ uid: p.uid }, { projection: { fullName: 1 } });
      const studentName = (profile?.fullName as string) || p.name || "Student";

      await db.collection("promoterSales").updateOne(
        { promoterId: p.notes.promoterId, itemId: p.itemId, uid: p.uid },
        {
          $set: {
            promoterId: p.notes.promoterId,
            uid: p.uid,
            studentName,
            batchId: p.itemId,
            batchName: title,
            batchPrice: basePrice,
            studentDiscountAmount,
            totalPaid: p.amountCharged,
            promoterEarning,
            couponCode: p.notes.couponCode,
            purchasedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error(`[recordPaidPurchase] promoterSales write failed for uid=${p.uid}, itemId=${p.itemId}, payment=${p.paymentId}:`, err);
    }
  }

  if (p.email) {
    try {
      await sendMail({
        to: p.email,
        subject: `Payment successful — ${title}`,
        html: purchaseConfirmationEmailHtml({ itemTitle: title, itemType: p.itemType === "mentorTest" ? "bundle" : p.itemType, amount: p.amountCharged }),
      });
    } catch (err) {
      console.error(`[recordPaidPurchase] confirmation email failed for uid=${p.uid}:`, err);
    }
  } else {
    console.warn(`[recordPaidPurchase] no email for uid=${p.uid}, skipping confirmation email`);
  }
  return "created";
}

// ─── Edurack Pro ─────────────────────────────────────────────────────────

/**
 * Grants (or extends) Pro for a captured payment, once per payment. The length comes from the order
 * (written by createRazorpayOrder), so the student gets the period they were quoted even if the plan was edited since.
 */
export async function completeProPlanPayment(p: {
  uid: string;
  email: string | null;
  planId: string;
  orderId: string;
  paymentId: string;
  amountCharged: number;
  notes: Record<string, string>;
}): Promise<{ until: Date; granted: boolean }> {
  const days = Number(p.notes.durationDays);
  if (!Number.isInteger(days) || days < 1) throw new Error("Pro plan details are missing from the order.");
  const { grantProPlan } = await import("@/lib/pro-server");
  const planName = p.notes.planName || "Edurack Pro";
  const result = await grantProPlan(await getDb(), { uid: p.uid, planId: p.planId, planName, durationDays: days, orderId: p.orderId, paymentId: p.paymentId, amount: p.amountCharged });

  if (result.granted && p.email) {
    try {
      const until = result.until.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
      await sendMail({
        to: p.email,
        subject: "Edurack Pro is active",
        html: `<p>Thanks for upgrading. <strong>${planName}</strong> is active until <strong>${until}</strong>.</p><p>You now have unlimited timed PYQ drills and the custom drill builder. Open any drill to start.</p>`,
      });
    } catch (err) {
      console.error(`[completeProPlanPayment] email failed for uid=${p.uid}:`, err);
    }
  }
  return result;
}

// ─── Webhook ─────────────────────────────────────────────────────────────

/** A payment younger than this is left to the browser's verify call; Razorpay retries the webhook later. */
export const WEBHOOK_MIN_AGE_SECONDS = 180;

export type WebhookResult = "ignored" | "too-fresh" | "handled";

/**
 * Settles a captured payment from Razorpay's side, so a student who paid and then closed the tab
 * (or whose verify call failed) still gets what they paid for. Nothing from the webhook body is
 * trusted: the payment and its order are fetched from Razorpay, and the order's notes — written by
 * createRazorpayOrder on our server — say who bought what.
 */
export async function settlePaymentFromWebhook(paymentId: string): Promise<WebhookResult> {
  const { keyId, keySecret } = getRazorpayCredentials();
  const { default: Razorpay } = await import("razorpay");
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const payment: any = await razorpay.payments.fetch(paymentId);
  if (payment.status !== "captured" || !payment.order_id) return "ignored";
  if (Date.now() / 1000 - Number(payment.created_at) < WEBHOOK_MIN_AGE_SECONDS) return "too-fresh";

  const order: any = await razorpay.orders.fetch(payment.order_id);
  const notes = (order.notes ?? {}) as Record<string, string>;
  if (!notes.uid || !notes.itemId || !ITEM_TYPES.includes(notes.itemType)) return "ignored"; // not one of our orders
  if (Number(payment.amount) !== Number(order.amount)) return "ignored";

  const itemType = notes.itemType as ItemType;
  const amountCharged = Number(order.amount) / 100;
  const db = await getDb();
  const profile = await db.collection("profiles").findOne({ uid: notes.uid }, { projection: { fullName: 1, email: 1 } });
  const name = (profile?.fullName as string) || null;
  const email = (profile?.email as string) || null;

  if (itemType === "mentorSession") {
    try {
      await completeSessionPayment({
        offeringId: notes.itemId,
        orderId: order.id,
        paymentId,
        notes,
        amountPaid: amountCharged,
        studentUid: notes.uid,
        studentName: name ?? "Student",
        studentEmail: email,
        studentNote: "",
      });
    } catch (err) {
      // completeSessionPayment has already tried the refund; retrying the webhook can't improve on that.
      console.error(`[webhook] session payment ${paymentId} not booked:`, err);
    }
    return "handled";
  }

  if (itemType === "proPlan") {
    await completeProPlanPayment({ uid: notes.uid, email, planId: notes.itemId, orderId: order.id, paymentId, amountCharged, notes });
    return "handled";
  }

  const outcome = await recordPaidPurchase({ uid: notes.uid, email, name, itemType, itemId: notes.itemId, orderId: order.id, paymentId, amountCharged, notes });
  console.log(`[webhook] payment ${paymentId} → ${outcome}`);
  return "handled";
}
