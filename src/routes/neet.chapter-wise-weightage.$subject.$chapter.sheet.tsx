// src/routes/neet.chapter-wise-weightage.$subject.$chapter.sheet.tsx
//   →  /neet/chapter-wise-weightage/<subject>/<chapter>/sheet
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { BLUEPRINT_BASE, chapterPath, getChapter, getSubject, subjectPath } from "@/lib/neet-blueprint";
import { getChapterSheet } from "@/server-functions/pyq-seo";
import { SheetView } from "@/components/neet/sheet-view";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";

export const Route = createFileRoute("/neet/chapter-wise-weightage/$subject/$chapter/sheet")({
  loader: async ({ params }) => {
    const c = getChapter(params.subject, params.chapter);
    if (!c) throw notFound();
    const sheet = await getChapterSheet({ data: { subject: c.subjectName, chapter: c.name } });
    return { subjectKey: params.subject, slug: params.chapter, sheet };
  },
  head: ({ loaderData }) => {
    const c = loaderData ? getChapter(loaderData.subjectKey, loaderData.slug) : undefined;
    const subject = loaderData ? getSubject(loaderData.subjectKey) : undefined;
    if (!c || !subject || !loaderData) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const path = `${chapterPath(subject.key, c.slug)}/sheet`;
    const head = pageHead({
      title: `NEET ${c.name} PYQ Practice Sheet (PDF)`,
      description: `${loaderData.sheet.questions.length} free previous-year NEET questions from ${c.name} (${subject.name}) to print or save as PDF, with answer key for students with an account.`,
      path,
      jsonLd: breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "NEET chapter-wise weightage", path: BLUEPRINT_BASE },
        { name: subject.name, path: subjectPath(subject.key) },
        { name: c.name, path: chapterPath(subject.key, c.slug) },
        { name: "Practice sheet", path },
      ]),
    });
    // No readable questions yet (a chapter that has no PYQs tagged): keep the thin page out of search.
    if (loaderData.sheet.questions.length === 0) head.meta.push({ name: "robots", content: "noindex, follow" });
    return head;
  },
  notFoundComponent: BlueprintNotFound,
  component: Page,
});

function Page() {
  const d = Route.useLoaderData();
  return <SheetView subjectKey={d.subjectKey} slug={d.slug} sheet={d.sheet} />;
}
