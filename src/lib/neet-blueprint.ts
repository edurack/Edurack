// src/lib/neet-blueprint.ts
//
// Read-side helpers for the public NEET PYQ Blueprint pages:
//   /neet/chapter-wise-weightage                      (hub)
//   /neet/chapter-wise-weightage/<subject>            (e.g. physics)
//   /neet/chapter-wise-weightage/<subject>/<chapter>  (e.g. current-electricity)
//
// Everything the pages say is computed from neet-blueprint-data.ts, so a
// number on the page can never drift from the dataset.
import { BLUEPRINT_RAW, type RawChapter, type RawSubject } from "@/lib/neet-blueprint-data";

export const BLUEPRINT_BASE = "/neet/chapter-wise-weightage";
export const RANGE_LABEL = "2020–2026";

export const PAPER_LABELS = ["NEET 2020", "NEET 2021", "NEET 2022", "NEET 2023", "NEET 2024", "NEET 2025", "NEET 2026", "Re-NEET 2026"] as const;
export const PAPER_SHORT = ["2020", "2021", "2022", "2023", "2024", "2025", "2026", "Re"] as const;
const LATEST_PAPERS = [6, 7]; // indexes of NEET 2026 and Re-NEET 2026

export type Topic = {
  name: string;
  years: number[];
  total: number;
  easy: number;
  med: number;
  hard: number;
  /** In how many of the 8 papers this topic appeared. */
  papers: number;
};

export type Chapter = {
  slug: string;
  name: string;
  subjectKey: string;
  subjectName: string;
  total: number;
  easy: number;
  med: number;
  hard: number;
  years: number[];
  topics: Topic[];
  /** 1 = highest-weightage chapter of its subject. */
  rank: number;
  /** % of the subject's questions, one decimal. */
  share: number;
};

export type Subject = { key: string; name: string; total: number; chapters: Chapter[] };

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function build(raw: RawSubject): Subject {
  const chapters: Chapter[] = raw.chapters.map((c: RawChapter, i) => ({
    slug: c.slug,
    name: c.name,
    subjectKey: raw.key,
    subjectName: raw.name,
    total: c.total,
    easy: c.easy,
    med: c.med,
    hard: c.hard,
    years: c.years,
    rank: i + 1,
    share: Math.round((c.total / raw.total) * 1000) / 10,
    topics: c.topics.map(([name, years, easy, med, hard]) => ({
      name,
      years,
      total: sum(years),
      easy,
      med,
      hard,
      papers: years.filter((n) => n > 0).length,
    })),
  }));
  return { key: raw.key, name: raw.name, total: raw.total, chapters };
}

const SUBJECTS: Subject[] = BLUEPRINT_RAW.subjects.map(build);

export function getSubjects(): Subject[] {
  return SUBJECTS;
}
export function getSubject(key: string): Subject | undefined {
  return SUBJECTS.find((s) => s.key === key);
}
export function getChapter(subjectKey: string, slug: string): Chapter | undefined {
  return getSubject(subjectKey)?.chapters.find((c) => c.slug === slug);
}

export const subjectPath = (subjectKey: string) => `${BLUEPRINT_BASE}/${subjectKey}`;
export const chapterPath = (subjectKey: string, slug: string) => `${BLUEPRINT_BASE}/${subjectKey}/${slug}`;

/** Every public blueprint URL — hub, subjects and chapters — for the sitemap. */
export function allBlueprintPaths(): { path: string; kind: "hub" | "subject" | "chapter" }[] {
  const out: { path: string; kind: "hub" | "subject" | "chapter" }[] = [{ path: BLUEPRINT_BASE, kind: "hub" }];
  for (const s of SUBJECTS) {
    out.push({ path: subjectPath(s.key), kind: "subject" });
    for (const c of s.chapters) out.push({ path: chapterPath(s.key, c.slug), kind: "chapter" });
  }
  return out;
}

/** Search params for the existing /pyq practice page. */
export function practiceSearch(subjectName: string, chapterName?: string) {
  return { exam: "neet" as const, subject: subjectName, ...(chapterName ? { chapter: chapterName } : {}) };
}

const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The blueprint chapter for a question's (subject, chapter) tags; undefined when the names don't match. */
export function findChapterByNames(subjectName: string, chapterName: string): Chapter | undefined {
  const s = SUBJECTS.find((x) => normName(x.name) === normName(subjectName));
  return s?.chapters.find((c) => normName(c.name) === normName(chapterName));
}

export type TopicMatch = { total: number; papers: number; rows: number };

/**
 * How often a topic was asked. Blueprint rows carry the sub-topic in brackets
 * ("Transcription (Types of RNA)"), so a question tagged "Transcription" matches
 * every row that is exactly that or starts with it. Null when nothing matches.
 */
