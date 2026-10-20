// POST /api/razorpay-webhook : completes purchases for payments Razorpay has captured, so a student who
// paid and then closed the tab (or whose browser verify call failed) still gets what they paid for.
// Setup: Razorpay dashboard → Settings → Webhooks → Add new webhook →
//   URL https://www.edurack.in/api/razorpay-webhook, events: payment.captured and order.paid,
//   and a secret of your choice, saved as RAZORPAY_WEBHOOK_SECRET (this is NOT the API key secret).
// Fails closed: no secret configured, or a bad signature, means nothing is processed. Every outcome is
// idempotent (see lib/payment-core.ts), so repeated or out-of-order deliveries are harmless.
import { createFileRoute } from "@tanstack/react-router";
import { verifyRazorpayWebhook } from "@/lib/razorpay-webhook";
import { settlePaymentFromWebhook } from "@/lib/payment-core";

export const Route = createFileRoute("/api/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("RAZORPAY_WEBHOOK_SECRET is not configured", { status: 503 });

        const body = await request.text(); // raw body: the signature covers these exact bytes
        if (!verifyRazorpayWebhook(body, request.headers.get("x-razorpay-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let evt: { event?: string; payload?: { payment?: { entity?: { id?: string } } } };
        try {
          evt = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const paymentId = evt.payload?.payment?.entity?.id;
        if ((evt.event !== "payment.captured" && evt.event !== "order.paid") || !paymentId) {
          return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        try {
          const result = await settlePaymentFromWebhook(paymentId);
          // Too new: the student's own browser is probably finishing the purchase. Ask Razorpay to retry later.
          if (result === "too-fresh") return new Response("Try again shortly", { status: 503, headers: { "Retry-After": "300" } });
          return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[razorpay-webhook] failed:", err);
          return new Response("Processing failed", { status: 500 }); // non-200 → Razorpay retries
        }
      },
    },
  },
});
