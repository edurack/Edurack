// src/routes/jee.syllabus.$subject.tsx
//   →  /jee/syllabus/<physics | chemistry | maths | paper-2a-barch | paper-2b-bplanning>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { getJeeSubject } from "@/lib/jee-blueprint";
import { SYLLABUS_BASE, getPaper2, syllabusPath, syllabusUnits } from "@/lib/jee-syllabus";
import { paper2Description, paper2Faq, paper2Title, syllabusSubjectDescription, syllabusSubjectFaq, syllabusSubjectTitle } from "@/lib/jee-extra-copy";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/jee-blueprint-copy";
import { Paper2View, SyllabusSubjectView } from "@/components/jee/jee-extra-views";
import { JeeNotFound } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee/syllabus/$subject")({
  loader: ({ params }) => {
    if (!getJeeSubject(params.subject) && !getPaper2(params.subject)) throw notFound();
    return { key: params.subject };
  },
  head: ({ loaderData }) => {
    const key = loaderData?.key;
    const subject = key ? getJeeSubject(key) : undefined;
    const paper2 = key ? getPaper2(key) : undefined;
    if (!key || (!subject && !paper2)) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const crumbs = (name: string) =>
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "JEE Main syllabus", path: SYLLABUS_BASE },
        { name, path: syllabusPath(key) },
      ]);
    if (subject) {
      return pageHead({
        title: syllabusSubjectTitle(subject.short),
        description: syllabusSubjectDescription(key),
        path: syllabusPath(key),
        jsonLd: [
          crumbs(subject.name),
          itemListJsonLd(`JEE Main ${subject.name} syllabus units`, syllabusUnits(key).map((u) => ({ name: `Unit ${u.unit}: ${u.chapter.name}` }))),
          faqPageJsonLd(syllabusSubjectFaq(key)),
        ],
      });
    }
    const p = paper2!;
    return pageHead({ title: paper2Title(p), description: paper2Description(p), path: syllabusPath(key), jsonLd: [crumbs(p.name), faqPageJsonLd(paper2Faq(p))] });
  },
  notFoundComponent: JeeNotFound,
  component: SyllabusPage,
});

function SyllabusPage() {
  const { key } = Route.useLoaderData();
  return getPaper2(key) ? <Paper2View paperKey={key} /> : <SyllabusSubjectView subjectKey={key} />;
}
