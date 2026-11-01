// src/routes/tools.neet-countdown.tsx  →  /tools/neet-countdown
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { webAppJsonLd } from "@/lib/tools-copy";
import { NEET_COUNTDOWN_FAQ } from "@/lib/exam-dates-copy";
import { ToolShell } from "@/components/tools/tool-shell";
import { CountdownPlanner } from "@/components/tools/countdown-tools";

const PATH = "/tools/neet-countdown";
const TITLE = "NEET UG 2027 Countdown and Study Planner";
const DESC = "Days left to NEET UG 2027 and a free study plan from your hours a day and syllabus done. NTA has not announced the date, so it uses a planning date.";

export const Route = createFileRoute("/tools/neet-countdown")({
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
        faqPageJsonLd(NEET_COUNTDOWN_FAQ),
      ],
    }),
  component: Page,
});

function Page() {
  return (
    <ToolShell
      title={TITLE}
      intro="See how many days are left for NEET UG 2027 and get a day-by-day plan from your daily hours and how much of the syllabus is done. NTA has not announced the date yet, so the countdown uses a planning date you can change."
      faqs={NEET_COUNTDOWN_FAQ}
      current={PATH}
    >
      <CountdownPlanner exam="neet" />
    </ToolShell>
  );
}
