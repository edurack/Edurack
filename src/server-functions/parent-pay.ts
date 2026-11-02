// "Ask a parent to pay": a signed-in student turns a Pro plan into a link their parent can open and pay from,
// with no account and no sign-in.
//
// How it stays safe:
//  • The link holds only a random token (stored as a SHA-256 hash). It does not hold the price: the price is
//    looked up from the plan when the parent pays, exactly as for a student's own checkout.
//  • The Razorpay order is made on our server, and its notes (written here, not by the browser) say whose
//    account gets Pro. The parent's browser can't change that, and verifyParentPayment checks the notes
//    against the link before granting anything.
//  • If the parent pays and closes the tab, the existing Razorpay webhook still finishes the purchase from
//    the same order notes (see settlePaymentFromWebhook in lib/payment-core.ts).
//  • A link works for LINK_DAYS days and stops accepting payments once it has been paid.
//
// node:crypto is imported dynamically (inside functions), never at the top level, for the same reason as in
// payments.ts: this file is reachable from client components.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { getCurrentRequest } from "@/lib/get-request";
import { PRO_FEATURES, type ProFeatureKey } from "@/lib/pro";
import { completeProPlanPayment, getRazorpayCredentials, lookupProPlan, markParentLinkPaid } from "@/lib/payment-core";

const LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Unpaid, unexpired links one student can hold at once, so the collection can't be filled by a script. */
const MAX_OPEN_LINKS = 10;
const SITE = (typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined) ?? "https://www.edurack.in";

type Db = Awaited<ReturnType<typeof getDb>>;

let indexed = false;
async function ensureIndexes(db: Db) {
  if (indexed) return;
  indexed = true;
  try {
    await db.collection("parentPayLinks").createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection("parentPayLinks").createIndex({ uid: 1, paidAt: 1, expiresAt: 1 });
  } catch (err) {
    console.error("[parent-pay] couldn't create indexes:", err);
  }
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

function clientIp(): string {
  const h = getCurrentRequest()?.headers;
  return h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || "unknown";
}

/** True when this caller is within `limit` attempts per minute for `key`. */
async function allowed(db: Db, key: string, limit: number): Promise<boolean> {
  const { hitRateLimit } = await import("@/lib/pyq-public-server");
  return hitRateLimit(db, key, limit, 60);
}

type LinkDoc = { _id: { toString(): string }; uid: string; planId: string; planName: string; expiresAt: Date; paidAt: Date | null };

async function findLink(db: Db, token: string): Promise<LinkDoc | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 80) return null;
  return (await db.collection("parentPayLinks").findOne({ tokenHash: await sha256(token) })) as unknown as LinkDoc | null;
}

const linkState = (l: LinkDoc): "ok" | "paid" | "expired" => (l.paidAt ? "paid" : l.expiresAt.getTime() < Date.now() ? "expired" : "ok");

async function studentFirstName(db: Db, uid: string): Promise<string | null> {
  const profile = await db.collection("profiles").findOne({ uid }, { projection: { fullName: 1 } });
  return String(profile?.fullName ?? "").trim().split(/\s+/)[0] || null;
}

// ─── Student: make a link ────────────────────────────────────────────────

export const createParentPayLink = createServerFn({ method: "POST" })
  .validator((data: { token: string; planId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    await ensureIndexes(db);
    if (!(await allowed(db, `pay:parentlink:${decoded.uid}`, 6))) throw new Error("Too many attempts. Please wait a minute and try again.");

    let plan: Awaited<ReturnType<typeof lookupProPlan>>;
    try {
      plan = await lookupProPlan(data.planId);
    } catch {
      throw new Error("This plan isn't available right now.");
    }

    const open = await db.collection("parentPayLinks").countDocuments({ uid: decoded.uid, paidAt: null, expiresAt: { $gt: new Date() } });
    if (open >= MAX_OPEN_LINKS) throw new Error("You already have several unpaid links. Ask a parent to use one of them, or try again in a few days.");

    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("base64url");
    const now = new Date();
    await db.collection("parentPayLinks").insertOne({
      tokenHash: await sha256(token),
      uid: decoded.uid,
      planId: data.planId,
      planName: plan.name,
      createdAt: now,
      expiresAt: new Date(now.getTime() + LINK_DAYS * DAY_MS),
      paidAt: null,
    });
    return { url: `${SITE}/pay/${token}`, planName: plan.name, price: plan.price, durationDays: plan.durationDays, validDays: LINK_DAYS };
  });

// ─── Parent: see the link, pay, confirm ──────────────────────────────────

// One member per state, so the page can tell them apart by `state` alone.
export type ParentPayView =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "unavailable" }
  | { state: "paid"; studentName: string | null }
  | { state: "ok"; studentName: string | null; planName: string; price: number; durationDays: number; features: string[] };

