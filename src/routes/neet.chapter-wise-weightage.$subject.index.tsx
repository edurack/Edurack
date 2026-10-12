// src/routes/neet.chapter-wise-weightage.$subject.index.tsx  →  /neet/chapter-wise-weightage/<subject>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { BLUEPRINT_BASE, chapterPath, getSubject, subjectPath } from "@/lib/neet-blueprint";
import { faqPageJsonLd, itemListJsonLd, subjectDescription, subjectFaq, subjectTitle } from "@/lib/neet-blueprint-copy";
import { SubjectView } from "@/components/neet/blueprint-views";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";

export const Route = createFileRoute("/neet/chapter-wise-weightage/$subject/")({
  loader: ({ params }) => {
    if (!getSubject(params.subject)) throw notFound();
    return { subjectKey: params.subject };
  },
  head: ({ loaderData }) => {
    const s = loaderData ? getSubject(loaderData.subjectKey) : undefined;
    if (!s) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    return pageHead({
      title: subjectTitle(s),
      description: subjectDescription(s),
      path: subjectPath(s.key),
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "NEET chapter-wise weightage", path: BLUEPRINT_BASE },
          { name: s.name, path: subjectPath(s.key) },
        ]),
        itemListJsonLd(
          `NEET ${s.name} chapters by weightage`,
          s.chapters.map((c) => ({ name: c.name, url: `${SITE_URL}${chapterPath(s.key, c.slug)}` })),
        ),
        faqPageJsonLd(subjectFaq(s)),
      ],
    });
  },
  notFoundComponent: BlueprintNotFound,
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectKey } = Route.useLoaderData();
  return <SubjectView subjectKey={subjectKey} />;
}
