// src/routes/tools.neet-target-score-planner.tsx  →  /tools/neet-target-score-planner
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { PLANNER_FAQ, webAppJsonLd } from "@/lib/tools-copy";
import { ToolShell } from "@/components/tools/tool-shell";
import { TargetPlanner } from "@/components/tools/rank-tools";

const PATH = "/tools/neet-target-score-planner";
const TITLE = "NEET Target Score Planner: Daily PYQ Plan";
const DESC = "Set a NEET target score and get the correct answers you need, the accuracy required, a subject-wise split and a daily PYQ plan. Free.";

export const Route = createFileRoute("/tools/neet-target-score-planner")({
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
        faqPageJsonLd(PLANNER_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell title={TITLE} intro="Set your target score and days left. You get the accuracy you need, how marks split across subjects, and a daily question plan." faqs={PLANNER_FAQ} current={PATH}>
      <TargetPlanner />
    </ToolShell>
  );
}
