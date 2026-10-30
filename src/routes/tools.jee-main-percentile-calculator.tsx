// src/routes/tools.jee-main-percentile-calculator.tsx  →  /tools/jee-main-percentile-calculator
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { webAppJsonLd } from "@/lib/tools-copy";
import { JEE_PERCENTILE_FAQ } from "@/lib/jee-main-percentile";
import { ToolShell } from "@/components/tools/tool-shell";
import { JeePercentileCalculator } from "@/components/tools/jee-tools";

const PATH = "/tools/jee-main-percentile-calculator";
const TITLE = "JEE Main Percentile to Rank Calculator 2026";
const DESC = "Turn your JEE Main NTA percentile into an expected All-India Rank, or a rank into a percentile, using the 15.38 lakh candidates of 2026. Free.";

export const Route = createFileRoute("/tools/jee-main-percentile-calculator")({
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
        faqPageJsonLd(JEE_PERCENTILE_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell
      title={TITLE}
      intro="Enter your NTA percentile to see your expected All-India Rank, or enter a rank to see the percentile. It uses the 15.38 lakh candidates who appeared in JEE Main 2026, and you can change that number."
      faqs={JEE_PERCENTILE_FAQ}
      current={PATH}
    >
      <JeePercentileCalculator />
    </ToolShell>
  );
}
