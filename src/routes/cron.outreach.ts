// GET /cron/outreach?key=<CRON_SECRET> — finishes outreach jobs left "running" (e.g. admin closed the tab).
// Schedule every 5–10 minutes alongside the streak-reminder cron. Fails closed without CRON_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { processOutreachJobs } from "@/server-functions/outreach";

export const Route = createFileRoute("/cron/outreach")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("CRON_SECRET is not configured", { status: 503 });
        const ok = new URL(request.url).searchParams.get("key") === secret || request.headers.get("authorization") === `Bearer ${secret}`;
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          return new Response(JSON.stringify(await processOutreachJobs()), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[cron.outreach] failed:", err);
          return new Response("Failed", { status: 500 });
        }
      },
    },
  },
});
