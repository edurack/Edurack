// JEE Main percentile <-> rank maths for the free JEE tool (pure data + maths, safe on client and server).
//
// NTA defines the percentile as the share of candidates in a session who scored equal to or less than you, and builds
// the final rank list from each candidate's better NTA score across both sessions. So a rough All-India Rank is
//   rank ~ (100 - percentile) x candidates / 100.
// Candidate count: NTA sources reported 15,38,474 unique candidates appeared across both sessions of JEE Main 2026.
// NTA does NOT publish a marks-vs-percentile table (percentile is normalised shift by shift), so the marks bands
// below are only the range seen across the April 2026 shifts, compiled from shift-wise reports by Careers360, Vedantu
// and Cracku. Re-check them when a new session's reports come out.
import type { Faq } from "@/lib/neet-blueprint-copy";

export const JEE_MAIN_2026_APPEARED = 1_538_474;

/** Raw marks (out of 300) that earned each percentile across the April 2026 shifts: hardest shift to easiest shift. */
export const MARKS_BANDS: { percentile: number; marks: string }[] = [
  { percentile: 99, marks: "about 150 to 195" },
  { percentile: 98, marks: "about 130 to 175" },
  { percentile: 95, marks: "about 95 to 140" },
  { percentile: 90, marks: "about 60 to 110" },
];

/** Rough All-India Rank for an NTA percentile and a candidate count. */
export function rankFromPercentile(percentile: number, candidates: number): number {
  if (percentile >= 100) return 1;
  return Math.max(1, Math.round(((100 - percentile) * candidates) / 100));
}

/** NTA percentile for a rank: the share of candidates at or below that rank's position. */
export function percentileFromRank(rank: number, candidates: number): number {
  const p = ((candidates - rank + 1) / candidates) * 100;
  return Math.max(0, Math.min(100, Math.round(p * 10000) / 10000));
}

export const JEE_PERCENTILE_FAQ: Faq[] = [
  {
    q: "How is the JEE Main rank calculated from the percentile?",
    a: "NTA's percentile is the share of candidates in your session who scored equal to or less than you. A rough All-India Rank is (100 minus your percentile) times the number of candidates, divided by 100. NTA builds the final rank list from each candidate's better NTA score across both sessions and applies tie-breaking rules, so your real rank can differ a little from this estimate.",
  },
  {
    q: "How many candidates does the calculator use?",
    a: "By default it uses 15,38,474, the number of unique candidates NTA sources reported as appearing across both sessions of JEE Main 2026. You can change the number to see how the estimate moves.",
  },
  {
    q: "Does NTA publish marks versus percentile?",
    a: "No. Percentile is normalised shift by shift, so the same raw marks can give different percentiles in different shifts. The table on this page shows the range of raw marks that earned each percentile across the April 2026 shifts, compiled from shift-wise reports published by coaching and education sites, not by NTA.",
  },
  {
    q: "How many marks are needed for the 99th percentile in JEE Main?",
    a: "In the April 2026 session it took roughly 150 to 195 marks out of 300, depending on the shift. Tougher shifts needed fewer raw marks. Use it as a guide, not a promise, because the cut-off moves with every paper.",
  },
  {
    q: "Is this my exact All-India Rank?",
    a: "No. It is an estimate. Your actual rank depends on the final rank list, tie-breaking and your better score across both sessions, and category ranks are different from the All-India Rank.",
  },
  {
    q: "How many candidates become eligible for JEE Advanced?",
    a: "The top 2.5 lakh candidates across all categories, by JEE Main rank, become eligible to appear for JEE Advanced. NTA publishes the category-wise cut-offs along with the result.",
  },
];
