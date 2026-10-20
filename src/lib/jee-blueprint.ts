// src/lib/jee-blueprint.ts
//
// Read-side helpers for the public JEE Main weightage pages:
//   /jee/chapter-wise-weightage                      (hub)
//   /jee/chapter-wise-weightage/<subject>            (physics | chemistry | maths)
//   /jee/chapter-wise-weightage/<subject>/<chapter>  (e.g. optics)
//   /jee/most-repeated-concepts
//
// Everything the pages say is computed from jee-blueprint-data.ts, so a number
// on a page can never drift from the dataset.
//
// Important: the number of shifts differs from year to year (2022 had far more
// than 2025), so raw counts are NOT comparable across years. Trends therefore
// use each chapter's *share of that year's questions from chapters still in the syllabus*, never raw counts.
import { JEE_RAW, JEE_YEARS, type JeeRawSubject } from "@/lib/jee-blueprint-data";

export const JEE_BASE = "/jee/chapter-wise-weightage";
export const JEE_CONCEPTS_PATH = "/jee/most-repeated-concepts";
export const JEE_RANGE = "2022–2026";
export const YEARS: readonly string[] = JEE_YEARS;
/** Index of the first of the "recent" years (2024, 2025, 2026). */
const RECENT_FROM = 2;
export const RECENT_LABEL = "2024–2026";
export const EARLIER_LABEL = "2022–2023";

export type JeeChapter = {
  slug: string;
  name: string;
  subjectKey: string;
  subjectName: string;
  subjectShort: string;
  years: number[];
  /** Share of each year's questions (chapters still in the syllabus; all chapters for dropped ones), %, one decimal. */
  yearShares: number[];
  total: number;
  /** Questions in 2024–2026. */
  recent: number;
  /** % of the subject's questions over 2022–2026, one decimal. */
  share: number;
  /** % of 2024–2026 questions from chapters still in the syllabus, one decimal. */
  recentShare: number;
  /** Rough % of the whole paper (each subject carries equal marks). */
  paperShare: number;
  /** 1 = highest recent weightage among chapters still in the syllabus; 0 for dropped chapters. */
  rank: number;
  /** Not in the JEE Main 2026 syllabus. */
  retired: boolean;
  syllabus: string;
  yearsAsked: number;
  peakIndex: number;
  trend: "rising" | "steady" | "falling";
  recentAvgShare: number;
  earlierAvgShare: number;
};

export type JeeConcept = {
  name: string;
  subjectKey: string;
  subjectName: string;
  years: number[];
  total: number;
  yearsAsked: number;
  chapterSlug?: string;
};

