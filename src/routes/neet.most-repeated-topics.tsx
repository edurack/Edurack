// src/routes/neet.most-repeated-topics.tsx  →  /neet/most-repeated-topics
import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { faqPageJsonLd } from "@/lib/neet-blueprint-copy";
import { TOPICS_PATH, overallTopics } from "@/lib/neet-topics";
import { TopicsView } from "@/components/neet/seo-pages";

const total = () => overallTopics(1)[0];
const FAQ = () => [
  { q: "Which topics are repeated most in NEET?", a: `Across NEET 2020 to 2026 and Re-NEET 2026, the most repeated topic in Edurack's tagged set is ${total().name} (${total().chapter.name}), with ${total().total} questions.` },
  { q: "Are NEET questions repeated from previous years?", a: "Topics repeat often, though questions rarely repeat word for word. Solving previous-year questions shows you which ideas NEET keeps returning to." },
  { q: "How should I use this list?", a: "Revise the topics that appear in the most papers first, then solve chapter-wise PYQs on each so you see how the topic is tested." },
  { q: "Does a repeated topic guarantee a question next year?", a: "No. Past frequency is a trend guide, not a promise. Use it to prioritise, but cover the whole NCERT." },
];

export const Route = createFileRoute("/neet/most-repeated-topics")({
  head: () =>
    pageHead({
      title: "Most Repeated Topics in NEET 2020-2026",
      description: "The most repeated NEET topics in Physics, Chemistry, Botany and Zoology, ranked by questions and by how many papers they appeared in.",
      path: TOPICS_PATH,
      jsonLd: [breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Most repeated topics", path: TOPICS_PATH }]), faqPageJsonLd(FAQ())],
    }),
  component: Page,
});

function Page() {
  return <TopicsView faqs={FAQ()} />;
}
