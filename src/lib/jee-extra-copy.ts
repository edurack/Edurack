// src/lib/jee-extra-copy.ts
//
// Copy for the extra JEE pages (paper analysis, syllabus, removed chapters, high-weightage chapters,
// chapter trends). Like jee-blueprint-copy.ts, every sentence is a measurement from the dataset.
import {
  EARLIER_LABEL,
  JEE_RANGE,
  RECENT_LABEL,
  YEARS,
  droppedChapters,
  getJeeSubjects,
  jeeActiveChapters,
  jeeTotalQuestions,
  type JeeChapter,
} from "@/lib/jee-blueprint";
import type { Faq } from "@/lib/jee-blueprint-copy";
import type { ChapterYearRow, SubjectYear, YearAnalysis } from "@/lib/jee-paper-analysis";
import { coverage, movers } from "@/lib/jee-insights";
import { PAPER2, syllabusUnits, type Paper2 } from "@/lib/jee-syllabus";

const fmt = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const prevYear = (y: string) => YEARS[YEARS.indexOf(y) - 1];

// ── Paper analysis ─────────────────────────────────────────────────────────
export const PAPER_HUB_TITLE = `JEE Main Paper Analysis ${JEE_RANGE}, Chapter-Wise`;
export const paperHubDescription = () => `Year-wise JEE Main paper analysis, ${JEE_RANGE}: chapter-wise question counts, the biggest chapters and shifts in weightage for Physics, Chemistry and Maths.`;

export function paperHubFaq(): Faq[] {
  return [
    { q: "How is a JEE Main paper analysis done here?", a: `Each page counts how many questions came from every chapter in a year, across all shifts, and compares each chapter's share of its subject with the previous year.` },
    { q: "Why use shares instead of raw counts?", a: "The number of shifts changes from year to year, so raw counts are not comparable across years. A chapter's share of its subject's questions is." },
    { q: "Which years are covered?", a: `${YEARS.join(", ")}: ${fmt(jeeTotalQuestions())} questions across Physics, Chemistry and Mathematics.` },
    { q: "Can past analysis predict the next paper?", a: "Not reliably. It shows where JEE Main has focused and how that has shifted, which helps you prioritise, but you should still cover the full syllabus." },
  ];
}

export const yearTitle = (y: string) => `JEE Main ${y} Paper Analysis, Chapter-Wise`;

function overallMoves(a: YearAnalysis, key: "rises" | "drops"): ChapterYearRow[] {
  return a.subjects
    .flatMap((s) => s[key])
    .sort((x, y) => (key === "rises" ? (y.delta ?? 0) - (x.delta ?? 0) : (x.delta ?? 0) - (y.delta ?? 0)))
    .slice(0, 3);
}

export function yearDescription(a: YearAnalysis) {
  return `JEE Main ${a.year} analysis: ${fmt(a.total)} questions across all shifts, chapter by chapter. Biggest: ${a.top[0].chapter.name}.`;
}

export function yearIntro(a: YearAnalysis): string[] {
  const out = [
    `JEE Main ${a.year} adds ${fmt(a.total)} questions to this analysis, counted across all shifts: ${list(a.subjects.map((s) => `${fmt(s.total)} in ${s.subject.name}`))}. ` +
      `The chapters with the largest share of the paper were ${list(a.top.slice(0, 3).map((r) => `${r.chapter.name} (${r.chapter.subjectShort}, about ${r.paperShare}% of the paper)`))}.`,
  ];
  if (a.yi > 0) {
    const up = overallMoves(a, "rises");
    const down = overallMoves(a, "drops");
    const parts: string[] = [];
    if (up.length) parts.push(`${list(up.map((r) => `${r.chapter.name} (+${r.delta} points of its subject)`))} gained share`);
    if (down.length) parts.push(`${list(down.map((r) => `${r.chapter.name} (${r.delta} points)`))} lost share`);
    if (parts.length) out.push(`Compared with ${prevYear(a.year)}, ${parts.join(" while ")}.`);
  }
  if (a.retiredCount > 0) out.push(`${fmt(a.retiredCount)} of the year's questions came from chapters that are no longer in the JEE Main 2026 syllabus.`);
  return out;
}

