// One page per (paper, subject): /neet/paper-analysis/<year>/<subject>, e.g. NEET 2024 Physics.
// Computed from the same tagged dataset as every other NEET page, so the numbers can never disagree.
//
// Why these pages are not thin: each one is its own cut of the data — that subject's chapters in that
// paper with the topics actually asked inside each chapter, what changed from the previous paper, and
// how the subject compares across all 8 papers. A subject with no question in a paper gets no page.
import { PAPER_LABELS, RANGE_LABEL, getSubject, type Chapter, type Subject } from "@/lib/neet-blueprint";
import { PAPER_BASE, PAPER_SLUGS, paperIndexOf } from "@/lib/neet-paper-analysis";

export const paperSubjectPath = (paperSlug: string, subjectKey: string) => `${PAPER_BASE}/${paperSlug}/${subjectKey}`;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export type AskedTopic = { name: string; inPaper: number; papers: number; total: number; firstTime: boolean };
export type PaperSubjectChapter = { chapter: Chapter; count: number; prev: number | null; topics: AskedTopic[] };

export type PaperSubject = {
  index: number;
  slug: string;
  label: string;
  subject: Subject;
  count: number;
  /** % of all tagged questions in this paper. */
  share: number;
  paperTotal: number;
  /** 1 = the biggest section of this subject among the 8 papers (ties share a rank). */
  rank: number;
  min: number;
  max: number;
  perPaper: { slug: string; label: string; count: number }[];
  prevLabel: string | null;
  prevCount: number | null;
  /** Chapters with at least one question, biggest first. */
  chapters: PaperSubjectChapter[];
  absent: Chapter[];
  firstTimeTopics: { name: string; chapter: Chapter; inPaper: number }[];
  biggestRise: { chapter: Chapter; from: number; to: number } | null;
  biggestDrop: { chapter: Chapter; from: number; to: number } | null;
};

