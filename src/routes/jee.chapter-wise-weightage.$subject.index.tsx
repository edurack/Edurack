// src/routes/jee.chapter-wise-weightage.$subject.index.tsx  →  /jee/chapter-wise-weightage/<subject>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { JEE_BASE, getJeeSubject, jeeChapterPath, jeeSubjectPath } from "@/lib/jee-blueprint";
import { faqPageJsonLd, itemListJsonLd, jeeSubjectDescription, jeeSubjectFaq, jeeSubjectTitle } from "@/lib/jee-blueprint-copy";
import { JeeNotFound, JeeSubjectView } from "@/components/jee/jee-views";
import { getJeeLibrarySummary } from "@/server-functions/jee-resources";

export const Route = createFileRoute("/jee/chapter-wise-weightage/$subject/")({
  loader: async ({ params }) => {
    if (!getJeeSubject(params.subject)) throw notFound();
    return { subjectKey: params.subject, resources: await getJeeLibrarySummary() };
  },
  head: ({ loaderData }) => {
    const s = loaderData ? getJeeSubject(loaderData.subjectKey) : undefined;
    if (!s) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    return pageHead({
      title: jeeSubjectTitle(s),
      description: jeeSubjectDescription(s),
      path: jeeSubjectPath(s.key),
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "JEE chapter-wise weightage", path: JEE_BASE },
          { name: s.name, path: jeeSubjectPath(s.key) },
        ]),
        itemListJsonLd(
          `JEE Main ${s.name} chapters by weightage`,
          s.chapters.map((c) => ({ name: c.name, url: `${SITE_URL}${jeeChapterPath(s.key, c.slug)}` })),
        ),
        faqPageJsonLd(jeeSubjectFaq(s)),
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectKey, resources } = Route.useLoaderData();
  return <JeeSubjectView subjectKey={subjectKey} resources={resources} />;
}
