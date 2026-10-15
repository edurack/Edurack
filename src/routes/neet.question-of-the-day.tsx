// src/routes/neet.question-of-the-day.tsx  →  /neet/question-of-the-day
// Public and server-rendered: today's NEET PYQ is in the HTML. One url that changes daily (the old days are linked from the page).
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { plainText } from "@/lib/pyq-public";
import { getQuestionOfTheDay } from "@/server-functions/pyq-seo";
import { QotdView, prettyDay } from "@/components/neet/qotd-view";

export const Route = createFileRoute("/neet/question-of-the-day")({
  loader: () => getQuestionOfTheDay(),
  head: ({ loaderData }) => {
    const text = loaderData ? plainText(loaderData.page.question.body) : "";
    return pageHead({
      title: loaderData ? `NEET Question of the Day: ${prettyDay(loaderData.day).split(", ").slice(1).join(", ")}` : "NEET Question of the Day",
      description: loaderData
        ? `Today's free NEET PYQ (${loaderData.page.question.subject}, ${loaderData.page.question.chapter}): ${text.slice(0, 80)}… Check your answer now.`
        : "One free NEET previous-year question every day, with instant answer check.",
      path: "/neet/question-of-the-day",
      jsonLd: breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "NEET question of the day", path: "/neet/question-of-the-day" }]),
    });
  },
  component: Page,
});

function Page() {
  return <QotdView data={Route.useLoaderData() ?? null} />;
}
