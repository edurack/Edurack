// Paper-by-paper analysis for /neet/paper-analysis/*, computed from the same tagged dataset as the
// chapter-wise weightage pages (neet-blueprint.ts), so the numbers on both can never disagree.
import { PAPER_LABELS, RANGE_LABEL, chapterPath, getSubjects, type Chapter, type Topic } from "@/lib/neet-blueprint";

export const PAPER_BASE = "/neet/paper-analysis";
export const PAPER_SLUGS = ["2020", "2021", "2022", "2023", "2024", "2025", "2026", "re-neet-2026"] as const;
export type PaperSlug = (typeof PAPER_SLUGS)[number];

export const paperIndexOf = (slug: string) => PAPER_SLUGS.indexOf(slug as PaperSlug);
export const paperPath = (slug: string) => `${PAPER_BASE}/${slug}`;
export const paperLabel = (i: number) => PAPER_LABELS[i];

export type PaperChapter = { chapter: Chapter; count: number; prev: number | null };
export type PaperTopic = Topic & { chapter: Chapter; inPaper: number };

export type PaperAnalysis = {
  index: number;
  slug: PaperSlug;
  label: string;
  total: number;
  subjects: { key: string; name: string; count: number; share: number }[];
  topChapters: PaperChapter[];
  /** Every chapter with at least one question, biggest first. */
  allChapters: PaperChapter[];
  absent: Chapter[];
  topTopics: PaperTopic[];
  /** Topics asked here that did not appear in any earlier paper (empty for the first paper). */
  firstTimeTopics: PaperTopic[];
  biggestRise: PaperChapter | null;
  biggestDrop: PaperChapter | null;
};

export function analyzePaper(slug: string): PaperAnalysis | null {
  const i = paperIndexOf(slug);
  if (i < 0) return null;
  const subjects = getSubjects();
  const chapters = subjects.flatMap((s) => s.chapters);
  const total = chapters.reduce((n, c) => n + c.years[i], 0);

  const rows: PaperChapter[] = chapters.map((c) => ({ chapter: c, count: c.years[i], prev: i > 0 ? c.years[i - 1] : null }));
  const allChapters = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.chapter.name.localeCompare(b.chapter.name));
  const topics: PaperTopic[] = chapters.flatMap((c) => c.topics.map((t) => ({ ...t, chapter: c, inPaper: t.years[i] })));
  const asked = topics.filter((t) => t.inPaper > 0);

  const withPrev = rows.filter((r) => r.prev !== null);
  const rise = [...withPrev].sort((a, b) => b.count - b.prev! - (a.count - a.prev!))[0];
  const drop = [...withPrev].sort((a, b) => a.count - a.prev! - (b.count - b.prev!))[0];

  return {
    index: i,
    slug: slug as PaperSlug,
    label: PAPER_LABELS[i],
    total,
    subjects: subjects.map((s) => {
      const count = s.chapters.reduce((n, c) => n + c.years[i], 0);
      return { key: s.key, name: s.name, count, share: total > 0 ? Math.round((count / total) * 100) : 0 };
    }),
    topChapters: allChapters.slice(0, 10),
    allChapters,
    absent: chapters.filter((c) => c.years[i] === 0),
    topTopics: [...asked].sort((a, b) => b.inPaper - a.inPaper || b.total - a.total).slice(0, 12),
    firstTimeTopics: asked.filter((t) => t.years.slice(0, i).every((n) => n === 0)).sort((a, b) => b.inPaper - a.inPaper).slice(0, 12),
    biggestRise: rise && rise.count - rise.prev! > 0 ? rise : null,
    biggestDrop: drop && drop.prev! - drop.count > 0 ? drop : null,
  };
}

export const paperTitle = (a: PaperAnalysis) => `${a.label} Paper Analysis: Chapter-wise Questions`;

export function paperDescription(a: PaperAnalysis) {
  const top = a.topChapters[0];
  return `${a.label} analysis from ${a.total} tagged questions: chapter-wise count for Physics, Chemistry, Botany and Zoology${top ? `, led by ${top.chapter.name} (${top.count})` : ""}. Free.`;
}

export function paperIntro(a: PaperAnalysis): string[] {
  const subj = a.subjects.map((s) => `${s.name} ${s.count}`).join(", ");
  const top = a.topChapters.slice(0, 3).map((r) => `${r.chapter.name} (${r.count})`).join(", ");
  return [
    `This is a chapter-wise breakdown of ${a.label}. Edurack tagged ${a.total} questions from this paper to NCERT chapters and topics. By subject: ${subj}.`,
    top ? `The chapters that asked the most questions were ${top}.` : "",
    `Counts come from Edurack's tagged question set for ${RANGE_LABEL}, so they can differ from other sources' counts. Use them to see where a paper's marks came from and which chapters to revise first.`,
  ].filter(Boolean);
}

export function paperFaq(a: PaperAnalysis) {
  const top = a.topChapters[0];
  const heaviest = [...a.subjects].sort((x, y) => y.count - x.count)[0];
  const out: { q: string; a: string }[] = [
    { q: `How many questions were tagged in ${a.label}?`, a: `Edurack tagged ${a.total} questions from ${a.label} to chapters: ${a.subjects.map((s) => `${s.name} ${s.count}`).join(", ")}.` },
  ];
  if (top) out.push({ q: `Which chapter had the most questions in ${a.label}?`, a: `${top.chapter.name} (${top.chapter.subjectName}) had the most, with ${top.count} questions.` });
  if (heaviest) out.push({ q: `Which subject had the most questions in ${a.label}?`, a: `${heaviest.name} had the most, with ${heaviest.count} questions (${heaviest.share}% of the tagged paper).` });
  if (a.absent.length > 0) out.push({ q: `Which chapters were not asked in ${a.label}?`, a: `${a.absent.length} of the ${a.allChapters.length + a.absent.length} chapters had no question, including ${a.absent.slice(0, 5).map((c) => c.name).join(", ")}.` });
  return out;
}

export const chapterHref = chapterPath;