export function matchTopic(c: Chapter, topicName: string): TopicMatch | null {
  const t = normName(topicName);
  if (!t) return null;
  const rows = c.topics.filter((x) => {
    const n = normName(x.name);
    return n === t || n.startsWith(`${t} (`);
  });
  if (rows.length === 0) return null;
  const papers = PAPER_LABELS.filter((_, i) => rows.some((r) => (r.years[i] ?? 0) > 0)).length;
  return { total: sum(rows.map((r) => r.total)), papers, rows: rows.length };
}

export const totalQuestions = () => sum(SUBJECTS.map((s) => s.total));
export const totalChapters = () => sum(SUBJECTS.map((s) => s.chapters.length));

// ─── Insights ──────────────────────────────────────────────────────────────
export type ChapterInsights = {
  easyPct: number;
  medPct: number;
  hardPct: number;
  perPaperAvg: number;
  peakPaperIndex: number;
  mostTested: Topic[];
  /** Appeared in 3+ different papers. */
  recurring: Topic[];
  /** Asked in NEET 2026 or Re-NEET 2026. */
  latest: Topic[];
  /** Has at least one question tagged hard — hardest first. */
  hardest: Topic[];
  trend: "rising" | "steady" | "falling";
  recentAvg: number;
  earlierAvg: number;
  zeroRecently: boolean;
};

export function chapterInsights(c: Chapter): ChapterInsights {
  const tagged = c.easy + c.med + c.hard;
  const byTotal = [...c.topics].sort((a, b) => b.total - a.total || b.papers - a.papers);
  const recentAvg = sum(c.years.slice(5)) / 3; // 2025, 2026, Re-NEET
  const earlierAvg = sum(c.years.slice(0, 3)) / 3; // 2020–2022
  const trend: ChapterInsights["trend"] =
    recentAvg >= earlierAvg * 1.3 && recentAvg - earlierAvg >= 0.5 ? "rising" : recentAvg <= earlierAvg * 0.7 && earlierAvg - recentAvg >= 0.5 ? "falling" : "steady";
  // Easy and hard are rounded; medium takes the remainder so the three always add to 100.
  const easyPct = pct(c.easy, tagged);
  const hardPct = pct(c.hard, tagged);
  const medPct = tagged > 0 ? Math.max(0, 100 - easyPct - hardPct) : 0;
  return {
    easyPct,
    medPct,
    hardPct,
    perPaperAvg: Math.round((c.total / 8) * 10) / 10,
    peakPaperIndex: c.years.indexOf(Math.max(...c.years)),
    mostTested: byTotal.slice(0, 5),
    recurring: byTotal.filter((t) => t.papers >= 3).slice(0, 6),
    latest: byTotal.filter((t) => LATEST_PAPERS.some((i) => t.years[i] > 0)).slice(0, 6),
    hardest: [...c.topics].filter((t) => t.hard > 0).sort((a, b) => b.hard - a.hard || b.total - a.total).slice(0, 5),
    trend,
    recentAvg: Math.round(recentAvg * 10) / 10,
    earlierAvg: Math.round(earlierAvg * 10) / 10,
    zeroRecently: c.years.slice(4).every((n) => n === 0),
  };
}

/**
 * Topic names carry the sub-topic in brackets, e.g. "Pollination (Types of Pollination/…)",
 * and the bracket is often what tells two topics apart ("Population" alone is ambiguous),
 * so the full name is kept and only very long ones are shortened.
 */
export function topicLabel(name: string, max = 80): string {
  return name.length <= max ? name : name.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

/** Chapters worth scoring from: enough questions to matter, and mostly easy. */
export function easiestChapters(minQuestions = 10, limit = 12): Chapter[] {
  return SUBJECTS.flatMap((s) => s.chapters)
    .filter((c) => c.total >= minQuestions)
    .sort((a, b) => b.easy / Math.max(1, b.easy + b.med + b.hard) - a.easy / Math.max(1, a.easy + a.med + a.hard))
    .slice(0, limit);
}

/** The most-repeated individual topics across the whole NEET syllabus. */
export function mostRepeatedTopics(limit = 15): (Topic & { chapter: Chapter })[] {
  return SUBJECTS.flatMap((s) => s.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, chapter: c }))))
    .sort((a, b) => b.total - a.total || b.papers - a.papers)
    .slice(0, limit);
}

export function topChaptersOverall(limit = 15): Chapter[] {
  return SUBJECTS.flatMap((s) => s.chapters).sort((a, b) => b.total - a.total).slice(0, limit);
}
