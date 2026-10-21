// src/routes/jee.paper-analysis.index.tsx  →  /jee/paper-analysis
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { YEARS } from "@/lib/jee-blueprint";
import { PAPER_BASE, paperYearPath } from "@/lib/jee-paper-analysis";
import { PAPER_HUB_TITLE, paperHubDescription, paperHubFaq } from "@/lib/jee-extra-copy";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/jee-blueprint-copy";
import { PaperHubView } from "@/components/jee/jee-extra-views";

export const Route = createFileRoute("/jee/paper-analysis/")({
  head: () =>
    pageHead({
      title: PAPER_HUB_TITLE,
      description: paperHubDescription(),
      path: PAPER_BASE,
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "JEE paper analysis", path: PAPER_BASE }]),
        itemListJsonLd("JEE Main paper analysis by year", [...YEARS].reverse().map((y) => ({ name: `JEE Main ${y} paper analysis`, url: `${SITE_URL}${paperYearPath(y)}` }))),
        faqPageJsonLd(paperHubFaq()),
      ],
    }),
  component: PaperHubView,
});
