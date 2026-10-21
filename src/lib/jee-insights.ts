// src/lib/jee-insights.ts
//
// Derived views over the JEE dataset for three page types:
//   /jee/high-weightage-chapters   cumulative share (how few chapters cover most of the paper)
//   /jee/chapter-trends            chapters gaining / losing share
//   /jee/removed-chapters          chapters not in the 2026 syllabus
import { getJeeSubjects, type JeeChapter, type JeeSubject } from "@/lib/jee-blueprint";

export const HIGH_WEIGHT_PATH = "/jee/high-weightage-chapters";
export const TRENDS_PATH = "/jee/chapter-trends";
export const REMOVED_PATH = "/jee/removed-chapters";

const r1 = (n: number) => Math.round(n * 10) / 10;

export type CumRow = { chapter: JeeChapter; share: number; cumulative: number };
export type Coverage = { subject: JeeSubject; rows: CumRow[]; need: { target: number; chapters: number }[] };

/** Active chapters by recent share with a running total, plus how many chapters reach 50/70/80%. */
export function coverage(): Coverage[] {
  return getJeeSubjects().map((subject) => {
    let run = 0;
    const rows: CumRow[] = subject.chapters
      .filter((c) => !c.retired)
      .map((c) => {
        run += c.recentShare;
        return { chapter: c, share: c.recentShare, cumulative: r1(Math.min(run, 100)) };
      });
    const need = [50, 70, 80].map((target) => ({ target, chapters: rows.findIndex((r) => r.cumulative >= target) + 1 }));
    return { subject, rows, need };
  });
}

export type Mover = { chapter: JeeChapter; diff: number };

export function movers(): { rising: Mover[]; falling: Mover[]; byPerSubject: { subject: JeeSubject; rising: Mover[]; falling: Mover[]; steady: number }[] } {
  const all: Mover[] = getJeeSubjects().flatMap((s) =>
    s.chapters.filter((c) => !c.retired).map((c) => ({ chapter: c, diff: r1(c.recentAvgShare - c.earlierAvgShare) })),
  );
  const rising = all.filter((m) => m.chapter.trend === "rising").sort((a, b) => b.diff - a.diff);
  const falling = all.filter((m) => m.chapter.trend === "falling").sort((a, b) => a.diff - b.diff);
  const byPerSubject = getJeeSubjects().map((subject) => ({
    subject,
    rising: rising.filter((m) => m.chapter.subjectKey === subject.key),
    falling: falling.filter((m) => m.chapter.subjectKey === subject.key),
    steady: subject.chapters.filter((c) => !c.retired && c.trend === "steady").length,
  }));
  return { rising, falling, byPerSubject };
}

export function removedByLastYear(c: JeeChapter): string {
  const last = [...c.years].map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0).pop();
  return last === undefined ? "–" : ["2022", "2023", "2024", "2025", "2026"][last];
}
