// src/lib/neet-blueprint-copy.ts
//
// Page copy for the NEET PYQ Blueprint pages, generated from the dataset.
// Every sentence is a measurement ("23 of 387 questions") — never a
// prediction — so the text is specific to each chapter instead of boilerplate.
import {
  PAPER_LABELS,
  RANGE_LABEL,
  chapterInsights,
  getSubjects,
  topicLabel,
  totalChapters,
  totalQuestions,
  type Chapter,
  type Subject,
} from "@/lib/neet-blueprint";

export type Faq = { q: string; a: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const qs = (n: number) => plural(n, "question");
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Honest provenance line shown on every blueprint page. */
export const DATA_NOTE =
  `Counts come from Edurack's tagged set of NEET papers ${RANGE_LABEL} (including Re-NEET 2026), mapped to NCERT chapters and topics. ` +
  `Use them as a trend guide — past frequency doesn't guarantee what a future paper will ask.`;

export function subjectYearTotals(s: Subject): number[] {
  return PAPER_LABELS.map((_, i) => s.chapters.reduce((n, c) => n + c.years[i], 0));
}

// ── Chapter page ────────────────────────────────────────────────────────────
export function chapterTitle(c: Chapter) {
  // A few chapter names exist in more than one subject (e.g. Biomolecules) — name the subject for those.
  const shared = getSubjects().filter((s) => s.chapters.some((x) => x.name === c.name)).length > 1;
  return `NEET ${shared ? `${c.subjectName} ` : ""}${c.name} PYQ Weightage ${RANGE_LABEL}`;
}

export function chapterDescription(c: Chapter) {
  return `${c.name} (NEET ${c.subjectName}): ${c.total} Qs in ${RANGE_LABEL}, ${c.share}% of the subject. Topic-wise PYQ trends, difficulty and repeated topics.`;
}

export function chapterSummary(c: Chapter, subjectTotal: number, chapterCount: number): string[] {
  const ins = chapterInsights(c);
  const tagged = c.easy + c.med + c.hard;
  const out: string[] = [];

  out.push(
    `${c.name} contributed ${c.total} of the ${subjectTotal} NEET ${c.subjectName} questions between 2020 and 2026 (Re-NEET 2026 included). ` +
      `That is ${c.share}% of the subject and makes it the #${c.rank} chapter out of ${chapterCount} by weightage — roughly ${qs(ins.perPaperAvg)} per paper, ` +
      `peaking at ${c.years[ins.peakPaperIndex]} in ${PAPER_LABELS[ins.peakPaperIndex]}.`,
  );

  if (tagged > 0) {
    const verdict =
      ins.easyPct >= 45
        ? "a chapter where NCERT-level preparation pays off directly"
        : ins.hardPct >= 25
          ? "a chapter that tends to bring the tougher questions"
          : ins.medPct >= 55
            ? "mostly medium-level questions that reward practice beyond one-line facts"
            : "a fairly balanced mix of easy and moderate questions";
    out.push(`Of the ${tagged} questions tagged for difficulty, ${ins.easyPct}% were easy, ${ins.medPct}% medium and ${ins.hardPct}% hard — ${verdict}.`);
  }

  if (ins.zeroRecently) {
    out.push(`No question came from this chapter in the last four papers (NEET 2024 onward), though earlier papers asked ${c.years.slice(0, 4).reduce((a, b) => a + b, 0)}.`);
  } else if (ins.trend === "rising") {
    out.push(`It has been asked more often lately: ${qs(ins.recentAvg)} per paper across NEET 2025, NEET 2026 and Re-NEET 2026, against ${ins.earlierAvg} in 2020–2022.`);
  } else if (ins.trend === "falling") {
    out.push(`It has been asked less often lately: ${qs(ins.recentAvg)} per paper across NEET 2025, NEET 2026 and Re-NEET 2026, against ${ins.earlierAvg} in 2020–2022.`);
  } else {
    out.push(`Its weight has stayed fairly steady: ${qs(ins.recentAvg)} per paper across NEET 2025, NEET 2026 and Re-NEET 2026, against ${ins.earlierAvg} in 2020–2022.`);
  }

  if (ins.mostTested[0]) {
    const t = ins.mostTested[0];
    out.push(`The single most-tested topic is ${topicLabel(t.name)} — ${plural(t.total, "question")} across ${plural(t.papers, "paper")}.`);
  }
  return out;
}

export function chapterFaq(c: Chapter, subjectTotal: number, chapterCount: number): Faq[] {
  const ins = chapterInsights(c);
  const tagged = c.easy + c.med + c.hard;
  const faqs: Faq[] = [];

  faqs.push({
    q: `How many questions come from ${c.name} in NEET?`,
    a: `In the NEET papers from 2020 to 2026 (including Re-NEET 2026), ${c.total} ${c.subjectName} questions came from ${c.name} — ${c.share}% of the subject, or about ${ins.perPaperAvg} per paper.`,
  });

  const importance =
    c.rank <= 5
      ? `one of the five highest-weightage ${c.subjectName} chapters`
      : c.rank <= Math.ceil(chapterCount / 2)
        ? `an above-average-weightage ${c.subjectName} chapter`
        : `a lower-weightage ${c.subjectName} chapter`;
  faqs.push({
    q: `Is ${c.name} important for NEET?`,
    a: `By past weightage it ranks #${c.rank} of ${chapterCount} ${c.subjectName} chapters, so it is ${importance}, with ${c.total} questions over ${RANGE_LABEL}.`,
  });

  if (ins.mostTested.length) {
    faqs.push({
      q: `Which topics of ${c.name} are asked most in NEET?`,
      a: `The most-tested topics are ${list(ins.mostTested.slice(0, 3).map((t) => `${topicLabel(t.name)} (${t.total})`))}. The topic table above lists every topic with its count in each paper.`,
    });
  }

  if (tagged > 0) {
    faqs.push({
      q: `Is ${c.name} easy or difficult in NEET?`,
      a: `Of the ${tagged} difficulty-tagged questions, ${ins.easyPct}% were easy, ${ins.medPct}% medium and ${ins.hardPct}% hard.`,
    });
  }

  faqs.push({
    q: `Which ${c.name} topics were asked in NEET 2026 and Re-NEET 2026?`,
    a: ins.latest.length
      ? `${list(ins.latest.slice(0, 4).map((t) => topicLabel(t.name)))}${ins.latest.length > 4 ? " and more" : ""} were asked in the 2026 papers.`
      : `No question came from ${c.name} in NEET 2026 or Re-NEET 2026.`,
  });

  faqs.push({
    q: `Where can I practise ${c.name} NEET PYQs?`,
    a: `Edurack has chapter-wise NEET previous-year questions for ${c.name}. Use the practice button on this page to open the set, attempt questions and check your answers.`,
  });
  return faqs;
}

// ── Subject page ────────────────────────────────────────────────────────────
export const subjectTitle = (s: Subject) => `NEET ${s.name} Chapter-wise Weightage ${RANGE_LABEL}`;

export function subjectDescription(s: Subject) {
  const top = s.chapters.slice(0, 3).map((c) => c.name);
  return `NEET ${s.name} chapter-wise weightage ${RANGE_LABEL}: ${s.total} questions across ${s.chapters.length} chapters. Highest weightage: ${list(top)}.`;
}

export function subjectIntro(s: Subject): string[] {
  const top5 = s.chapters.slice(0, 5);
  const top5Qs = top5.reduce((n, c) => n + c.total, 0);
  const easy = s.chapters.reduce((n, c) => n + c.easy, 0);
  const med = s.chapters.reduce((n, c) => n + c.med, 0);
  const hard = s.chapters.reduce((n, c) => n + c.hard, 0);
  const tagged = easy + med + hard;
  const out = [
    `This page ranks all ${s.chapters.length} NEET ${s.name} chapters by how many questions they produced across NEET ${RANGE_LABEL} and Re-NEET 2026 — ${s.total} questions in total. ` +
      `The five highest-weightage chapters (${list(top5.map((c) => c.name))}) account for ${top5Qs} of them, ${Math.round((top5Qs / s.total) * 100)}% of the subject.`,
  ];
  if (tagged > 0) {
    out.push(
      `By difficulty, ${Math.round((easy / tagged) * 100)}% of the tagged ${s.name} questions were easy, ${Math.round((med / tagged) * 100)}% medium and ${Math.round((hard / tagged) * 100)}% hard. ` +
        `Open any chapter for its topic-wise breakdown, the papers each topic appeared in, and the topics that have been asked most recently.`,
    );
  }
  return out;
}

export function subjectFaq(s: Subject): Faq[] {
  const top = s.chapters.slice(0, 5);
  const yearTotals = subjectYearTotals(s);
  const eligible = s.chapters.filter((c) => c.total >= 8);
  const easiest = [...eligible].sort((a, b) => b.easy / Math.max(1, b.easy + b.med + b.hard) - a.easy / Math.max(1, a.easy + a.med + a.hard)).slice(0, 3);
  const hardest = [...eligible].sort((a, b) => b.hard / Math.max(1, b.easy + b.med + b.hard) - a.hard / Math.max(1, a.easy + a.med + a.hard)).slice(0, 3);
  return [
    {
      q: `Which is the most important chapter in NEET ${s.name}?`,
      a: `By past weightage, ${top[0].name} leads with ${top[0].total} questions (${top[0].share}%). The top five are ${list(top.map((c) => `${c.name} (${c.total})`))}.`,
    },
    {
      q: `How many ${s.name} questions were asked in each NEET paper?`,
      a: `${PAPER_LABELS.map((p, i) => `${p}: ${yearTotals[i]}`).join("; ")}. These are the questions Edurack has tagged to NCERT chapters, so they can differ slightly from the printed paper.`,
    },
    {
      q: `Which ${s.name} chapters are easiest to score from?`,
      a: `Among chapters with at least 8 questions, the highest share of easy questions was in ${list(easiest.map((c) => `${c.name} (${Math.round((c.easy / Math.max(1, c.easy + c.med + c.hard)) * 100)}% easy)`))}.`,
    },
    {
      q: `Which ${s.name} chapters have the most difficult questions?`,
      a: `Among chapters with at least 8 questions, the highest share of hard questions was in ${list(hardest.map((c) => `${c.name} (${Math.round((c.hard / Math.max(1, c.easy + c.med + c.hard)) * 100)}% hard)`))}.`,
    },
    {
      q: `Are these NEET ${s.name} weightage numbers official?`,
      a: DATA_NOTE,
    },
  ];
}

// ── Hub page ────────────────────────────────────────────────────────────────
export const HUB_TITLE = `NEET Chapter-wise Weightage ${RANGE_LABEL}`;

export function hubDescription() {
  return `NEET chapter-wise weightage for Physics, Chemistry, Botany and Zoology: ${totalQuestions()} previous-year questions across ${totalChapters()} chapters, with topic-wise trends for every paper ${RANGE_LABEL}.`;
}

export function hubFaq(): Faq[] {
  const subjects = getSubjects();
  return [
    {
      q: "What is the chapter-wise weightage of NEET?",
      a: `Edurack has mapped ${totalQuestions()} NEET questions from ${RANGE_LABEL} (including Re-NEET 2026) to ${totalChapters()} NCERT chapters: ${subjects.map((s) => `${s.name} ${s.total}`).join(", ")}. Open a subject to see every chapter ranked.`,
    },
    {
      q: "Which NEET chapters have the highest weightage?",
      a: `Per subject, the top chapter is ${subjects.map((s) => `${s.chapters[0].name} in ${s.name} (${s.chapters[0].total} questions)`).join("; ")}.`,
    },
    {
      q: "How should I use chapter-wise weightage for NEET preparation?",
      a: "Use it to decide the order and depth of revision: start with chapters that combine high weightage and a large share of easy questions, then widen to the lower-weightage chapters. Weightage reflects past papers, so keep the whole syllabus in view.",
    },
    { q: "Are these numbers official?", a: DATA_NOTE },
  ];
}

// ── Structured data ─────────────────────────────────────────────────────────
export function faqPageJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function itemListJsonLd(name: string, items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, ...(it.url ? { url: it.url } : {}) })),
  };
}
