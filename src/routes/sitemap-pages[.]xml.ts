// src/routes/sitemap-pages[.]xml.ts — GET /sitemap-pages.xml (static site pages)
import { createFileRoute } from "@tanstack/react-router";
import { staticEntries, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: async () => xmlResponse(urlsetXml(staticEntries())) } },
});
