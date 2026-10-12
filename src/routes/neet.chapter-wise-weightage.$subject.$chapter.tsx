// src/routes/neet.chapter-wise-weightage.$subject.$chapter.tsx
//   →  /neet/chapter-wise-weightage/<subject>/<chapter>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { BLUEPRINT_BASE, chapterPath, getChapter, getSubject, subjectPath } from "@/lib/neet-blueprint";
import { chapterDescription, chapterFaq, chapterTitle, faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { ChapterView } from "@/components/neet/blueprint-views";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";

export const Route = createFileRoute("/neet/chapter-wise-weightage/$subject/$chapter")({
  loader: ({ params }) => {
    if (!getChapter(params.subject, params.chapter)) throw notFound();
    return { subjectKey: params.subject, slug: params.chapter };
  },
  head: ({ loaderData }) => {
    const subject = loaderData ? getSubject(loaderData.subjectKey) : undefined;
    const c = loaderData ? getChapter(loaderData.subjectKey, loaderData.slug) : undefined;
    if (!subject || !c) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const path = chapterPath(subject.key, c.slug);
    return pageHead({
      title: chapterTitle(c),
      description: chapterDescription(c),
      path,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "NEET chapter-wise weightage", path: BLUEPRINT_BASE },
          { name: subject.name, path: subjectPath(subject.key) },
          { name: c.name, path },
        ]),
        faqPageJsonLd(chapterFaq(c, subject.total, subject.chapters.length)),
      ],
    });
  },
  notFoundComponent: BlueprintNotFound,
  component: ChapterPage,
});

function ChapterPage() {
  const { subjectKey, slug } = Route.useLoaderData();
  return <ChapterView subjectKey={subjectKey} slug={slug} />;
}
