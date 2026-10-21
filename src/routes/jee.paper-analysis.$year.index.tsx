// src/routes/jee.paper-analysis.$year.index.tsx  →  /jee/paper-analysis/<year>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { PAPER_BASE, analyzeYear, isJeeYear, paperSubjectPath, paperYearPath } from "@/lib/jee-paper-analysis";
import { yearDescription, yearFaq, yearTitle } from "@/lib/jee-extra-copy";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/jee-blueprint-copy";
import { PaperYearView } from "@/components/jee/jee-extra-views";
import { JeeNotFound } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee/paper-analysis/$year/")({
  loader: ({ params }) => {
    if (!isJeeYear(params.year)) throw notFound();
    return { year: params.year };
  },
  head: ({ loaderData }) => {
    const a = loaderData ? analyzeYear(loaderData.year) : undefined;
    if (!a) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    return pageHead({
      title: yearTitle(a.year),
      description: yearDescription(a),
      path: paperYearPath(a.year),
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "JEE paper analysis", path: PAPER_BASE },
          { name: a.year, path: paperYearPath(a.year) },
        ]),
        itemListJsonLd(`JEE Main ${a.year} analysis by subject`, a.subjects.map((s) => ({ name: `${s.subject.name} ${a.year} analysis`, url: `${SITE_URL}${paperSubjectPath(a.year, s.subject.key)}` }))),
        faqPageJsonLd(yearFaq(a)),
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: YearPage,
});

function YearPage() {
  const { year } = Route.useLoaderData();
  return <PaperYearView year={year} />;
}
