// GET /whats-new/feed.xml: Atom feed of the release notes (lib/whats-new.ts).
import { createFileRoute } from "@tanstack/react-router";
import { atomFeedXml } from "@/lib/whats-new";

export const Route = createFileRoute("/whats-new/feed.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(atomFeedXml(), {
          status: 200,
          headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
        }),
    },
  },
});
