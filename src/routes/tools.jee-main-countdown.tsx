// src/routes/tools.jee-main-countdown.tsx  →  /tools/jee-main-countdown
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { webAppJsonLd } from "@/lib/tools-copy";
import { JEE_COUNTDOWN_FAQ } from "@/lib/exam-dates-copy";
import { ToolShell } from "@/components/tools/tool-shell";
import { CountdownPlanner } from "@/components/tools/countdown-tools";

const PATH = "/tools/jee-main-countdown";
const TITLE = "JEE Main 2027 Countdown and Study Planner";
const DESC = "Days left to JEE Main 2027 with NTA-official dates for both sessions, plus a free study plan built from your hours a day and syllabus done.";

export const Route = createFileRoute("/tools/jee-main-countdown")({
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
        faqPageJsonLd(JEE_COUNTDOWN_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell
      title={TITLE}
      intro="See exactly how many days are left for JEE Main 2027, pick Session 1 or Session 2, and get a day-by-day plan from your daily hours and how much of the syllabus is done."
      faqs={JEE_COUNTDOWN_FAQ}
      current={PATH}
    >
      <CountdownPlanner exam="jee" />
    </ToolShell>
  );
}
