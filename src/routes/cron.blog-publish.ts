// src/routes/cron.blog-publish.ts  →  GET /cron/blog-publish
//
// Deliberately platform-agnostic — not tied to any one hosting provider's
// cron product. Point ANY external scheduler (cron-job.org, EasyCron,
// GitHub Actions on a schedule, your own server's crontab hitting curl,
// etc.) at this URL every 5–10 minutes and it just works. Same shape as
// the existing session-reminders.ts cron target either way: a thin route
// that calls one plain exported function. Idempotent — see the comment on
// publishDueScheduledPosts in blog-admin.ts, so an occasional missed or
// doubled-up tick is harmless.
//
// Protect it with a shared secret so it isn't a public "publish everything
// due right now" trigger anyone can hit. Set CRON_SECRET in your env, then
// point your scheduler at EITHER of:
//   https://edurack.in/cron/blog-publish?key=<CRON_SECRET>          (works
//     with any scheduler — most free/simple cron services can't set
//     custom headers, but every one of them can hit a URL with a query
//     string, so this is the one to use unless you know your service
//     supports custom headers)
//   Authorization: Bearer <CRON_SECRET>                              (use
//     this instead if your scheduler does support custom headers)
// Leaving CRON_SECRET unset disables the check entirely — fine while
// you're first wiring this up, but set it before the URL is public.
import { createFileRoute } from "@tanstack/react-router";
import { publishDueScheduledPosts } from "@/server-functions/blog-admin";

export const Route = createFileRoute("/cron/blog-publish")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const url = new URL(request.url);
          const queryKey = url.searchParams.get("key");
          const authHeader = request.headers.get("authorization");
          const authorized = queryKey === secret || authHeader === `Bearer ${secret}`;
          if (!authorized) {
            return new Response("Unauthorized", { status: 401 });
          }
        }
        try {
          const result = await publishDueScheduledPosts();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[cron.blog-publish] sweep failed:", err);
          return new Response("Sweep failed", { status: 500 });
        }
      },
    },
  },
});
