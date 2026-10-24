// src/lib/jee-landing-copy.ts
//
// Fixed wording for the JEE Main 2027 landing page: SEO title/description and the FAQ.
// Every FAQ answer describes what Edurack actually does today (checked against the code that serves it) and
// makes no claim about official exam dates, eligibility or the syllabus — those belong to NTA's notices.
import { JEE_LIB_BASE } from "@/lib/jee-resource-types";

export const JEE_LANDING_TITLE = "JEE Main 2027: Exam Updates, Notes, Practice Sheets & PYQs | Edurack";
export const JEE_LANDING_DESCRIPTION =
  "Prepare for JEE Main 2027 with exam updates, Physics, Chemistry and Mathematics revision notes, downloadable practice sheets and available PYQs on Edurack.";

export type LandingFaq = { q: string; a: string };

export const JEE_LANDING_FAQS: LandingFaq[] = [
  {
    q: "Where can I find JEE Main 2027 chapter-wise notes?",
    a: `In the Edurack JEE Main 2027 resource library (${JEE_LIB_BASE}). Choose Physics, Chemistry or Mathematics, then open a chapter to see the notes published for it. Chapters are added over time, so not every chapter has every type of resource yet.`,
  },
  {
    q: "Can I download practice sheets?",
    a: "Yes. Where a practice sheet has been published for a chapter, you can preview it in your browser or download it as a PDF from that chapter's page. You don't need an account to preview or download library PDFs.",
  },
  {
    q: "Are Edurack's JEE resources free?",
    a: "The notes, revision sheets and practice sheets in the resource library are free to preview and download, with no payment or Pro plan needed. Edurack Pro is a separate, optional plan for extra practice features and does not affect access to library PDFs.",
  },
  {
    q: "Can I practise JEE Main PYQs?",
    a: "Yes. Edurack has JEE previous-year questions you can practise subject-wise and chapter-wise, with solutions. You can try a few questions without logging in; sign in to practise more and track your progress. The question bank does not cover every paper or chapter yet, so availability varies.",
  },
  {
    q: "How do I find resources for a specific subject?",
    a: `Use the Physics, Chemistry and Mathematics cards on this page, or open the resource library (${JEE_LIB_BASE}) and pick a subject. Each subject page lists the chapters that currently have published resources.`,
  },
  {
    q: "Where can I read the latest JEE Main 2027 updates?",
    a: "The Latest JEE Main 2027 Updates section on this page shows the newest published exam-news articles from the Edurack blog, and the blog's JEE filter lists every published JEE article. Articles summarise public information, so always confirm dates, eligibility and syllabus against the official NTA notices.",
  },
];
