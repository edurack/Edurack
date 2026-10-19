// src/routes/neet.paper-analysis.$year.$subject.tsx  →  /neet/paper-analysis/<year>/<subject>
// e.g. /neet/paper-analysis/2024/physics. 404 when the subject had no question in that paper.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { chapterPath } from "@/lib/neet-blueprint";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/neet-blueprint-copy";
import { PAPER_BASE, paperPath } from "@/lib/neet-paper-analysis";
import { analyzePaperSubject, paperSubjectDescription, paperSubjectFaq, paperSubjectPath, paperSubjectTitle } from "@/lib/neet-paper-subject";
import { PaperSubjectView } from "@/components/neet/seo-pages";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";

export const Route = createFileRoute("/neet/paper-analysis/$year/$subject")({
  loader: ({ params }) => {
    if (!analyzePaperSubject(params.year, params.subject)) throw notFound();
    return { year: params.year, subject: params.subject };
  },
  head: ({ loaderData }) => {
    const a = loaderData ? analyzePaperSubject(loaderData.year, loaderData.subject) : null;
    if (!a) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const path = paperSubjectPath(a.slug, a.subject.key);
    return pageHead({
      title: paperSubjectTitle(a),
      description: paperSubjectDescription(a),
      path,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "NEET paper analysis", path: PAPER_BASE },
          { name: a.label, path: paperPath(a.slug) },
          { name: a.subject.name, path },
        ]),
        faqPageJsonLd(paperSubjectFaq(a)),
        // The ten chapters that asked the most, each linking to its own weightage page.
        itemListJsonLd(
          `${a.label} ${a.subject.name}: chapters with the most questions`,
          a.chapters.slice(0, 10).map((r) => ({ name: r.chapter.name, url: `${SITE_URL}${chapterPath(a.subject.key, r.chapter.slug)}` })),
        ),
      ],
    });
  },
  notFoundComponent: BlueprintNotFound,
  component: Page,
});

function Page() {
  const { year, subject } = Route.useLoaderData();
  return <PaperSubjectView paperSlug={year} subjectKey={subject} faqs={paperSubjectFaq(analyzePaperSubject(year, subject)!)} />;
}
