// src/routes/jee.chapter-wise-weightage.index.tsx  →  /jee/chapter-wise-weightage
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { JEE_BASE, getJeeSubjects } from "@/lib/jee-blueprint";
import { JEE_HUB_TITLE, faqPageJsonLd, itemListJsonLd, jeeHubDescription, jeeHubFaq } from "@/lib/jee-blueprint-copy";
import { JeeHubView } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee/chapter-wise-weightage/")({
  head: () =>
    pageHead({
      title: JEE_HUB_TITLE,
      description: jeeHubDescription(),
      path: JEE_BASE,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "JEE chapter-wise weightage", path: JEE_BASE },
        ]),
        itemListJsonLd(
          "JEE Main chapter-wise weightage by subject",
          getJeeSubjects().map((s) => ({ name: `JEE Main ${s.name} chapter-wise weightage`, url: `${SITE_URL}${JEE_BASE}/${s.key}` })),
        ),
        faqPageJsonLd(jeeHubFaq()),
      ],
    }),
  component: JeeHubView,
});
