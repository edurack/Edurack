// src/routes/tools.neet-percentile-calculator.tsx  →  /tools/neet-percentile-calculator
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { PERCENTILE_FAQ, webAppJsonLd } from "@/lib/tools-copy";
import { ToolShell } from "@/components/tools/tool-shell";
import { PercentileCalculator } from "@/components/tools/rank-tools";

const PATH = "/tools/neet-percentile-calculator";
const TITLE = "NEET Percentile Calculator: Marks or Rank";
const DESC = "Convert your NEET marks or All-India Rank into a percentile, with the 2025 qualifying cut-off. Free NEET percentile calculator.";

export const Route = createFileRoute("/tools/neet-percentile-calculator")({
  head: () =>
    pageHead({
      title: TITLE,
      description: DESC,
      path: PATH,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Free tools", path: "/tools" },
          { name: TITLE, path: PATH },
        ]),
        webAppJsonLd(TITLE, DESC, PATH),
        faqPageJsonLd(PERCENTILE_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell title={TITLE} intro="Turn your NEET marks or rank into a percentile, and compare it with the qualifying cut-off." faqs={PERCENTILE_FAQ} current={PATH}>
      <PercentileCalculator />
    </ToolShell>
  );
}
