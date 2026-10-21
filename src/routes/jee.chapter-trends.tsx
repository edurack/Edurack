// src/routes/jee.chapter-trends.tsx  →  /jee/chapter-trends
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { TRENDS_PATH } from "@/lib/jee-insights";
import { TRENDS_TITLE, trendsDescription, trendsFaq } from "@/lib/jee-extra-copy";
import { faqPageJsonLd } from "@/lib/jee-blueprint-copy";
import { TrendsView } from "@/components/jee/jee-extra-views";

export const Route = createFileRoute("/jee/chapter-trends")({
  head: () =>
    pageHead({
      title: TRENDS_TITLE,
      description: trendsDescription(),
      path: TRENDS_PATH,
      jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Chapter trends", path: TRENDS_PATH }]), faqPageJsonLd(trendsFaq())],
    }),
  component: TrendsView,
});
