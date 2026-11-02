// GET /cron/checkout-reminders?key=<CRON_SECRET>   (add &dry=1 to preview without sending)
// Point any scheduler (cron-job.org, GitHub Actions, crontab+curl) at it every 15 to 30 minutes so the reminder
// goes out about an hour after a student stops paying. Run once a day instead and it still works, just later.
// Like cron.streak-reminders.ts this FAILS CLOSED: with no CRON_SECRET configured it refuses to run,
// because this route sends real emails to students.
import { createFileRoute } from "@tanstack/react-router";
import { sendCheckoutReminders } from "@/server-functions/checkout-reminders";

export const Route = createFileRoute("/cron/checkout-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("CRON_SECRET is not configured", { status: 503 });
        const url = new URL(request.url);
        const ok = url.searchParams.get("key") === secret || request.headers.get("authorization") === `Bearer ${secret}`;
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const result = await sendCheckoutReminders(new Date(), { dryRun: url.searchParams.get("dry") === "1" });
          return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err) {
          console.error("[cron.checkout-reminders] failed:", err);
          return new Response("Sweep failed", { status: 500 });
        }
      },
    },
  },
});
