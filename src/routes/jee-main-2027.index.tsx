// src/routes/jee-main-2027.index.tsx  →  /jee-main-2027
//
// The JEE Main 2027 preparation hub. Server-rendered from existing published data (see server-functions/jee-landing.ts):
// the loader runs on the server for a first visit, so the articles, subject counts and featured chapters are in the
// HTML crawlers receive. Nothing is hardcoded; unpublishing content removes it on the next uncached load.
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, noindexHead, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { JEE_LANDING_DESCRIPTION, JEE_LANDING_FAQS, JEE_LANDING_TITLE } from "@/lib/jee-landing-copy";
import { JEE_LANDING_PATH, jeeLandingIndexable } from "@/lib/jee-landing-types";
import { JEE_LIBRARY_YEAR } from "@/lib/jee-resource-types";
import { getJeeLandingData } from "@/server-functions/jee-landing";
import { JeeLandingView } from "@/components/jee/jee-landing-view";

export const Route = createFileRoute("/jee-main-2027/")({
  loader: () => getJeeLandingData(),
  head: ({ loaderData }) => {
    // Completely empty (nothing published, no JEE questions) is a placeholder, not content: keep it out of search.
    if (loaderData && !jeeLandingIndexable({ resources: loaderData.summary.total, posts: loaderData.blog.total, pyq: loaderData.pyqTotal })) {
      return noindexHead(`JEE Main ${JEE_LIBRARY_YEAR}`, JEE_LANDING_DESCRIPTION);
    }
    const articles = [...(loaderData?.blog.updates ?? []), ...(loaderData?.blog.guides ?? [])];
    return pageHead({
      title: JEE_LANDING_TITLE,
      rawTitle: true, // the suggested title already carries the brand; the default suffix would double it
      description: JEE_LANDING_DESCRIPTION,
      path: JEE_LANDING_PATH,
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: `JEE Main ${JEE_LIBRARY_YEAR}`, path: JEE_LANDING_PATH }]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `JEE Main ${JEE_LIBRARY_YEAR} preparation hub`,
          description: JEE_LANDING_DESCRIPTION,
          url: `${SITE_URL}${JEE_LANDING_PATH}`,
          isPartOf: { "@type": "WebSite", name: "Edurack", url: SITE_URL },
          ...(articles.length
            ? { mainEntity: { "@type": "ItemList", itemListElement: articles.map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.title, url: `${SITE_URL}/blog/${a.slug}` })) } }
            : {}),
        },
        // Same FAQPage markup the site's other FAQ pages use; the answers are visible on the page.
        faqPageJsonLd(JEE_LANDING_FAQS),
      ],
    });
  },
  component: JeeLandingPage,
});

function JeeLandingPage() {
  return <JeeLandingView data={Route.useLoaderData()} />;
}
