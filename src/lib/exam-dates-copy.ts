// FAQ copy for the countdown and planner pages. The same text feeds the visible FAQ and the FAQPage JSON-LD.
// Dates come from lib/exam-dates.ts: when NTA announces or changes one, update that file and the answers here.
import type { Faq } from "@/lib/neet-blueprint-copy";
import { VERIFIED_ON } from "@/lib/exam-dates";

const PLANNER_HOW: Faq = {
  q: "How does the study planner work?",
  a: "You give your exam date, the hours you study a day and how much of the syllabus is done. It splits the days left into learning, revision, full-length mocks and a final week, and shows how many hours a week each subject gets. The split is a rule of thumb from Edurack, not an official recommendation.",
};

export const JEE_COUNTDOWN_FAQ: Faq[] = [
  {
    q: "When is JEE Main 2027?",
    a: "Session 1 is on 20, 21, 22, 23, 24 and 28 January 2027 and Session 2 is from 2 to 7 April 2027, according to NTA's public notice and Information Bulletin of 24 October 2026. NTA can change dates, so confirm on jeemain.nta.nic.in.",
  },
  {
    q: "Which JEE Main 2027 session should I plan for?",
    a: "You can appear in one or both sessions, and NTA uses your better NTA score for the rank list. Pick the date that leaves you enough time to finish the syllabus and take full-length mocks, and use the planner on this page to see what each date leaves you.",
  },
  PLANNER_HOW,
  {
    q: "Are these dates official?",
    a: `The exam dates come from NTA's published notices, and we last checked them on ${VERIFIED_ON}. The study plan is Edurack's own suggestion, not NTA's.`,
  },
];

export const NEET_COUNTDOWN_FAQ: Faq[] = [
  {
    q: "When is NEET UG 2027?",
    a: `NTA had not announced the NEET UG 2027 date when we last checked on ${VERIFIED_ON}. NEET UG has been held in early May in recent years. This page uses 2 May 2027 as a planning date and will switch to the official date once NTA publishes it. Confirm on neet.nta.nic.in.`,
  },
  {
    q: "Why does the planner use 2 May 2027?",
    a: "NTA has not announced the date. NEET UG has been held in early May in recent years and the first Sunday of May 2027 is 2 May, so the planner uses it as a stand-in. You can enter any date you like.",
  },
  {
    q: "How should I split study time between the NEET subjects?",
    a: "In recent years NEET UG carried 720 marks: 180 for Physics, 180 for Chemistry and 360 for Biology. That is why the planner gives Biology about half of your study time. Check NTA's information bulletin for any change to the pattern in 2027.",
  },
  PLANNER_HOW,
];