export function yearFaq(a: YearAnalysis): Faq[] {
  const out: Faq[] = a.subjects.map((s) => ({
    q: `Which chapter had the most questions in JEE Main ${a.year} ${s.subject.short}?`,
    a: `${s.rows[0].chapter.name}, with ${s.rows[0].count} of ${fmt(s.total)} ${s.subject.name} questions (${s.rows[0].share}%) across all shifts.`,
  }));
  out.push({ q: `How many questions are counted for JEE Main ${a.year}?`, a: `${fmt(a.total)} across Physics, Chemistry and Mathematics, counted across all shifts of the year.` });
  return out;
}

export const yearSubjectTitle = (y: string, s: SubjectYear) => `JEE Main ${y} ${s.subject.short} Chapter-Wise Analysis`;

export function yearSubjectDescription(sy: SubjectYear) {
  return `JEE Main ${sy.year} ${sy.subject.short}: ${fmt(sy.total)} questions across all shifts. Most asked: ${sy.rows[0].chapter.name}. Chapter counts and shares.`;
}

export function yearSubjectIntro(sy: SubjectYear): string[] {
  const top = sy.rows.slice(0, 3);
  const out = [
    `JEE Main ${sy.year} had ${fmt(sy.total)} ${sy.subject.name} questions across all shifts. The three chapters with the most were ${list(top.map((r) => `${r.chapter.name} (${r.count}, ${r.share}%)`))}.`,
  ];
  if (sy.yi > 0 && (sy.rises.length || sy.drops.length)) {
    const parts: string[] = [];
    if (sy.rises.length) parts.push(`${list(sy.rises.map((r) => `${r.chapter.name} (+${r.delta} points)`))} gained share`);
    if (sy.drops.length) parts.push(`${list(sy.drops.map((r) => `${r.chapter.name} (${r.delta} points)`))} lost share`);
    out.push(`Against ${prevYear(sy.year)}, ${parts.join(" while ")}.`);
  }
  if (sy.skipped.length) out.push(`No question came from ${list(sy.skipped.map((c) => c.name))} in ${sy.year}.`);
  if (sy.disappeared.length) out.push(`${list(sy.disappeared.map((c) => c.name))} ${sy.disappeared.length === 1 ? "was" : "were"} asked in ${prevYear(sy.year)} but not in ${sy.year}${sy.disappeared.every((c) => c.retired) ? `, and ${sy.disappeared.length === 1 ? "is" : "are"} no longer in the JEE Main 2026 syllabus` : ""}.`);
  if (sy.concepts.length) out.push(`The most repeated concepts that year were ${list(sy.concepts.slice(0, 3).map((x) => `${x.concept.name} (${x.count})`))}.`);
  return out;
}

export function yearSubjectFaq(sy: SubjectYear): Faq[] {
  const r0 = sy.rows[0];
  const out: Faq[] = [
    { q: `Which ${sy.subject.name} chapter had the most questions in JEE Main ${sy.year}?`, a: `${r0.chapter.name}, with ${r0.count} of ${fmt(sy.total)} questions (${r0.share}%) across all shifts.` },
    { q: `How many ${sy.subject.name} questions are counted for JEE Main ${sy.year}?`, a: `${fmt(sy.total)}, counted across all shifts of the year.` },
  ];
  if (sy.skipped.length) out.push({ q: `Which ${sy.subject.name} chapters had no questions in JEE Main ${sy.year}?`, a: `${list(sy.skipped.map((c) => c.name))} had no questions in the dataset for ${sy.year}.` });
  return out;
}

// ── Syllabus ───────────────────────────────────────────────────────────────
export const SYLLABUS_HUB_TITLE = "JEE Main Syllabus 2026: Physics, Chemistry, Maths";
export const syllabusHubDescription = () => `JEE Main 2026 syllabus by unit for Paper 1 (Physics, Chemistry, Maths), plus Paper 2A (B.Arch) and 2B (B.Planning), with each unit's weightage.`;

export function syllabusHubIntro(): string[] {
  const n = getJeeSubjects().map((s) => `${s.activeCount} units in ${s.name}`);
  return [
    `The JEE Main 2026 syllabus for Paper 1 (B.E./B.Tech.) has ${list(n)}. Open a subject for its unit-by-unit topics, each linked to the unit's weightage across ${RECENT_LABEL}.`,
    `Paper 2A (B.Arch) and Paper 2B (B.Planning) share the same Mathematics syllabus and add an aptitude test, plus a drawing test or a planning section.`,
  ];
}

