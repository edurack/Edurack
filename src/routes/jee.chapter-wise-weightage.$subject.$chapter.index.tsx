// src/routes/jee.chapter-wise-weightage.$subject.$chapter.index.tsx
//   →  /jee/chapter-wise-weightage/<subject>/<chapter>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { JEE_BASE, JEE_RANGE, conceptsForChapter, getJeeChapter, getJeeSubject, jeeChapterPath, jeeSubjectPath } from "@/lib/jee-blueprint";
import { faqPageJsonLd, itemListJsonLd, jeeChapterDescription, jeeChapterFaq, jeeChapterTitle } from "@/lib/jee-blueprint-copy";
import { JeeChapterView, JeeNotFound } from "@/components/jee/jee-views";
import { getJeeLibrarySummary } from "@/server-functions/jee-resources";

export const Route = createFileRoute("/jee/chapter-wise-weightage/$subject/$chapter/")({
  loader: async ({ params }) => {
    if (!getJeeChapter(params.subject, params.chapter)) throw notFound();
    return { subjectKey: params.subject, slug: params.chapter, resources: await getJeeLibrarySummary() };
  },
  head: ({ loaderData }) => {
    const s = loaderData ? getJeeSubject(loaderData.subjectKey) : undefined;
    const c = loaderData ? getJeeChapter(loaderData.subjectKey, loaderData.slug) : undefined;
    if (!s || !c) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const path = jeeChapterPath(s.key, c.slug);
    const ks = conceptsForChapter(c).slice(0, 10);
    return pageHead({
      title: jeeChapterTitle(c),
      description: jeeChapterDescription(c),
      path,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "JEE chapter-wise weightage", path: JEE_BASE },
          { name: s.name, path: jeeSubjectPath(s.key) },
          { name: c.name, path },
        ]),
        faqPageJsonLd(jeeChapterFaq(c, s)),
        ...(ks.length ? [itemListJsonLd(`${c.name}: most repeated JEE Main concepts ${JEE_RANGE}`, ks.map((k) => ({ name: k.name })))] : []),
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: ChapterPage,
});

function ChapterPage() {
  const { subjectKey, slug, resources } = Route.useLoaderData();
  return <JeeChapterView subjectKey={subjectKey} chapterSlug={slug} resources={resources} />;
}
