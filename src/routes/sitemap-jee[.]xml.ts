// src/routes/sitemap-jee[.]xml.ts — GET /sitemap-jee.xml
// JEE Main chapter-wise weightage pages (hub, subjects, chapters), most-repeated concepts and the published
// JEE Main 2027 resource pages. The weightage pages are static data; the resource pages come from the database.
import { createFileRoute } from "@tanstack/react-router";
import { jeeEntries, jeeResourceEntries, sitemapUnavailable, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-jee.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return xmlResponse(urlsetXml([...jeeEntries(), ...(await jeeResourceEntries())]));
        } catch (err) {
          return sitemapUnavailable("jee", err);
        }
      },
    },
  },
});
