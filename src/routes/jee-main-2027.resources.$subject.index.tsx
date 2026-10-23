// src/routes/jee-main-2027.resources.$subject.index.tsx  →  /jee-main-2027/resources/<subject>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, noindexHead, pageHead } from "@/lib/seo";
import { getJeeSubject } from "@/lib/jee-blueprint";
import { JEE_LIBRARY_YEAR, JEE_LIB_BASE, jeeLibChapterPath, jeeLibSubjectPath } from "@/lib/jee-resource-types";
import { getJeeLibrarySummary } from "@/server-functions/jee-resources";
import { JeeLibrarySubjectView } from "@/components/jee/jee-resource-views";
import { JeeNotFound } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee-main-2027/resources/$subject/")({
  loader: async ({ params }) => {
    if (!getJeeSubject(params.subject)) throw notFound();
    return { subjectKey: params.subject, summary: await getJeeLibrarySummary() };
  },
  head: ({ loaderData }) => {
    const s = loaderData ? getJeeSubject(loaderData.subjectKey) : undefined;
    if (!s || !loaderData) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const count = loaderData.summary.bySubject[s.key] ?? 0;
    const title = `JEE Main ${JEE_LIBRARY_YEAR} ${s.name} Notes & Practice Sheets`;
    if (!count) return noindexHead(title, `JEE Main ${JEE_LIBRARY_YEAR} ${s.name} chapter-wise resources from Edurack.`);
    const chapters = s.chapters.filter((c) => !c.retired && loaderData.summary.byChapter[`${s.key}/${c.slug}`]);
    return pageHead({
      title,
      description: `Download ${s.name} chapter-wise PDF notes, revision sheets and practice sheets for JEE Main ${JEE_LIBRARY_YEAR}. ${count} resource${count === 1 ? "" : "s"} across ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}.`,
      path: jeeLibSubjectPath(s.key),
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: `JEE Main ${JEE_LIBRARY_YEAR} resources`, path: JEE_LIB_BASE },
          { name: s.name, path: jeeLibSubjectPath(s.key) },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${title}: chapters`,
          itemListElement: chapters.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${SITE_URL}${jeeLibChapterPath(s.key, c.slug)}` })),
        },
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectKey, summary } = Route.useLoaderData();
  return <JeeLibrarySubjectView subjectKey={subjectKey} summary={summary} />;
}
