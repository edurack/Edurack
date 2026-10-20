// src/lib/jee-blueprint-copy.ts
//
// Page copy for the JEE Main weightage pages, generated from the dataset.
// Every sentence is a measurement ("84 of 2,905 questions"), never a prediction,
// so the text is specific to each chapter instead of boilerplate.
import {
  EARLIER_LABEL,
  JEE_RANGE,
  RECENT_LABEL,
  YEARS,
  conceptsForChapter,
  droppedChapters,
  getJeeSubjects,
  jeeActiveChapters,
  jeeTotalQuestions,
  topJeeChaptersOverall,
  topJeeConceptsOverall,
  type JeeChapter,
  type JeeSubject,
} from "@/lib/jee-blueprint";
import type { Faq } from "@/lib/neet-blueprint-copy";

export { faqPageJsonLd, itemListJsonLd } from "@/lib/neet-blueprint-copy";
export type { Faq };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const qs = (n: number) => plural(n, "question");
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const fmt = (n: number) => n.toLocaleString("en-IN");

/** Honest provenance line shown on every JEE page. */
export const JEE_DATA_NOTE =
  `Counts are compiled from Edurack's JEE Main last five-year analysis (${JEE_RANGE}) and count questions across all shifts and sessions of each year. ` +
  `Because the number of shifts changes every year, trends compare each chapter's share of the paper among chapters still in the syllabus, not raw counts. ` +
  `Past frequency is a trend guide, not a prediction. Chapters marked "not in syllabus" are absent from NTA's JEE Main 2026 syllabus; always check the latest NTA syllabus before skipping a chapter.`;

// ── Hub ────────────────────────────────────────────────────────────────────
export const JEE_HUB_TITLE = `JEE Main Chapter-Wise Weightage ${JEE_RANGE}`;

export function jeeHubDescription() {
  return `JEE Main chapter-wise weightage from ${fmt(jeeTotalQuestions())} questions (${JEE_RANGE}): ranked Physics, Chemistry and Maths chapters, dropped chapters, repeated concepts.`;
}

export function jeeHubIntro(): string[] {
  const top = topJeeChaptersOverall(3);
  return [
    `This guide counts how many JEE Main questions came from each chapter across ${JEE_RANGE} — ${fmt(jeeTotalQuestions())} questions in Physics, Chemistry and Mathematics, counted across every shift. ` +
      `${jeeActiveChapters()} chapters are still in the syllabus; ${droppedChapters().length} that were asked earlier no longer are.`,
    `Weighted by how much of the full paper each chapter takes (each subject carries equal marks), the biggest chapters in ${RECENT_LABEL} were ${list(top.map((c) => `${c.name} (${c.subjectShort}, about ${c.paperShare}% of the paper)`))}.`,
  ];
}

export function jeeHubFaq(): Faq[] {
  const subjects = getJeeSubjects();
  const topPer = subjects.map((s) => `${s.name}: ${list(s.chapters.filter((c) => !c.retired).slice(0, 3).map((c) => c.name))}`).join("; ");
  const dropped = droppedChapters();
  return [
    { q: "Which chapters have the highest weightage in JEE Main?", a: `Ranked by their share of questions in ${RECENT_LABEL}, the top three chapters in each subject were — ${topPer}.` },
    { q: "How many questions are in this analysis?", a: `${fmt(jeeTotalQuestions())} questions across ${JEE_RANGE} and all shifts: ${list(subjects.map((s) => `${fmt(s.total)} in ${s.name}`))}. Because one year has many shifts, these are much larger than a single paper's 25 scored questions per subject.` },
    { q: "Are there chapters I can skip for JEE Main?", a: `${dropped.length} chapters that appeared in earlier years are not in NTA's JEE Main 2026 syllabus, including ${list(dropped.slice(0, 4).map((c) => c.name))}. Check the latest NTA syllabus before dropping any chapter.` },
    { q: "Does a high-weightage chapter guarantee questions next year?", a: "No. Past frequency shows where JEE Main has focused, not what it will ask next. Use it to decide what to study first, and still cover the full syllabus." },
    { q: "How should I use chapter-wise weightage?", a: "Start with chapters that have both a high share and a steady or rising trend, then solve previous-year questions on each so you see how the chapter is actually tested." },
  ];
}