export function syllabusHubFaq(): Faq[] {
  return [
    { q: "How many units are in the JEE Main 2026 syllabus?", a: `Paper 1 lists ${list(getJeeSubjects().map((s) => `${s.activeCount} units in ${s.name}`))}.` },
    { q: "Which chapters are no longer in the JEE Main syllabus?", a: `${droppedChapters().length} chapters from earlier papers are not listed in NTA's 2026 syllabus, including ${list(droppedChapters().slice(0, 4).map((c) => c.name))}. See the removed chapters page for the full list.` },
    { q: "Is the Mathematics syllabus the same for Paper 1 and Paper 2?", a: "Yes. Paper 2A (B.Arch) and Paper 2B (B.Planning) use the same 14 mathematics units as Paper 1." },
    { q: "Where does this syllabus come from?", a: "It paraphrases the JEE Main 2026 syllabus published by NTA. Always confirm the latest version on the official NTA website." },
  ];
}

export const syllabusSubjectTitle = (short: string) => `JEE Main ${short} Syllabus 2026, Unit-Wise`;
export const syllabusSubjectDescription = (key: string) => {
  const s = getJeeSubjects().find((x) => x.key === key)!;
  return `JEE Main 2026 ${s.name} syllabus: ${s.activeCount} units with topics, and each unit's weightage in ${RECENT_LABEL}.`;
};

export function syllabusSubjectIntro(key: string): string[] {
  const s = getJeeSubjects().find((x) => x.key === key)!;
  const units = syllabusUnits(key);
  const top = [...units].filter((u) => u.chapter.rank > 0).sort((a, b) => a.chapter.rank - b.chapter.rank).slice(0, 3);
  const out = [
    `The JEE Main 2026 ${s.name} syllabus has ${units.length} units. By share of questions in ${RECENT_LABEL}, the largest are ${list(top.map((u) => `Unit ${u.unit}, ${u.chapter.name} (${u.chapter.recentShare}%)`))}.`,
  ];
  const dropped = s.chapters.filter((c) => c.retired);
  if (dropped.length) out.push(`${plural(dropped.length, "chapter")} that earlier papers asked ${dropped.length === 1 ? "is" : "are"} not part of this syllabus: ${list(dropped.map((c) => c.name))}.`);
  return out;
}

export function syllabusSubjectFaq(key: string): Faq[] {
  const s = getJeeSubjects().find((x) => x.key === key)!;
  const units = syllabusUnits(key);
  const top = [...units].sort((a, b) => a.chapter.rank - b.chapter.rank)[0];
  return [
    { q: `How many units are in the JEE Main ${s.name} syllabus?`, a: `${units.length} units in the 2026 syllabus.` },
    { q: `Which JEE Main ${s.name} unit has the highest weightage?`, a: `Unit ${top.unit}, ${top.chapter.name}, with ${top.chapter.recentShare}% of ${s.name} questions in ${RECENT_LABEL}.` },
    { q: `Has the JEE Main ${s.name} syllabus changed?`, a: `${s.chapters.filter((c) => c.retired).length} chapters that earlier papers asked are not in the 2026 syllabus. Check NTA's official notice for the latest version.` },
  ];
}

export const paper2Title = (p: Paper2) => `JEE Main ${p.course} Syllabus 2026 (${p.name.split(" ").slice(0, 2).join(" ")})`;
export const paper2Description = (p: Paper2) => `JEE Main 2026 ${p.name} syllabus: mathematics, aptitude test and ${p.course === "B.Arch" ? "drawing test" : "planning"} topics.`;
export function paper2Faq(p: Paper2): Faq[] {
  return [
    { q: `What is in the JEE Main ${p.name} syllabus?`, a: `${list(p.parts.map((x) => x.title.replace(/^Part [IV]+: /, "")))}.` },
    { q: `Is the Mathematics syllabus for ${p.name} different from Paper 1?`, a: "No. It uses the same 14 mathematics units as Paper 1." },
    { q: "Where can I confirm the syllabus?", a: "The official JEE Main syllabus is published by NTA. Confirm it there, since it can change between years." },
  ];
}
export const paper2Others = () => PAPER2;

// ── Removed chapters ───────────────────────────────────────────────────────
export const REMOVED_TITLE = "JEE Main Removed Chapters: Not in 2026 Syllabus";
export const removedDescription = () => `${droppedChapters().length} chapters that JEE Main asked in 2022–2023 are not in NTA's 2026 syllabus: see them by subject with question counts.`;

