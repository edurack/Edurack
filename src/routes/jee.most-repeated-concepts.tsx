// src/routes/jee.most-repeated-concepts.tsx  →  /jee/most-repeated-concepts
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { JEE_CONCEPTS_PATH } from "@/lib/jee-blueprint";
import { JEE_CONCEPTS_TITLE, faqPageJsonLd, jeeConceptsDescription, jeeConceptsFaq } from "@/lib/jee-blueprint-copy";
import { JeeConceptsView } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee/most-repeated-concepts")({
  head: () =>
    pageHead({
      title: JEE_CONCEPTS_TITLE,
      description: jeeConceptsDescription(),
      path: JEE_CONCEPTS_PATH,
      jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Most repeated concepts", path: JEE_CONCEPTS_PATH }]), faqPageJsonLd(jeeConceptsFaq())],
    }),
  component: JeeConceptsView,
});
