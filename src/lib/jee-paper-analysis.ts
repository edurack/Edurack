// src/lib/jee-paper-analysis.ts
//
// Year-by-year analysis built from the same JEE dataset as the weightage pages:
//   /jee/paper-analysis                    (hub)
//   /jee/paper-analysis/<year>             (2022 ... 2026)
//   /jee/paper-analysis/<year>/<subject>   (physics | chemistry | maths)
//
// Counts are questions across all shifts of that year, so a chapter's *share* of the subject's
// questions is what gets compared between years.
import { YEARS, getJeeSubject, getJeeSubjects, type JeeChapter, type JeeConcept, type JeeSubject } from "@/lib/jee-blueprint";

export const PAPER_BASE = "/jee/paper-analysis";
export const paperYearPath = (year: string) => `${PAPER_BASE}/${year}`;
export const paperSubjectPath = (year: string, subjectKey: string) => `${PAPER_BASE}/${year}/${subjectKey}`;
export const isJeeYear = (y: string) => YEARS.includes(y);

const r1 = (n: number) => Math.round(n * 10) / 10;

export type ChapterYearRow = { chapter: JeeChapter; count: number; share: number; prevShare?: number; delta?: number };

export type SubjectYear = {
  subject: JeeSubject;
  year: string;
  yi: number;
  total: number;
  rows: ChapterYearRow[];
  /** Chapters still in the syllabus with no question this year. */
  skipped: JeeChapter[];
  /** Asked the previous year, absent this year. */
  disappeared: JeeChapter[];
  rises: ChapterYearRow[];
  drops: ChapterYearRow[];
  concepts: { concept: JeeConcept; count: number }[];
  /** Questions this year from chapters that are no longer in the syllabus. */
  retiredCount: number;
};

export function analyzeSubjectYear(year: string, subjectKey: string): SubjectYear | undefined {
  const subject = getJeeSubject(subjectKey);
  const yi = YEARS.indexOf(year);
  if (!subject || yi < 0) return undefined;
  const total = subject.yearTotals[yi];
  const prevTotal = yi > 0 ? subject.yearTotals[yi - 1] : 0;
  const rows: ChapterYearRow[] = subject.chapters
    .filter((c) => c.years[yi] > 0)
    .map((c) => {
      const share = total > 0 ? r1((c.years[yi] / total) * 100) : 0;
      const prevShare = yi > 0 && prevTotal > 0 ? r1((c.years[yi - 1] / prevTotal) * 100) : undefined;
      return { chapter: c, count: c.years[yi], share, prevShare, delta: prevShare === undefined ? undefined : r1(share - prevShare) };
    })
    .sort((a, b) => b.count - a.count || a.chapter.name.localeCompare(b.chapter.name));
  const withDelta = rows.filter((r) => r.delta !== undefined);
  return {
    subject,
    year,
    yi,
    total,
    rows,
    skipped: subject.chapters.filter((c) => !c.retired && c.years[yi] === 0),
    disappeared: yi > 0 ? subject.chapters.filter((c) => c.years[yi] === 0 && c.years[yi - 1] > 0) : [],
    rises: withDelta.filter((r) => (r.delta ?? 0) >= 1.5).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 3),
    drops: withDelta.filter((r) => (r.delta ?? 0) <= -1.5).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 3),
    concepts: subject.concepts
      .map((k) => ({ concept: k, count: k.years[yi] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || b.concept.total - a.concept.total)
      .slice(0, 8),
    retiredCount: subject.chapters.filter((c) => c.retired).reduce((n, c) => n + c.years[yi], 0),
  };
}

export type YearAnalysis = {
  year: string;
  yi: number;
  total: number;
  subjects: SubjectYear[];
  /** Highest-share chapters of the year across the paper (each subject carries equal marks). */
  top: (ChapterYearRow & { paperShare: number })[];
  retiredCount: number;
};

export function analyzeYear(year: string): YearAnalysis | undefined {
  const yi = YEARS.indexOf(year);
  if (yi < 0) return undefined;
  const subjects = getJeeSubjects().map((s) => analyzeSubjectYear(year, s.key) as SubjectYear);
  const top = subjects
    .flatMap((sy) => sy.rows.map((r) => ({ ...r, paperShare: r1(r.share / 3) })))
    .sort((a, b) => b.paperShare - a.paperShare || b.count - a.count)
    .slice(0, 10);
  return { year, yi, total: subjects.reduce((n, s) => n + s.total, 0), subjects, top, retiredCount: subjects.reduce((n, s) => n + s.retiredCount, 0) };
}

/** Source caveat: the eBook's Chemistry 2024 and 2025 columns are split unevenly. */
export function yearDataCaution(year: string, subjectKey?: string): string | null {
  if ((year === "2024" || year === "2025") && (!subjectKey || subjectKey === "chemistry")) {
    return "In the source data the Chemistry counts for 2024 and 2025 look unevenly split between the two years, so read those two years together rather than as separate trends.";
  }
  return null;
}

export function allPaperPaths(): { path: string; kind: "paper-hub" | "paper-year" | "paper-subject" }[] {
  const out: { path: string; kind: "paper-hub" | "paper-year" | "paper-subject" }[] = [{ path: PAPER_BASE, kind: "paper-hub" }];
  for (const y of YEARS) {
    out.push({ path: paperYearPath(y), kind: "paper-year" });
    for (const s of getJeeSubjects()) out.push({ path: paperSubjectPath(y, s.key), kind: "paper-subject" });
  }
  return out;
}
