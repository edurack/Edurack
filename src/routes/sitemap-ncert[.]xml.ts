// src/routes/sitemap-ncert[.]xml.ts — GET /sitemap-ncert.xml?page=N
// One chunk of the indexable public NCERT Line-by-Line question pages (/ncert/...).
// The number of chunks is decided by the index at /sitemap.xml. While NCERT is not live there are no public pages,
// so this answers 404 (and the index does not list it).
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { isNcertLive, listNcertSitemapQuestions } from "@/lib/ncert-public-server";
import { questionEntry, sitemapUnavailable, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-ncert.xml")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const raw = new URL(request.url).searchParams.get("page") ?? "1";
        const page = Number(raw);
        if (!Number.isInteger(page) || page < 1 || page > 1000) return new Response("Not found", { status: 404 });

        try {
          const db = await getDb();
          if (!(await isNcertLive(db))) return new Response("Not found", { status: 404 });
          const rows = await listNcertSitemapQuestions(db, page);
          return xmlResponse(urlsetXml(rows.map((r) => questionEntry(`${SITE_URL}${r.path}`, r.lastmod))));
        } catch (err) {
          return sitemapUnavailable(`ncert page ${page}`, err);
        }
      },
    },
  },
});