export const getParentPayLink = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<ParentPayView> => {
    const db = await getDb();
    if (!(await allowed(db, `pay:parentview:${clientIp()}`, 30))) throw new Error("Too many attempts. Please wait a minute and try again.");
    const link = await findLink(db, data.token);
    if (!link) return { state: "invalid" };
    const state = linkState(link);
    if (state === "expired") return { state: "expired" };
    const studentName = await studentFirstName(db, link.uid);
    if (state === "paid") return { state: "paid", studentName };
    try {
      const plan = await lookupProPlan(link.planId);
      return { state: "ok", studentName, planName: plan.name, price: plan.price, durationDays: plan.durationDays, features: plan.features.map((k: ProFeatureKey) => PRO_FEATURES[k].label) };
    } catch {
      return { state: "unavailable" };
    }
  });

export const createParentPayOrder = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    if (!(await allowed(db, `pay:parentorder:ip:${clientIp()}`, 12))) throw new Error("Too many attempts. Please wait a minute and try again.");
    const link = await findLink(db, data.token);
    if (!link) throw new Error("This payment link isn't valid.");
    const state = linkState(link);
    if (state === "paid") throw new Error("This link has already been paid. Thank you!");
    if (state === "expired") throw new Error("This link has expired. Please ask your child to send a new one.");
    const linkId = link._id.toString();
    if (!(await allowed(db, `pay:parentorder:link:${linkId}`, 6))) throw new Error("Too many attempts. Please wait a minute and try again.");

    let plan: Awaited<ReturnType<typeof lookupProPlan>>;
    try {
      plan = await lookupProPlan(link.planId); // today's price, not whatever the plan cost when the link was made
    } catch {
      throw new Error("This plan isn't available right now.");
    }
    const amountPaise = Math.round(plan.price * 100);
    if (amountPaise < 100) throw new Error("This amount is too low to charge online.");

    const { keyId, keySecret } = getRazorpayCredentials();
    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `pp_${linkId.slice(-12)}_${Date.now()}`,
      notes: {
        uid: link.uid,
        itemType: "proPlan",
        itemId: link.planId,
        originalPrice: String(plan.price),
        durationDays: String(plan.durationDays),
        planName: plan.name,
        features: plan.features.join(","),
        payer: "parent",
        parentLinkId: linkId,
      },
    });
    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId, itemTitle: plan.name };
  });

export const verifyParentPayment = createServerFn({ method: "POST" })
  .validator((data: { token: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const link = await findLink(db, data.token);
    if (!link) throw new Error("This payment link isn't valid.");

    const { keyId, keySecret } = getRazorpayCredentials();
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const expected = createHmac("sha256", keySecret).update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(data.razorpaySignature ?? ""));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Payment verification failed — signature mismatch.");

    const { default: Razorpay } = await import("razorpay");
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [order, payment] = await Promise.all([razorpay.orders.fetch(data.razorpayOrderId), razorpay.payments.fetch(data.razorpayPaymentId)]);
    const notes = (order.notes ?? {}) as Record<string, string>;

    // The signature only proves "this payment belongs to this order". The notes (written by createParentPayOrder)
    // say what the order was for, so a valid payment can't be replayed against a different link or plan.
    const linkId = link._id.toString();
    if (notes.parentLinkId !== linkId || notes.uid !== link.uid || notes.itemType !== "proPlan" || notes.itemId !== link.planId) {
      console.warn(`[verifyParentPayment] order/link mismatch: order=${data.razorpayOrderId} payment=${data.razorpayPaymentId}`);
      throw new Error("Payment verification failed — this payment doesn't match this link.");
    }
    if (payment.order_id !== data.razorpayOrderId || Number(payment.amount) !== Number(order.amount) || payment.status !== "captured") {
      throw new Error("Your payment is still being confirmed. If you were charged, Pro will switch on within a few minutes — please don't pay again.");
    }

    const profile = await db.collection("profiles").findOne({ uid: link.uid }, { projection: { email: 1 } });
    const { until } = await completeProPlanPayment({
      uid: link.uid,
      email: (profile?.email as string) || null,
      planId: link.planId,
      orderId: data.razorpayOrderId,
      paymentId: data.razorpayPaymentId,
      amountCharged: Number(order.amount) / 100,
      notes,
    });
    await markParentLinkPaid(linkId, data.razorpayPaymentId);
    return { ok: true, proUntil: until.toISOString() };
  });
