// src/routes/sitemap-jee[.]xml.ts — GET /sitemap-jee.xml
// JEE Main chapter-wise weightage pages (hub, subjects, chapters) and most-repeated concepts. Static data.
import { createFileRoute } from "@tanstack/react-router";
import { jeeEntries, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-jee.xml")({
  server: {
    handlers: {
      GET: async () => xmlResponse(urlsetXml(jeeEntries())),
    },
  },
});
