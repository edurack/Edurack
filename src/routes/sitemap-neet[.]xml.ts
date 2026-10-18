// src/routes/sitemap-neet[.]xml.ts — GET /sitemap-neet.xml
// Chapter-wise weightage pages, free tools, paper analysis, topics, printable sheets.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { blueprintEntries, seoEntries, sheetEntries, sitemapUnavailable, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-neet.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sheets = await sheetEntries(await getDb());
          return xmlResponse(urlsetXml([...blueprintEntries(), ...seoEntries(), ...sheets]));
        } catch (err) {
          return sitemapUnavailable("neet", err);
        }
      },
    },
  },
});
