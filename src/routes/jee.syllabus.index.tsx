// src/routes/jee.syllabus.index.tsx  →  /jee/syllabus
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { SYLLABUS_BASE, syllabusKeys, syllabusPath } from "@/lib/jee-syllabus";
import { SYLLABUS_HUB_TITLE, syllabusHubDescription, syllabusHubFaq } from "@/lib/jee-extra-copy";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/jee-blueprint-copy";
import { SyllabusHubView } from "@/components/jee/jee-extra-views";

export const Route = createFileRoute("/jee/syllabus/")({
  head: () =>
    pageHead({
      title: SYLLABUS_HUB_TITLE,
      description: syllabusHubDescription(),
      path: SYLLABUS_BASE,
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "JEE Main syllabus", path: SYLLABUS_BASE }]),
        itemListJsonLd("JEE Main 2026 syllabus by paper", syllabusKeys().map((k) => ({ name: `JEE Main ${k} syllabus`, url: `${SITE_URL}${syllabusPath(k)}` }))),
        faqPageJsonLd(syllabusHubFaq()),
      ],
    }),
  component: SyllabusHubView,
});
