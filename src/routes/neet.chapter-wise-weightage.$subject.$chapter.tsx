// src/routes/neet.chapter-wise-weightage.$subject.$chapter.tsx
//   →  /neet/chapter-wise-weightage/<subject>/<chapter>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { BLUEPRINT_BASE, RANGE_LABEL, chapterPath, getChapter, getSubject, subjectPath, topicLabel } from "@/lib/neet-blueprint";
import { chapterDescription, chapterFaq, chapterTitle, faqPageJsonLd, itemListJsonLd } from "@/lib/neet-blueprint-copy";
import { ChapterView } from "@/components/neet/blueprint-views";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";
import { getChapterTopQuestions } from "@/server-functions/pyq-seo";

export const Route = createFileRoute("/neet/chapter-wise-weightage/$subject/$chapter")({
  loader: async ({ params }) => {
    if (!getChapter(params.subject, params.chapter)) throw notFound();
    // Links to the chapter's PYQ pages. A database hiccup must never take the page down.
    const topQuestions = await getChapterTopQuestions({ data: { subject: params.subject, chapter: params.chapter } }).catch(() => []);
    return { subjectKey: params.subject, slug: params.chapter, topQuestions };
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
        // The topics table is on the page; list the ten most-asked, most-asked first.
        itemListJsonLd(
          `${c.name}: most asked NEET topics ${RANGE_LABEL}`,
          [...c.topics].sort((a, b) => b.total - a.total || b.papers - a.papers).slice(0, 10).map((t) => ({ name: topicLabel(t.name) })),
        ),
      ],
    });
  },
  notFoundComponent: BlueprintNotFound,
  component: ChapterPage,
});

function ChapterPage() {
  const { subjectKey, slug, topQuestions } = Route.useLoaderData();
  return <ChapterView subjectKey={subjectKey} slug={slug} topQuestions={topQuestions} />;
}
