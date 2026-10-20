// src/routes/sitemap[.]xml.ts
//
// TanStack Start Server Route — serves GET /sitemap.xml as a SITEMAP INDEX.
// The URLs themselves live in the child sitemaps below (each well under
// Google's 50,000-url / 50 MB per-file limit). robots.txt keeps pointing here.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { countSitemapQuestionPages } from "@/lib/pyq-public-server";
import { sitemapIndexXml, xmlResponse, SITEMAP_CACHE } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let questionPages = 1;
        let degraded = false;
        try {
          questionPages = await countSitemapQuestionPages(await getDb());
        } catch (err) {
          // Still list page 1 so the index is valid; keep the short cache so the real count returns soon.
          console.error("[sitemap] question page count failed:", err);
          degraded = true;
        }

        const locs = [
          `${SITE_URL}/sitemap-pages.xml`,
          `${SITE_URL}/sitemap-neet.xml`,
          `${SITE_URL}/sitemap-jee.xml`,
          `${SITE_URL}/sitemap-blog.xml`,
          `${SITE_URL}/sitemap-mentors.xml`,
          ...Array.from({ length: questionPages }, (_, i) => `${SITE_URL}/sitemap-questions.xml?page=${i + 1}`),
        ];
        return xmlResponse(sitemapIndexXml(locs), degraded ? "public, s-maxage=60" : SITEMAP_CACHE);
      },
    },
  },
});