export type JeeSubject = {
  key: string;
  name: string;
  short: string;
  total: number;
  yearTotals: number[];
  /** Active chapters by rank first, then dropped chapters by total. */
  chapters: JeeChapter[];
  activeCount: number;
  concepts: JeeConcept[];
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

function build(raw: JeeRawSubject): JeeSubject {
  const yearTotals = YEARS.map((_, i) => sum(raw.chapters.map((c) => c.years[i] ?? 0)));
  const total = sum(yearTotals);
  // Trends and "recent share" are measured against chapters still in the syllabus only. Otherwise every
  // surviving chapter looks like it is "rising" just because dropped chapters stopped taking questions.
  const activeYearTotals = YEARS.map((_, i) => sum(raw.chapters.filter((c) => !c.retired).map((c) => c.years[i] ?? 0)));
  const recentActiveTotal = sum(activeYearTotals.slice(RECENT_FROM));
  const slugToName = new Map(raw.chapters.map((c) => [c.name, c.slug]));

  const chapters: JeeChapter[] = raw.chapters.map((c) => {
    const t = sum(c.years);
    const recent = sum(c.years.slice(RECENT_FROM));
    const base = c.retired ? yearTotals : activeYearTotals;
    const rawYearShares = c.years.map((n, i) => (base[i] > 0 ? (n / base[i]) * 100 : 0));
    const recentAvgShare = avg(rawYearShares.slice(RECENT_FROM));
    const earlierAvgShare = avg(rawYearShares.slice(0, RECENT_FROM));
    const diff = recentAvgShare - earlierAvgShare;
    const trend: JeeChapter["trend"] =
      recentAvgShare >= earlierAvgShare * 1.25 && diff >= 0.8 ? "rising" : recentAvgShare <= earlierAvgShare * 0.75 && diff <= -0.8 ? "falling" : "steady";
    const recentShare = recentActiveTotal > 0 ? (recent / recentActiveTotal) * 100 : 0;
    return {
      slug: c.slug,
      name: c.name,
      subjectKey: raw.key,
      subjectName: raw.name,
      subjectShort: raw.short,
      years: c.years,
      yearShares: rawYearShares.map(r1),
      total: t,
      recent,
      share: total > 0 ? r1((t / total) * 100) : 0,
      recentShare: r1(recentShare),
      paperShare: r1(recentShare / 3),
      rank: 0,
      retired: c.retired,
      syllabus: c.syllabus,
      yearsAsked: c.years.filter((n) => n > 0).length,
      peakIndex: c.years.indexOf(Math.max(...c.years)),
      trend,
      recentAvgShare: r1(recentAvgShare),
      earlierAvgShare: r1(earlierAvgShare),
    };
  });

  const active = chapters.filter((c) => !c.retired).sort((a, b) => b.recent - a.recent || b.total - a.total);
  active.forEach((c, i) => (c.rank = i + 1));
  const dropped = chapters.filter((c) => c.retired).sort((a, b) => b.total - a.total);

  const concepts: JeeConcept[] = (JEE_RAW.concepts[raw.key] ?? [])
    .map((k) => ({
      name: k.name,
      subjectKey: raw.key,
      subjectName: raw.name,
      years: k.years,
      total: sum(k.years),
      yearsAsked: k.years.filter((n) => n > 0).length,
      chapterSlug: k.chapter ? slugToName.get(k.chapter) : undefined,
    }))
    .sort((a, b) => b.total - a.total || b.yearsAsked - a.yearsAsked || a.name.localeCompare(b.name));

  return { key: raw.key, name: raw.name, short: raw.short, total, yearTotals, chapters: [...active, ...dropped], activeCount: active.length, concepts };
}

const SUBJECTS: JeeSubject[] = JEE_RAW.subjects.map(build);

export const getJeeSubjects = (): JeeSubject[] => SUBJECTS;
export const getJeeSubject = (key: string): JeeSubject | undefined => SUBJECTS.find((s) => s.key === key);
export const getJeeChapter = (subjectKey: string, slug: string): JeeChapter | undefined => getJeeSubject(subjectKey)?.chapters.find((c) => c.slug === slug);

export const jeeSubjectPath = (subjectKey: string) => `${JEE_BASE}/${subjectKey}`;
export const jeeChapterPath = (subjectKey: string, slug: string) => `${JEE_BASE}/${subjectKey}/${slug}`;

/** Every public JEE weightage URL — hub, subjects and chapters — for the sitemap. */
export function allJeePaths(): { path: string; kind: "hub" | "subject" | "chapter" | "concepts" }[] {
  const out: { path: string; kind: "hub" | "subject" | "chapter" | "concepts" }[] = [{ path: JEE_BASE, kind: "hub" }];
  for (const s of SUBJECTS) {
    out.push({ path: jeeSubjectPath(s.key), kind: "subject" });
    for (const c of s.chapters) out.push({ path: jeeChapterPath(s.key, c.slug), kind: "chapter" });
  }
  out.push({ path: JEE_CONCEPTS_PATH, kind: "concepts" });
  return out;
}

/** Search params for the existing /pyq practice page. Subject only — chapter names differ from the eBook's. */
export function jeePracticeSearch(subjectShort?: string) {
  return { exam: "jee" as const, ...(subjectShort ? { subject: subjectShort } : {}) };
}

export const jeeTotalQuestions = () => sum(SUBJECTS.map((s) => s.total));
export const jeeTotalChapters = () => sum(SUBJECTS.map((s) => s.chapters.length));
export const jeeActiveChapters = () => sum(SUBJECTS.map((s) => s.activeCount));

/** Chapters still in the syllabus, highest share of the whole paper in 2024–2026 first. */
export function topJeeChaptersOverall(limit = 15): JeeChapter[] {
  return SUBJECTS.flatMap((s) => s.chapters)
    .filter((c) => !c.retired)
    .sort((a, b) => b.paperShare - a.paperShare || b.total - a.total)
    .slice(0, limit);
}

export const droppedChapters = (): JeeChapter[] => SUBJECTS.flatMap((s) => s.chapters.filter((c) => c.retired));

export function conceptsForChapter(c: JeeChapter): JeeConcept[] {
  return (getJeeSubject(c.subjectKey)?.concepts ?? []).filter((k) => k.chapterSlug === c.slug);
}

export function topJeeConceptsOverall(limit = 20): JeeConcept[] {
  return SUBJECTS.flatMap((s) => s.concepts)
    .sort((a, b) => b.total - a.total || b.yearsAsked - a.yearsAsked)
    .slice(0, limit);
}

/** Previous / next chapter in the subject's ranked order (active chapters only). */
export function neighbours(c: JeeChapter): { prev?: JeeChapter; next?: JeeChapter } {
  const list = (getJeeSubject(c.subjectKey)?.chapters ?? []).filter((x) => !x.retired);
  const i = list.findIndex((x) => x.slug === c.slug);
  if (i < 0) return {};
  return { prev: list[i - 1], next: list[i + 1] };
}
