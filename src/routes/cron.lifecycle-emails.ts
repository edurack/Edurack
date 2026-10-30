// GET /cron/lifecycle-emails?key=<CRON_SECRET>   (add &dry=1 to preview without sending)
// Point the same scheduler as /cron/streak-reminders at it, every 10 minutes. It only sends between 17:00 and 21:00 IST.
// Like the streak route this FAILS CLOSED: with no CRON_SECRET configured it refuses to run, because it emails students.
import { createFileRoute } from "@tanstack/react-router";
import { sendLifecycleEmails } from "@/server-functions/lifecycle-emails";

export const Route = createFileRoute("/cron/lifecycle-emails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("CRON_SECRET is not configured", { status: 503 });
        const url = new URL(request.url);
        const ok = url.searchParams.get("key") === secret || request.headers.get("authorization") === `Bearer ${secret}`;
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const result = await sendLifecycleEmails(new Date(), { dryRun: url.searchParams.get("dry") === "1" });
          return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[cron.lifecycle-emails] failed:", err);
          return new Response("Sweep failed", { status: 500 });
        }
      },
    },
  },
});
