// Landing-page FAQ: the visible accordion and the FAQPage JSON-LD both read from here, so the
// markup always matches what people can see. Keep answers short, factual and answer-first (they are
// what search snippets and AI answer engines quote), and consistent with /faq and /llms.txt.
// Like /faq, this makes no user-count or "trusted by" claims.
export const LANDING_LAST_UPDATED = "2026-10-29"; // bump when the copy or exam status on the homepage changes

export const LANDING_FAQS: { q: string; a: string }[] = [
  {
    q: "What is Edurack?",
    a: "Edurack is an exam-preparation platform for Indian aspirants. It combines a CBT simulator built to match the real NTA exam interface, chapter-wise previous year questions with step-by-step solutions, and mentors who have cleared the exam. NEET and JEE are live today.",
  },
  {
    q: "Which exams does Edurack cover?",
    a: "NEET and JEE are live today. CUET and IPMAT are coming soon, and we plan to expand through 2027 into government and state entrance exams.",
  },
  {
    q: "Is Edurack free?",
    a: "You can start free. The CBT demo needs no sign-up, and you can practise without paying. Mentor batches and test series are paid: each mentor sets the price of their own batch, and you see it before you pay.",
  },
  {
    q: "How is an Edurack mock test different from a normal quiz?",
    a: "Edurack's simulator replicates the NTA computer-based-test screen, including the question palette, timer placement and navigation, so exam day isn't the first time you see that interface. You can try it free, with no sign-up.",
  },
  {
    q: "What do I see after a test?",
    a: "A subject- and topic-wise breakdown of every attempt, not just a final score, so you can see which chapters are actually costing you marks.",
  },
  {
    q: "Can I practise previous year questions chapter-wise?",
    a: "Yes. Previous year questions are organised chapter-wise and topic-wise, with step-by-step solutions, for NEET and JEE.",
  },
  {
    q: "Who are the mentors, and are their credentials verified?",
    a: "Mentors are independent: they design, price and run their own batches. Each mentor must verify the exam rank, institution and credentials shown on their profile before publishing a batch, and falsified credentials are grounds for removal.",
  },
  {
    q: "Is Edurack a new platform?",
    a: "Yes. Edurack launched on 10 September 2026 and is still early. What is live today, including the CBT simulator, mentor batches and test analytics, works as described on this site.",
  },
  {
    q: "Is Edurack the same as EduRack or Edurack Technologies?",
    a: "No. Edurack is the platform at edurack.in, and only edurack.in. It is not affiliated with any other company, product or website named EduRack or Edurack Technologies.",
  },
];
