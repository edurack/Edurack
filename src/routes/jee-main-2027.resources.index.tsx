// src/routes/jee-main-2027.resources.index.tsx  →  /jee-main-2027/resources
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, noindexHead, pageHead } from "@/lib/seo";
import { getJeeSubjects } from "@/lib/jee-blueprint";
import { JEE_LIBRARY_YEAR, JEE_LIB_BASE, jeeLibSubjectPath } from "@/lib/jee-resource-types";
import { getJeeLibrarySummary } from "@/server-functions/jee-resources";
import { JeeLibraryHubView } from "@/components/jee/jee-resource-views";

const TITLE = `JEE Main ${JEE_LIBRARY_YEAR} Notes & Practice Sheets`;

export const Route = createFileRoute("/jee-main-2027/resources/")({
  loader: () => getJeeLibrarySummary(),
  head: ({ loaderData }) => {
    // An empty library is a placeholder, not content: keep it out of search until something is published.
    if (!loaderData || loaderData.total === 0) return noindexHead(TITLE, `JEE Main ${JEE_LIBRARY_YEAR} chapter-wise notes and practice sheets from Edurack.`);
    const subjects = getJeeSubjects().filter((s) => loaderData.bySubject[s.key]);
    return pageHead({
      title: TITLE,
      description: `Chapter-wise PDF notes, quick revision sheets, practice sheets, answer keys and solutions for JEE Main ${JEE_LIBRARY_YEAR} Physics, Chemistry and Mathematics, from Edurack.`,
      path: JEE_LIB_BASE,
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: `JEE Main ${JEE_LIBRARY_YEAR} resources`, path: JEE_LIB_BASE }]),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: TITLE,
          itemListElement: subjects.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: `JEE Main ${JEE_LIBRARY_YEAR} ${s.name} resources`, url: `${SITE_URL}${jeeLibSubjectPath(s.key)}` })),
        },
      ],
    });
  },
  component: HubPage,
});

function HubPage() {
  return <JeeLibraryHubView summary={Route.useLoaderData()} />;
}
