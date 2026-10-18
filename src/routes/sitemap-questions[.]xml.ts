// src/routes/sitemap-questions[.]xml.ts — GET /sitemap-questions.xml?page=N
// One chunk (SITEMAP_QUESTIONS_PER_FILE) of the indexable public PYQ pages.
// The number of chunks is decided by the index at /sitemap.xml.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { listSitemapQuestions } from "@/lib/pyq-public-server";
import { questionEntry, sitemapUnavailable, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-questions.xml")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const raw = new URL(request.url).searchParams.get("page") ?? "1";
        const page = Number(raw);
        if (!Number.isInteger(page) || page < 1 || page > 1000) return new Response("Not found", { status: 404 });

        try {
          const rows = await listSitemapQuestions(await getDb(), page);
          return xmlResponse(urlsetXml(rows.map((r) => questionEntry(`${SITE_URL}${r.path}`, r.lastmod))));
        } catch (err) {
          return sitemapUnavailable(`questions page ${page}`, err);
        }
      },
    },
  },
});
