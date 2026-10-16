// GET /cron/session-reminders?key=<CRON_SECRET>   (add &dry=1 to preview without sending)
// Point any scheduler (cron-job.org, GitHub Actions, crontab+curl) at it every 10–15 minutes.
// FAILS CLOSED like cron.streak-reminders.ts: with no CRON_SECRET configured it refuses to run,
// because this route sends real emails to students and mentors.
import { createFileRoute } from "@tanstack/react-router";
import { sendSessionReminders } from "@/server-functions/session-reminders";

export const Route = createFileRoute("/cron/session-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("CRON_SECRET is not configured", { status: 503 });
        const url = new URL(request.url);
        const ok = url.searchParams.get("key") === secret || request.headers.get("authorization") === `Bearer ${secret}`;
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const result = await sendSessionReminders(new Date(), { dryRun: url.searchParams.get("dry") === "1" });
          return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[cron.session-reminders] failed:", err);
          return new Response("Sweep failed", { status: 500 });
        }
      },
    },
  },
});
