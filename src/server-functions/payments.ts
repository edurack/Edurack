// Real Razorpay integration: order creation (price looked up server-side,
// never trusted from the client), signature verification, and the actual
// `purchases` collection write that unlocks paywalled content elsewhere.
import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "node:crypto";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { sendMail } from "@/lib/mailer";
import { purchaseConfirmationEmailHtml } from "@/lib/email-templates";

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

type ItemType = "bundle" | "mentorship";

async function lookupItemPriceAndTitle(itemType: ItemType, itemId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const collection = itemType === "bundle" ? "bundles" : "mentorshipBatches";
  const doc = await db.collection(collection).findOne({ _id: new ObjectId(itemId) });
  if (!doc) throw new Error("Item not found");

  return {
    sellingPrice: doc.sellingPrice as number,
    title: (itemType === "bundle" ? doc.title : doc.name) as string,
  };
}

// ─── Promoter coupon integration ────────────────────────────────────────────
// Coupons only ever apply to mentorship batches — promoters never promote
// bundles (see promoter-portal.ts: listPromotableBatches only reads
// mentorshipBatches). Looks up an APPROVED promoterCouponRequests doc
// matching this exact batch + code and returns the split that was locked
// in when the promoter requested it (see promoter-portal.ts's
// requestCoupon) — this file never recomputes or re-derives that split,
// it only reads what was already approved.
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
// Cheap validate-and-show-the-discount call for the checkout UI's "Apply"
// button — students can retype/retry a code freely without spamming real
// Razorpay order creation. createRazorpayOrder re-validates the code again
// itself when the actual order is placed, so nothing here is trusted blindly.
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

    // Razorpay's Node SDK is CJS; import it dynamically so it isn't pulled
    // into the SSR bundle unless this function actually runs (same
    // externalization lesson learned from firebase-admin/mongodb earlier).
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const amountPaise = Math.round(amountToCharge * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      // Razorpay caps `receipt` at 40 characters. itemType + a full 24-char
      // Mongo ObjectId + timestamp blew past that (49 chars for
      // "mentorship_<id>_<ts>"), which is exactly the kind of thing that
      // produces a generic 400 from their API. Use a 1-letter type code and
      // just the last 12 chars of the id — still unique enough for a
      // receipt label, well under the limit.
      receipt: `${data.itemType === "bundle" ? "b" : "m"}_${data.itemId.slice(-12)}_${Date.now()}`,
      // Coupon details are baked into the order's own notes at creation
      // time — this is the tamper-resistant source of truth verifyRazorpayPayment
      // reads back from Razorpay directly, rather than trusting whatever
      // the client resubmits at verification.
      notes: {
        uid: decoded.uid,
        itemType: data.itemType,
        itemId: data.itemId,
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

    // Re-fetch the order from Razorpay itself to read back whatever coupon
    // notes were attached at creation — this is the authoritative source,
    // not anything the client sends here. A tampered/replayed verify call
    // can't invent a discount that was never actually on the order.
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.fetch(data.razorpayOrderId);
    const notes = (order.notes ?? {}) as Record<string, string>;

    const hasCoupon = Boolean(notes.couponCode && notes.promoterId);
    const amountCharged = Number(order.amount) / 100; // what actually got charged, post-discount if a coupon applied

    // Upsert on (uid, itemType, itemId) so a retried/duplicate verification
    // call can't create two purchase records for the same item.
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
          ...(hasCoupon ? { couponCode: notes.couponCode, promoterId: notes.promoterId } : {}),
        },
      },
      { upsert: true },
    );

    // Record the promoter's sale — same upsert-on-identity idempotency as
    // the purchase write above, so a retried verify call never double-counts
    // a promoter's earnings for one purchase.
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
        // A failure here must never undo the already-confirmed purchase —
        // same "log and swallow" pattern as the confirmation email below.
        // Worst case the promoter's sale doesn't show up and needs a
        // manual reconciliation; the student's access is never affected.
        console.error(
          `[verifyRazorpayPayment] promoterSales write failed for uid=${decoded.uid}, itemId=${data.itemId}:`,
          err,
        );
      }
    }

    // Combined "congrats + payment successful" email. The payment is
    // already captured and the purchase record already written above, so a
    // failed send here must never undo the purchase or fail this request —
    // it's logged and swallowed, not thrown. Firebase's decoded ID token
    // carries the account's email directly, so no extra DB lookup is
    // needed to find where to send it.
    if (decoded.email) {
      try {
        await sendMail({
          to: decoded.email,
          subject: `Payment successful — ${title}`,
          html: purchaseConfirmationEmailHtml({
            itemTitle: title,
            itemType: data.itemType,
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