/** Null when the paper or subject doesn't exist, or the subject had no tagged question in that paper. */
export function analyzePaperSubject(paperSlug: string, subjectKey: string): PaperSubject | null {
  const i = paperIndexOf(paperSlug);
  const subject = getSubject(subjectKey);
  if (i < 0 || !subject) return null;

  const count = sum(subject.chapters.map((c) => c.years[i]));
  if (count === 0) return null;

  const paperTotal = sum(subjectKeys().map((k) => sum((getSubject(k)?.chapters ?? []).map((c) => c.years[i]))));
  const perPaper = PAPER_SLUGS.map((slug, j) => ({ slug, label: PAPER_LABELS[j], count: sum(subject.chapters.map((c) => c.years[j])) }));
  const counts = perPaper.map((p) => p.count);

  const chapters: PaperSubjectChapter[] = subject.chapters
    .filter((c) => c.years[i] > 0)
    .map((c) => ({
      chapter: c,
      count: c.years[i],
      prev: i > 0 ? c.years[i - 1] : null,
      topics: c.topics
        .filter((t) => t.years[i] > 0)
        .map((t) => ({
          name: t.name,
          inPaper: t.years[i],
          papers: t.papers,
          total: t.total,
          firstTime: i > 0 && t.years.slice(0, i).every((n) => n === 0),
        }))
        .sort((a, b) => b.inPaper - a.inPaper || b.total - a.total || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count || a.chapter.name.localeCompare(b.chapter.name));

  const withPrev = subject.chapters.filter(() => i > 0).map((c) => ({ chapter: c, from: c.years[i - 1], to: c.years[i] }));
  const rise = [...withPrev].sort((a, b) => b.to - b.from - (a.to - a.from))[0];
  const drop = [...withPrev].sort((a, b) => a.to - a.from - (b.to - b.from))[0];

  return {
    index: i,
    slug: paperSlug,
    label: PAPER_LABELS[i],
    subject,
    count,
    share: paperTotal > 0 ? Math.round((count / paperTotal) * 100) : 0,
    paperTotal,
    rank: 1 + counts.filter((n) => n > count).length,
    min: Math.min(...counts),
    max: Math.max(...counts),
    perPaper,
    prevLabel: i > 0 ? PAPER_LABELS[i - 1] : null,
    prevCount: i > 0 ? counts[i - 1] : null,
    chapters,
    absent: subject.chapters.filter((c) => c.years[i] === 0),
    firstTimeTopics: chapters
      .flatMap((r) => r.topics.filter((t) => t.firstTime).map((t) => ({ name: t.name, chapter: r.chapter, inPaper: t.inPaper })))
      .sort((a, b) => b.inPaper - a.inPaper)
      .slice(0, 10),
    biggestRise: rise && rise.to - rise.from > 0 ? rise : null,
    biggestDrop: drop && drop.from - drop.to > 0 ? drop : null,
  };
}

// Subject keys, in the dataset's order. Kept local so this file needs only getSubject().
function subjectKeys(): string[] {
  return ["physics", "chemistry", "botany", "zoology"];
}

/** Every (paper, subject) pair that gets a page — the sitemap and the cross-links use this. */
export function allPaperSubjectPages(): { paper: string; subject: string }[] {
  return PAPER_SLUGS.flatMap((paper) => subjectKeys().filter((s) => analyzePaperSubject(paper, s)).map((subject) => ({ paper, subject })));
}

export const paperSubjectTitle = (a: PaperSubject) => `${a.label} ${a.subject.name}: Chapter-wise Paper Analysis`;

export function paperSubjectDescription(a: PaperSubject) {
  const top = a.chapters[0];
  return `${a.label} ${a.subject.name}: ${a.count} tagged questions across ${a.chapters.length} chapters${top ? `, led by ${top.chapter.name} (${top.count})` : ""}. Chapter-wise count, topics asked, what changed. Free.`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function paperSubjectIntro(a: PaperSubject): string[] {
  const s = a.subject.name;
  const top3 = a.chapters.slice(0, 3).map((r) => `${r.chapter.name} (${r.count})`).join(", ");
  const out = [
    `${a.label} had ${a.count} ${s} questions tagged by Edurack, ${a.share}% of the ${a.paperTotal} tagged questions in the paper. They came from ${a.chapters.length} of the ${a.subject.chapters.length} ${s} chapters.`,
    top3 ? `The chapters that asked the most were ${top3}.` : "",
  ];
  if (a.prevCount !== null && a.prevLabel) {
    const d = a.count - a.prevCount;
    out.push(
      d === 0
        ? `That is the same as ${a.prevLabel}, which also had ${a.prevCount} ${s} questions.`
        : `That is ${plural(Math.abs(d), "question")} ${d > 0 ? "more" : "fewer"} than ${a.prevLabel} (${a.prevCount}).`,
    );
  }
  out.push(
    a.rank === 1 && a.max !== a.min
      ? `Across the 8 papers in ${RANGE_LABEL}, this is the biggest ${s} section; it ranged from ${a.min} to ${a.max} questions.`
      : `Across the 8 papers in ${RANGE_LABEL}, ${s} ranged from ${a.min} to ${a.max} questions, and this paper ranks #${a.rank} of 8 by ${s} count.`,
  );
  return out.filter(Boolean);
}

export function paperSubjectFaq(a: PaperSubject): { q: string; a: string }[] {
  const s = a.subject.name;
  const topCount = a.chapters[0]?.count ?? 0;
  const leaders = a.chapters.filter((r) => r.count === topCount).slice(0, 3).map((r) => r.chapter.name);
  const out: { q: string; a: string }[] = [
    { q: `How many ${s} questions were in ${a.label}?`, a: `Edurack tagged ${a.count} ${s} questions from ${a.label}, ${a.share}% of the ${a.paperTotal} tagged questions in that paper.` },
  ];
  if (leaders.length > 0) out.push({ q: `Which ${s} chapter had the most questions in ${a.label}?`, a: `${leaders.join(" and ")} had the most, with ${topCount} ${topCount === 1 ? "question" : "questions"}${leaders.length > 1 ? " each" : ""}.` });
  out.push({
    q: `Which ${s} chapters were not asked in ${a.label}?`,
    a: a.absent.length === 0 ? `Every ${s} chapter had at least one question in ${a.label}.` : `${a.absent.length} of the ${a.subject.chapters.length} ${s} chapters had no question, including ${a.absent.slice(0, 5).map((c) => c.name).join(", ")}.`,
  });
  if (a.firstTimeTopics.length > 0) out.push({ q: `Which ${s} topics were new in ${a.label}?`, a: `Topics with no question in any earlier paper included ${a.firstTimeTopics.slice(0, 3).map((t) => t.name.split("(")[0].trim()).join(", ")}.` });
  if (a.prevLabel && (a.biggestRise || a.biggestDrop)) {
    const parts = [
      a.biggestRise ? `${a.biggestRise.chapter.name} rose from ${a.biggestRise.from} to ${a.biggestRise.to}` : "",
      a.biggestDrop ? `${a.biggestDrop.chapter.name} fell from ${a.biggestDrop.from} to ${a.biggestDrop.to}` : "",
    ].filter(Boolean);
    out.push({ q: `How did ${s} change from ${a.prevLabel} to ${a.label}?`, a: `${parts.join(", while ")}.` });
  }
  return out;
}
