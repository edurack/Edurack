// src/routes/neet.paper-analysis.$year.tsx  →  /neet/paper-analysis/<year>   (2020 … 2026, re-neet-2026)
import { createFileRoute, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { PAPER_BASE, analyzePaper, paperDescription, paperFaq, paperPath, paperTitle } from "@/lib/neet-paper-analysis";
import { PaperView } from "@/components/neet/seo-pages";
import { BlueprintNotFound } from "@/components/neet/blueprint-not-found";

export const Route = createFileRoute("/neet/paper-analysis/$year")({
  loader: ({ params }) => {
    if (!analyzePaper(params.year)) throw notFound();
    return { year: params.year };
  },
  head: ({ loaderData }) => {
    const a = loaderData ? analyzePaper(loaderData.year) : null;
    if (!a) return { meta: [{ title: "Not found · Edurack" }, { name: "robots", content: "noindex" }] };
    return pageHead({
      title: paperTitle(a),
      description: paperDescription(a),
      path: paperPath(a.slug),
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "NEET paper analysis", path: PAPER_BASE },
          { name: a.label, path: paperPath(a.slug) },
        ]),
        faqPageJsonLd(paperFaq(a)),
      ],
    });
  },
  notFoundComponent: BlueprintNotFound,
  component: Page,
});

function Page() {
  const { year } = Route.useLoaderData();
  return <PaperView slug={year} faqs={paperFaq(analyzePaper(year)!)} />;
}
