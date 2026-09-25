// src/routes/cron.blog-publish.ts  →  GET /cron/blog-publish
//
// Wire a Vercel Cron (vercel.json) to hit this every 5–10 minutes:
//   { "crons": [{ "path": "/cron/blog-publish", "schedule": "*/5 * * * *" }] }
// Same shape as the existing session-reminders.ts cron target: a thin
// route that calls one plain exported function. Idempotent — see the
// comment on publishDueScheduledPosts in blog-admin.ts.
//
// Protect it with a shared secret so it isn't a public "publish everything
// due right now" trigger anyone can hit — set CRON_SECRET in your env and
// configure Vercel Cron to send it (Vercel Cron requests already carry an
// Authorization header automatically when CRON_SECRET is set as a project
// env var; this checks for it).
import { createFileRoute } from "@tanstack/react-router";
import { publishDueScheduledPosts } from "@/server-functions/blog-admin";

export const Route = createFileRoute("/cron/blog-publish")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) {
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
