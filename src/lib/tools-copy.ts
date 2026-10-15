// Copy + structured data for the free tools (/tools/*). Kept apart from the components so the route head() can use it.
import { SITE_URL } from "@/lib/seo";
import type { Faq } from "@/lib/neet-blueprint-copy";

export const RANK_FAQ: Faq[] = [
  { q: "How does the NEET rank predictor work?", a: "It takes the marks-vs-rank bands published after NEET UG 2023, 2024 and 2025 and estimates the All-India Rank each year would have given for your marks. It then shows the range across the three years." },
  { q: "Why do the three years give such different ranks?", a: "Papers differ in difficulty. In 2025 the paper was tougher and the topper scored 686, so 600 marks was around AIR 1,400. In 2024 scores were unusually high, and the same 600 marks was around AIR 78,000. Treat the range as your realistic window." },
  { q: "Is this my exact NEET rank?", a: "No. It is an estimate. Your actual rank depends on how hard your year's paper is and how all other candidates score, and category ranks are different from the All-India Rank." },
  { q: "Where does the data come from?", a: "The marks-vs-rank bands published after the 2023, 2024 and 2025 results, compiled from NTA data, and the number of candidates who appeared from Careers360's reporting. Ranks inside a band are interpolated." },
  { q: "How can I improve my expected rank?", a: "The fastest gains usually come from chapters you already study but lose marks in. Solving chapter-wise NEET PYQs with solutions and reviewing mistakes is the most reliable way to raise your score." },
];

export const PERCENTILE_FAQ: Faq[] = [
  { q: "How is the NEET percentile calculated?", a: "Percentile = (number of candidates who appeared − your rank + 1) ÷ number of candidates who appeared × 100. A 99th percentile means you scored better than about 99% of candidates." },
  { q: "What percentile is needed to qualify NEET?", a: "For NEET UG 2025 the qualifying cut-off was the 50th percentile for General candidates (144 marks out of 720) and the 40th percentile for SC, ST and OBC candidates (113 marks)." },
  { q: "Is this the official NTA percentile?", a: "No. NTA's official percentile is calculated per exam session, so yours can differ slightly. This calculator gives a close estimate for planning." },
  { q: "How many candidates appeared in NEET?", a: "About 22.09 lakh appeared in NEET UG 2025, 23.33 lakh in 2024 and 20.39 lakh in 2023." },
  { q: "Can I find my percentile from marks only?", a: "Yes. Switch to \"I know my marks\". The tool first estimates your rank from that year's published bands, then converts it to a percentile." },
];

export const PLANNER_FAQ: Faq[] = [
  { q: "How many questions should I attempt in NEET?", a: "There is no single answer, because wrong answers cost 1 mark each. The planner shows, for your target, the correct answers you need at different attempt counts, so you can see the trade-off between attempting more and staying accurate." },
  { q: "How is the NEET marking scheme calculated?", a: "+4 for each correct answer and −1 for each wrong answer, out of 180 questions and 720 marks. Unattempted questions carry no marks." },
  { q: "How many PYQs should I solve before NEET?", a: "There is no fixed number. 3,000 previous-year questions is a solid, achievable goal for many students, spread over your remaining days. Quality matters more than count: read every solution and revise mistakes." },
  { q: "How should I split my target across subjects?", a: "Biology carries 360 marks and Physics and Chemistry 180 each. The planner uses that proportion as a starting point. Most students score best in Biology, so adjust to your strengths." },
  { q: "Does the planner guarantee my target score?", a: "No. It turns your target into daily and per-paper numbers. Reaching it depends on consistent practice and revision." },
];

export function webAppJsonLd(name: string, description: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: `${SITE_URL}${path}`,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    publisher: { "@type": "Organization", name: "Edurack", url: SITE_URL },
  };
}
