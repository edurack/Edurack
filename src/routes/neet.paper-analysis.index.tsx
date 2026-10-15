// src/routes/neet.paper-analysis.index.tsx  →  /neet/paper-analysis
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/neet-blueprint-copy";
import { PAPER_BASE, PAPER_SLUGS, analyzePaper, paperPath } from "@/lib/neet-paper-analysis";
import { PaperIndexView } from "@/components/neet/seo-pages";

export const Route = createFileRoute("/neet/paper-analysis/")({
  head: () =>
    pageHead({
      title: "NEET Paper Analysis 2020-2026, Chapter-wise",
      description: "NEET paper analysis for every year from 2020 to 2026: chapter-wise question counts, most-asked topics and what changed from the previous paper.",
      path: PAPER_BASE,
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "NEET paper analysis", path: PAPER_BASE }]),
        itemListJsonLd("NEET paper analysis by year", PAPER_SLUGS.map((s) => ({ name: `${analyzePaper(s)!.label} paper analysis`, url: `${SITE_URL}${paperPath(s)}` }))),
      ],
    }),
  component: PaperIndexView,
});
