// src/routes/jee.high-weightage-chapters.tsx  →  /jee/high-weightage-chapters
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { HIGH_WEIGHT_PATH } from "@/lib/jee-insights";
import { HIGH_TITLE, highDescription, highFaq } from "@/lib/jee-extra-copy";
import { faqPageJsonLd } from "@/lib/jee-blueprint-copy";
import { HighWeightView } from "@/components/jee/jee-extra-views";

export const Route = createFileRoute("/jee/high-weightage-chapters")({
  head: () =>
    pageHead({
      title: HIGH_TITLE,
      description: highDescription(),
      path: HIGH_WEIGHT_PATH,
      jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "High-weightage chapters", path: HIGH_WEIGHT_PATH }]), faqPageJsonLd(highFaq())],
    }),
  component: HighWeightView,
});
