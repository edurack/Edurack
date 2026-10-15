// src/routes/tools.neet-rank-predictor.tsx  →  /tools/neet-rank-predictor
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { RANK_FAQ, webAppJsonLd } from "@/lib/tools-copy";
import { ToolShell } from "@/components/tools/tool-shell";
import { RankPredictor } from "@/components/tools/rank-tools";

const PATH = "/tools/neet-rank-predictor";
const TITLE = "NEET Rank Predictor 2026: Marks to AIR";
const DESC = "Enter your NEET marks and see your expected All-India Rank, using the real marks-vs-rank data from NEET UG 2023, 2024 and 2025. Free.";

export const Route = createFileRoute("/tools/neet-rank-predictor")({
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
        faqPageJsonLd(RANK_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell title={TITLE} intro="Enter your marks and see your expected All-India Rank. It uses the published marks-vs-rank data from the last three NEET papers, so you see a realistic range instead of a single guess." faqs={RANK_FAQ} current={PATH}>
      <RankPredictor />
    </ToolShell>
  );
}
