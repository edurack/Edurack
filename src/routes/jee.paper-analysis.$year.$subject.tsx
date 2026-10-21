// src/routes/jee.paper-analysis.$year.$subject.tsx  →  /jee/paper-analysis/<year>/<subject>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { PAPER_BASE, analyzeSubjectYear, paperSubjectPath, paperYearPath } from "@/lib/jee-paper-analysis";
import { yearSubjectDescription, yearSubjectFaq, yearSubjectTitle } from "@/lib/jee-extra-copy";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/jee-blueprint-copy";
import { PaperSubjectView } from "@/components/jee/jee-extra-views";
import { JeeNotFound } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee/paper-analysis/$year/$subject")({
  loader: ({ params }) => {
    if (!analyzeSubjectYear(params.year, params.subject)) throw notFound();
    return { year: params.year, subjectKey: params.subject };
  },
  head: ({ loaderData }) => {
    const sy = loaderData ? analyzeSubjectYear(loaderData.year, loaderData.subjectKey) : undefined;
    if (!sy) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const path = paperSubjectPath(sy.year, sy.subject.key);
    return pageHead({
      title: yearSubjectTitle(sy.year, sy),
      description: yearSubjectDescription(sy),
      path,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "JEE paper analysis", path: PAPER_BASE },
          { name: sy.year, path: paperYearPath(sy.year) },
          { name: sy.subject.name, path },
        ]),
        itemListJsonLd(`JEE Main ${sy.year} ${sy.subject.name}: chapters by questions`, sy.rows.slice(0, 10).map((r) => ({ name: r.chapter.name }))),
        faqPageJsonLd(yearSubjectFaq(sy)),
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: SubjectYearPage,
});

function SubjectYearPage() {
  const { year, subjectKey } = Route.useLoaderData();
  return <PaperSubjectView year={year} subjectKey={subjectKey} />;
}
