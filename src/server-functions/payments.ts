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

// ─── Create order ──────────────────────────────────────────────────────────
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemType: ItemType; itemId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireSignedIn(data.token);
    const { keyId, keySecret } = getRazorpayCredentials();
    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);

    // Razorpay's Node SDK is CJS; import it dynamically so it isn't pulled
    // into the SSR bundle unless this function actually runs (same
    // externalization lesson learned from firebase-admin/mongodb earlier).
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const amountPaise = Math.round(sellingPrice * 100);
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
      notes: { uid: decoded.uid, itemType: data.itemType, itemId: data.itemId },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      itemTitle: title,
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
    const { keySecret } = getRazorpayCredentials();

    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== data.razorpaySignature) {
      throw new Error("Payment verification failed — signature mismatch.");
    }

    const { sellingPrice, title } = await lookupItemPriceAndTitle(data.itemType, data.itemId);
    const db = await getDb();

    // Upsert on (uid, itemType, itemId) so a retried/duplicate verification
    // call can't create two purchase records for the same item.
    await db.collection("purchases").updateOne(
      { uid: decoded.uid, itemType: data.itemType, itemId: data.itemId },
      {
        $set: {
          uid: decoded.uid,
          itemType: data.itemType,
          itemId: data.itemId,
          amount: sellingPrice,
          razorpayOrderId: data.razorpayOrderId,
          razorpayPaymentId: data.razorpayPaymentId,
          purchasedAt: new Date(),
        },
      },
      { upsert: true },
    );

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
            amount: sellingPrice,
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