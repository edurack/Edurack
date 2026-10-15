// Marks → All-India-Rank data for the free NEET tools (pure data + maths, safe on client and server).
//
// Source: the marks-vs-rank bands published after NEET UG 2023, 2024 and 2025 (as compiled by
// Physics Wallah and Zynerd from NTA's result data), and appeared-candidate counts from Careers360.
// These are bands, not every single mark, so the tools interpolate inside a band and say so.
// Each knot is [marks, AIR]: a band's top mark pairs with its first rank, its bottom mark with its last rank.

export type RankYear = "2025" | "2024" | "2023";

export const RANK_YEARS: RankYear[] = ["2025", "2024", "2023"];

export const YEAR_INFO: Record<RankYear, { appeared: number; topMarks: number; note: string }> = {
  "2025": { appeared: 2_209_318, topMarks: 686, note: "A tougher paper: the topper scored 686 and 600+ was about AIR 1,400." },
  "2024": { appeared: 2_333_162, topMarks: 720, note: "An unusually high-scoring year: 600+ was about AIR 78,000." },
  "2023": { appeared: 2_038_596, topMarks: 720, note: "A moderate paper: 600+ was about AIR 29,000." },
};

// NTA's single-mark data points for 2025 (from the same compilation); merged in so the steep top end is not smoothed over.
const FINE_2025: [number, number][] = [[662, 33], [625, 158], [607, 1022], [605, 1047], [582, 3200], [563, 7497], [543, 15000], [532, 22000], [528, 25000], [523, 29000], [520, 31450], [516, 35000], [405, 199000], [342, 335000]];

const RAW_KNOTS: Record<RankYear, [number, number][]> = {
  "2025": [[686, 1], [685, 2], [600, 1413], [599, 1414], [550, 12462], [549, 12463], [500, 52674], [499, 52777], [450, 122739], [449, 122766], [400, 211144], [399, 211607], [350, 317082], [349, 317367], [300, 444911], [299, 444917], [250, 603608], [249, 603804], [200, 803216], [199, 803337], [113, 1317215]],
  "2024": [[720, 1], [719, 2], [686, 4809], [685, 4812], [600, 77879], [599, 78088], [550, 138178], [549, 138189], [500, 205883], [499, 205932], [450, 283506], [449, 283637], [400, 375401], [399, 375435], [350, 483854], [349, 484038], [300, 614192], [299, 614526], [250, 772779], [249, 773710], [200, 972391], [199, 972603], [127, 1395905]],
  "2023": [[720, 1], [719, 2], [686, 1048], [685, 1049], [600, 29335], [599, 29406], [550, 64502], [549, 64531], [500, 109082], [499, 109136], [450, 164013], [449, 164045], [400, 231325], [399, 231488], [350, 315918], [349, 316013], [300, 421422], [299, 421654], [250, 552988], [249, 553012], [200, 718519], [199, 718880], [107, 1221896]],
};

const KNOTS: Record<RankYear, [number, number][]> = {
  "2025": [...RAW_KNOTS["2025"], ...FINE_2025].sort((a, b) => b[0] - a[0] || a[1] - b[1]),
  "2024": RAW_KNOTS["2024"],
  "2023": RAW_KNOTS["2023"],
};

/** Qualifying cut-offs (general category, 50th percentile) published for NEET UG 2025. */
export const QUALIFYING_2025 = { generalMarks: 144, reservedMarks: 113 };

export type RankEstimate = {
  year: RankYear;
  rank: number;
  percentile: number;
  /** "above" = more than that year's topper score, "below" = under the lowest published band. */
  edge: "above" | "below" | null;
};

export function percentileFor(rank: number, appeared: number): number {
  const p = ((appeared - rank + 1) / appeared) * 100;
  return Math.max(0, Math.min(100, Math.round(p * 100) / 100));
}

export function rankFor(year: RankYear, marks: number): RankEstimate {
  const knots = KNOTS[year];
  const { appeared } = YEAR_INFO[year];
  const top = knots[0];
  const bottom = knots[knots.length - 1];
  if (marks >= top[0]) return { year, rank: 1, percentile: percentileFor(1, appeared), edge: marks > top[0] ? "above" : null };
  if (marks <= bottom[0]) return { year, rank: bottom[1], percentile: percentileFor(bottom[1], appeared), edge: marks < bottom[0] ? "below" : null };
  for (let i = 0; i < knots.length - 1; i++) {
    const [m1, r1] = knots[i];
    const [m2, r2] = knots[i + 1];
    if (marks <= m1 && marks >= m2) {
      const t = m1 === m2 ? 0 : (m1 - marks) / (m1 - m2);
      // Ranks pile up towards low marks (many candidates per mark), so interpolate on a log scale.
      const rank = Math.max(1, Math.round(Math.exp(Math.log(r1) + t * (Math.log(r2) - Math.log(r1)))));
      return { year, rank, percentile: percentileFor(rank, appeared), edge: null };
    }
  }
  return { year, rank: bottom[1], percentile: percentileFor(bottom[1], appeared), edge: "below" };
}

export function estimateAll(marks: number): RankEstimate[] {
  return RANK_YEARS.map((y) => rankFor(y, marks));
}

/** The marks that would have earned (about) this rank in a given year. */
export function marksForRank(year: RankYear, rank: number): number {
  const knots = KNOTS[year];
  if (rank <= 1) return knots[0][0];
  const last = knots[knots.length - 1];
  if (rank >= last[1]) return last[0];
  for (let i = 0; i < knots.length - 1; i++) {
    const [m1, r1] = knots[i];
    const [m2, r2] = knots[i + 1];
    if (rank >= r1 && rank <= r2) {
      const t = r2 === r1 || r1 < 1 ? 0 : (Math.log(rank) - Math.log(r1)) / (Math.log(r2) - Math.log(r1));
      return Math.round(m1 - t * (m1 - m2));
    }
  }
  return last[0];
}

export const formatRank = (n: number) => n.toLocaleString("en-IN");

// ─── Target-score planner maths ────────────────────────────────────────────
export const MARKS_RIGHT = 4;
export const MARKS_WRONG = -1;
export const TOTAL_QUESTIONS = 180; // 45 per subject block, as asked in the paper
export const MAX_MARKS = 720;

export type AttemptPlan = { attempted: number; correct: number; wrong: number; accuracy: number; marks: number };

/** For a target score, the correct answers needed at each attempt count (+4 / -1 marking). */
export function attemptPlans(target: number, options: number[] = [180, 170, 160, 150, 140]): AttemptPlan[] {
  return options
    .map((attempted) => {
      const correct = Math.ceil((target + attempted) / 5); // 4c - (n - c) >= T
      const wrong = attempted - correct;
      return { attempted, correct, wrong, accuracy: Math.round((correct / attempted) * 1000) / 10, marks: correct * MARKS_RIGHT + wrong * MARKS_WRONG };
    })
    .filter((p) => p.correct <= p.attempted);
}

/** Splits a target across subjects in proportion to the paper (Biology 360, Physics 180, Chemistry 180). */
export function subjectSplit(target: number): { subject: string; max: number; target: number }[] {
  const parts = [
    { subject: "Biology (Botany + Zoology)", max: 360 },
    { subject: "Physics", max: 180 },
    { subject: "Chemistry", max: 180 },
  ];
  return parts.map((p) => ({ ...p, target: Math.round((target * p.max) / MAX_MARKS) }));
}
