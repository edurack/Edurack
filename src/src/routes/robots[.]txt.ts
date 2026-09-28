// src/routes/robots[.]txt.ts — serves GET /robots.txt
// If you already have public/robots.txt, delete one of the two.
import { createFileRoute } from "@tanstack/react-router";

const BODY = `User-agent: *
Allow: /

# Private / per-user areas — no search value
Disallow: /admin
Disallow: /mentor/
Disallow: /promoter
Disallow: /intern/
Disallow: /dashboard
Disallow: /profile
Disallow: /purchases
Disallow: /my-sessions
Disallow: /tickets
Disallow: /test/
Disallow: /test-result/
Disallow: /test-analysis/
Disallow: /lecture/
Disallow: /auth
Disallow: /forgot-password
Disallow: /cron

Sitemap: https://www.edurack.in/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(BODY, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