export function removedIntro(): string[] {
  const d = droppedChapters();
  const qs = d.reduce((n, c) => n + c.total, 0);
  return [
    `${d.length} chapters that appear in earlier JEE Main papers are not listed in NTA's JEE Main 2026 syllabus: ${list(getJeeSubjects().map((s) => `${s.chapters.filter((c) => c.retired).length} in ${s.name}`))}. Together they accounted for ${fmt(qs)} questions between 2022 and 2026.`,
    `Most of those questions came in 2022 and 2023. If you are following the current syllabus, these chapters are not needed for JEE Main, though you may still need them for boards or other exams.`,
  ];
}

export function removedFaq(): Faq[] {
  const d = droppedChapters();
  return [
    { q: "Which chapters were removed from the JEE Main syllabus?", a: `${list(d.map((c) => c.name))} are not in NTA's JEE Main 2026 syllabus.` },
    { q: "Do I still need these chapters for JEE Main?", a: "Not for the 2026 syllabus as published. Check NTA's latest notice before dropping a chapter, since syllabus details can change." },
    { q: "Why do these chapters appear in earlier papers' data?", a: "Earlier papers were set on a wider syllabus, so the question counts for 2022 and 2023 still include them." },
  ];
}

// ── High-weightage chapters ────────────────────────────────────────────────
export const HIGH_TITLE = `High-Weightage JEE Main Chapters ${JEE_RANGE}`;
export const highDescription = () => `Which JEE Main chapters cover most of the paper? See how many Physics, Chemistry and Maths chapters make up 50%, 70% and 80% of recent questions.`;

export function highIntro(): string[] {
  const c = coverage();
  return [
    `A small set of chapters makes up most of each subject's questions. In ${RECENT_LABEL}: ${list(c.map((x) => `${x.need[1].chapters} of ${x.subject.activeCount} ${x.subject.short} chapters cover 70% of its questions`))}.`,
    `The tables rank chapters by their share of ${RECENT_LABEL} questions and add a running total so you can see where the cut-off falls.`,
  ];
}

export function highFaq(): Faq[] {
  const c = coverage();
  return [
    { q: "How many chapters cover most of JEE Main?", a: c.map((x) => `${x.subject.name}: ${x.need[2].chapters} of ${x.subject.activeCount} chapters cover 80% of questions in ${RECENT_LABEL}`).join("; ") + "." },
    { q: "Can I skip the low-weightage chapters?", a: "They carry fewer questions, but they still appear. Treat the ranking as a study order, not a reason to leave chapters out." },
    { q: "How is the running total calculated?", a: `Each chapter's share of ${RECENT_LABEL} questions from chapters still in the syllabus is added to the ones above it.` },
  ];
}

// ── Trends ─────────────────────────────────────────────────────────────────
export const TRENDS_TITLE = "JEE Main Chapter Trends: Rising and Falling";
export const trendsDescription = () => `JEE Main chapters gaining and losing share, ${RECENT_LABEL} against ${EARLIER_LABEL}, for Physics, Chemistry and Maths.`;

export function trendsIntro(): string[] {
  const m = movers();
  const top = m.rising.slice(0, 3);
  return [
    `Comparing ${RECENT_LABEL} with ${EARLIER_LABEL}, ${m.rising.length} of the ${jeeActiveChapters()} current chapters took a clearly bigger share of their subject and ${m.falling.length} took a clearly smaller one. The biggest gains were ${list(top.map((x) => `${x.chapter.name} (+${x.diff} points)`))}.`,
    `Shares are measured among chapters still in the syllabus, so removing a chapter does not make the others look like they are rising.`,
  ];
}

export function trendsFaq(): Faq[] {
  const m = movers();
  return [
    { q: "Which JEE Main chapters are asked more often now?", a: `${list(m.rising.slice(0, 5).map((x) => `${x.chapter.name} (${x.chapter.subjectShort})`))} gained the most share in ${RECENT_LABEL}.` },
    { q: "Which chapters are asked less often now?", a: `${list(m.falling.slice(0, 5).map((x) => `${x.chapter.name} (${x.chapter.subjectShort})`))} lost the most share in ${RECENT_LABEL}.` },
    { q: "What counts as rising or falling?", a: `A chapter is rising or falling when its average share in ${RECENT_LABEL} is at least a quarter higher or lower than in ${EARLIER_LABEL}, and the gap is at least 0.8 points.` },
  ];
}

export type { JeeChapter };
