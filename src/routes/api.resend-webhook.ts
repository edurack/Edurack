// POST /api/resend-webhook : receives Resend delivery events and blocks addresses that bounce or report spam.
// Setup: Resend dashboard → Webhooks → Add → URL https://www.edurack.in/api/resend-webhook,
// events: email.bounced + email.complained. Copy the signing secret into RESEND_WEBHOOK_SECRET.
// Fails closed: no secret configured, or a bad/old signature, means nothing is processed.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { handleResendEvent } from "@/lib/email-guard";
import { verifySvix } from "@/lib/webhook-verify";
import type { ResendEvent } from "@/lib/email-policy";

export const Route = createFileRoute("/api/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) return new Response("RESEND_WEBHOOK_SECRET is not configured", { status: 503 });

        const body = await request.text(); // raw body: the signature covers these exact bytes
        const id = request.headers.get("svix-id");
        const ok = verifySvix({ secret, id, timestamp: request.headers.get("svix-timestamp"), signatureHeader: request.headers.get("svix-signature"), body });
        if (!ok || !id) return new Response("Invalid signature", { status: 401 });

        let evt: ResendEvent;
        try {
          evt = JSON.parse(body) as ResendEvent;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        try {
          const result = await handleResendEvent(await getDb(), id, evt);
          return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[resend-webhook] failed:", err);
          return new Response("Processing failed", { status: 500 }); // non-200 → Resend retries
        }
      },
    },
  },
});
