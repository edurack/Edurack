// src/routes/jee-main-2027.resources.$subject.$chapter.index.tsx  →  /jee-main-2027/resources/<subject>/<chapter>
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, noindexHead, pageHead } from "@/lib/seo";
import { getJeeChapter, getJeeSubject } from "@/lib/jee-blueprint";
import { JEE_LIBRARY_YEAR, JEE_LIB_BASE, JEE_RESOURCE_TYPE_LABELS, JEE_RESOURCE_TYPES, jeeLibChapterPath, jeeLibSubjectPath } from "@/lib/jee-resource-types";
import { listJeeChapterResources } from "@/server-functions/jee-resources";
import { JeeLibraryChapterView } from "@/components/jee/jee-resource-views";
import { JeeNotFound } from "@/components/jee/jee-views";

export const Route = createFileRoute("/jee-main-2027/resources/$subject/$chapter/")({
  loader: async ({ params }) => {
    if (!getJeeChapter(params.subject, params.chapter)) throw notFound();
    const resources = await listJeeChapterResources({ data: { subject: params.subject, chapter: params.chapter } });
    return { subjectKey: params.subject, slug: params.chapter, resources };
  },
  head: ({ loaderData }) => {
    const s = loaderData ? getJeeSubject(loaderData.subjectKey) : undefined;
    const c = loaderData ? getJeeChapter(loaderData.subjectKey, loaderData.slug) : undefined;
    if (!s || !c || !loaderData) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    const title = `JEE Main ${JEE_LIBRARY_YEAR} ${c.name} Notes & Practice Sheets`;
    const { resources } = loaderData;
    // No published resources → an empty placeholder page → keep it out of search.
    if (resources.length === 0) return noindexHead(title, `JEE Main ${JEE_LIBRARY_YEAR} ${c.name} resources from Edurack.`);
    const types = JEE_RESOURCE_TYPES.filter((t) => resources.some((r) => r.type === t)).map((t) => JEE_RESOURCE_TYPE_LABELS[t].toLowerCase());
    const path = jeeLibChapterPath(s.key, c.slug);
    return pageHead({
      title,
      description: `Download ${c.name} (${s.name}) ${types.join(", ")} for JEE Main ${JEE_LIBRARY_YEAR} as PDFs from Edurack. Preview online or save for offline revision.`,
      path,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: `JEE Main ${JEE_LIBRARY_YEAR} resources`, path: JEE_LIB_BASE },
          { name: s.name, path: jeeLibSubjectPath(s.key) },
          { name: c.name, path },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${c.name}: JEE Main ${JEE_LIBRARY_YEAR} resources`,
          itemListElement: resources.map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "LearningResource",
              name: r.title,
              ...(r.description ? { description: r.description } : {}),
              learningResourceType: JEE_RESOURCE_TYPE_LABELS[r.type],
              teaches: c.name,
              inLanguage: "en-IN",
              isAccessibleForFree: true,
              dateModified: r.updatedAt,
              // No file URL on purpose: downloads go through the server so they can be counted.
              url: `${SITE_URL}${path}`,
            },
          })),
        },
      ],
    });
  },
  notFoundComponent: JeeNotFound,
  component: ChapterPage,
});

function ChapterPage() {
  const { subjectKey, slug, resources } = Route.useLoaderData();
  return <JeeLibraryChapterView subjectKey={subjectKey} chapterSlug={slug} resources={resources} />;
}