// ── Subject ────────────────────────────────────────────────────────────────
export const jeeSubjectTitle = (s: JeeSubject) => `JEE Main ${s.short} Chapter-Wise Weightage ${JEE_RANGE}`;

export function jeeSubjectDescription(s: JeeSubject) {
  const t = s.chapters.filter((c) => !c.retired).slice(0, 2).map((c) => c.name);
  return `JEE Main ${s.short} weightage ${JEE_RANGE}: ${s.activeCount} chapters ranked. Highest: ${list(t)}.`;
}

export function jeeSubjectIntro(s: JeeSubject): string[] {
  const active = s.chapters.filter((c) => !c.retired);
  const top = active.slice(0, 3);
  const dropped = s.chapters.filter((c) => c.retired);
  const out = [
    `JEE Main asked ${fmt(s.total)} ${s.name} questions across all shifts between 2022 and 2026. ` +
      `In ${RECENT_LABEL} the three chapters with the largest share were ${list(top.map((c) => `${c.name} (${c.recentShare}%)`))}.`,
  ];
  if (dropped.length) out.push(`${plural(dropped.length, "chapter")} from earlier papers ${dropped.length === 1 ? "is" : "are"} not in the JEE Main 2026 syllabus: ${list(dropped.map((c) => c.name))}.`);
  return out;
}

export function jeeSubjectFaq(s: JeeSubject): Faq[] {
  const active = s.chapters.filter((c) => !c.retired);
  const rising = active.filter((c) => c.trend === "rising").slice(0, 3);
  const dropped = s.chapters.filter((c) => c.retired);
  const out: Faq[] = [
    { q: `Which JEE Main ${s.name} chapter has the highest weightage?`, a: `${active[0].name}, with ${active[0].recentShare}% of ${s.name} questions in ${RECENT_LABEL} and ${active[0].share}% across ${JEE_RANGE}.` },
    { q: `How many ${s.name} chapters are in the JEE Main syllabus?`, a: `This guide lists ${s.activeCount} ${s.name} chapters that are still in the 2026 syllabus, grouped the way JEE Main questions are tagged.` },
  ];
  if (rising.length) out.push({ q: `Which ${s.name} chapters are being asked more often?`, a: `${list(rising.map((c) => c.name))} ${rising.length === 1 ? "has" : "have"} taken a bigger share of the ${s.name} paper in ${RECENT_LABEL} than in ${EARLIER_LABEL}.` });
  if (dropped.length) out.push({ q: `Which ${s.name} chapters were removed from JEE Main?`, a: `${list(dropped.map((c) => c.name))} appeared in earlier papers but are not in NTA's JEE Main 2026 syllabus.` });
  out.push({ q: `How should I use ${s.name} weightage?`, a: "Study high-share chapters first, give steady and rising chapters regular revision, and solve previous-year questions on each chapter to see the question style." });
  return out;
}

// ── Chapter ────────────────────────────────────────────────────────────────
export const jeeChapterTitle = (c: JeeChapter) => `JEE Main ${c.name} Weightage ${JEE_RANGE}`;

export function jeeChapterDescription(c: JeeChapter) {
  return c.retired
    ? `${c.name} (JEE Main ${c.subjectShort}): ${c.total} questions in ${JEE_RANGE}, but not in the 2026 syllabus. Year-wise counts.`
    : `${c.name} (JEE Main ${c.subjectShort}): ${c.total} Qs in ${JEE_RANGE}, ${c.share}% of the subject, #${c.rank} by recent weightage. Year-wise trend.`;
}

