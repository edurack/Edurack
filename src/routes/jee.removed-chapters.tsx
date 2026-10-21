// src/routes/jee.removed-chapters.tsx  →  /jee/removed-chapters
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { REMOVED_PATH } from "@/lib/jee-insights";
import { REMOVED_TITLE, removedDescription, removedFaq } from "@/lib/jee-extra-copy";
import { faqPageJsonLd } from "@/lib/jee-blueprint-copy";
import { RemovedView } from "@/components/jee/jee-extra-views";

export const Route = createFileRoute("/jee/removed-chapters")({
  head: () =>
    pageHead({
      title: REMOVED_TITLE,
      description: removedDescription(),
      path: REMOVED_PATH,
      jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Removed chapters", path: REMOVED_PATH }]), faqPageJsonLd(removedFaq())],
    }),
  component: RemovedView,
});
