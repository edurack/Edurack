// src/routes/neet.chapter-wise-weightage.index.tsx  →  /neet/chapter-wise-weightage
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { BLUEPRINT_BASE, getSubjects } from "@/lib/neet-blueprint";
import { HUB_TITLE, faqPageJsonLd, hubDescription, hubFaq, itemListJsonLd } from "@/lib/neet-blueprint-copy";
import { HubView } from "@/components/neet/blueprint-views";

export const Route = createFileRoute("/neet/chapter-wise-weightage/")({
  head: () =>
    pageHead({
      title: HUB_TITLE,
      description: hubDescription(),
      path: BLUEPRINT_BASE,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "NEET chapter-wise weightage", path: BLUEPRINT_BASE },
        ]),
        itemListJsonLd(
          "NEET chapter-wise weightage by subject",
          getSubjects().map((s) => ({ name: `NEET ${s.name} chapter-wise weightage`, url: `${SITE_URL}${BLUEPRINT_BASE}/${s.key}` })),
        ),
        faqPageJsonLd(hubFaq()),
      ],
    }),
  component: HubView,
});