export function jeeChapterSummary(c: JeeChapter, s: JeeSubject): string[] {
  const out: string[] = [];
  const counts = list(c.years.map((n, i) => `${n} in ${YEARS[i]}`));

  if (c.retired) {
    out.push(
      `${c.name} is not part of NTA's JEE Main 2026 syllabus. It contributed ${c.total} of the ${fmt(s.total)} ${s.name} questions between 2022 and 2026 (${c.share}%), ` +
        (c.recent > 0 ? `but only ${c.recent} of those came in ${RECENT_LABEL}.` : `and none came in ${RECENT_LABEL}.`),
    );
    out.push(`Year by year it was asked ${counts}. Check the latest NTA syllabus before you decide to skip it.`);
    return out;
  }

  out.push(
    `${c.name} contributed ${c.total} of the ${fmt(s.total)} JEE Main ${s.name} questions asked across all shifts between 2022 and 2026 — ${c.share}% of the subject. ` +
      `In ${RECENT_LABEL} its share was ${c.recentShare}%, which makes it the #${c.rank} chapter of ${s.activeCount} in the current syllabus by recent weightage (about ${c.paperShare}% of the whole paper).`,
  );
  out.push(`Year by year it was asked ${counts}. It appeared in ${c.yearsAsked} of 5 years, with its highest count in ${YEARS[c.peakIndex]}.`);

  if (c.trend === "rising") out.push(`Its share has been rising: ${c.recentAvgShare}% of the ${s.name} paper on average in ${RECENT_LABEL}, against ${c.earlierAvgShare}% in ${EARLIER_LABEL}.`);
  else if (c.trend === "falling") out.push(`Its share has been falling: ${c.recentAvgShare}% of the ${s.name} paper on average in ${RECENT_LABEL}, against ${c.earlierAvgShare}% in ${EARLIER_LABEL}.`);
  else out.push(`Its share has stayed fairly steady: ${c.recentAvgShare}% of the ${s.name} paper on average in ${RECENT_LABEL}, against ${c.earlierAvgShare}% in ${EARLIER_LABEL}.`);

  const ks = conceptsForChapter(c).slice(0, 3);
  if (ks.length) out.push(`The most repeated concepts from this chapter in the dataset are ${list(ks.map((k) => `${k.name} (${qs(k.total)})`))}.`);
  return out;
}

export function jeeChapterFaq(c: JeeChapter, s: JeeSubject): Faq[] {
  const out: Faq[] = [
    { q: `How many questions come from ${c.name} in JEE Main?`, a: `${c.name} had ${c.total} questions across all JEE Main shifts from 2022 to 2026, which is ${c.share}% of ${s.name}. Year by year: ${list(c.years.map((n, i) => `${n} in ${YEARS[i]}`))}.` },
  ];
  if (c.retired) {
    out.push({ q: `Is ${c.name} still in the JEE Main syllabus?`, a: `It is not listed in NTA's JEE Main 2026 syllabus. Check the latest NTA notification before skipping it.` });
  } else {
    out.push({ q: `Is ${c.name} important for JEE Main?`, a: `It ranks #${c.rank} of ${s.activeCount} ${s.name} chapters by share of questions in ${RECENT_LABEL} (${c.recentShare}% of the subject). ${c.trend === "rising" ? "Its share has been rising." : c.trend === "falling" ? "Its share has been falling." : "Its share has been steady."}` });
    const ks = conceptsForChapter(c).slice(0, 4);
    if (ks.length) out.push({ q: `Which ${c.name} concepts are asked most in JEE Main?`, a: `${list(ks.map((k) => `${k.name} (${qs(k.total)})`))} are the most repeated concepts from this chapter in the dataset.` });
    out.push({ q: `What does the JEE Main syllabus cover in ${c.name}?`, a: c.syllabus });
  }
  out.push({ q: `Does a high weightage mean ${c.name} will be asked again?`, a: "No. Weightage shows past frequency, not a promise. Use it to prioritise, and practise previous-year questions to see how the chapter is tested." });
  return out;
}

// ── Concepts page ──────────────────────────────────────────────────────────
export const JEE_CONCEPTS_TITLE = `Most Repeated Concepts in JEE Main ${JEE_RANGE}`;
export const jeeConceptsDescription = () => `The most repeated JEE Main concepts in Physics, Chemistry and Maths, ranked by questions across ${JEE_RANGE}, with year-wise counts and the chapter each belongs to.`;

export function jeeConceptsFaq(): Faq[] {
  const t = topJeeConceptsOverall(1)[0];
  return [
    { q: "Which concepts are repeated most in JEE Main?", a: `Across ${JEE_RANGE} the most repeated concept in the dataset is ${t.name} (${t.subjectName}), with ${t.total} questions across all shifts.` },
    { q: "Do JEE Main questions repeat from previous years?", a: "Concepts repeat often, though questions rarely repeat word for word. Solving previous-year questions shows which ideas JEE Main keeps coming back to." },
    { q: "Why do some concepts show a dash for recent years?", a: "A dash means no questions on that concept were counted that year. Some concepts belong to chapters that are no longer in the JEE Main syllabus." },
    { q: "Does a repeated concept guarantee a question next year?", a: "No. Past frequency is a trend guide, not a promise. Use it to prioritise, but cover the full syllabus." },
  ];
}
