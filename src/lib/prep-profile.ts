// Pure helpers for the dashboard's "finish your prep details" card. Reuses what onboarding already saved
// (targetExam, track) and only asks for what is genuinely missing.

export type PrepProfile = { targetExam?: string | null; track?: string | null; targetYear?: number | null };
export type MissingPrepField = "exam" | "track" | "year";

export const TRACKS = ["11th", "12th", "Dropper"] as const;

export function missingPrepFields(p: PrepProfile | null | undefined): MissingPrepField[] {
  if (!p) return [];
  const out: MissingPrepField[] = [];
  const exam = String(p.targetExam ?? "").toLowerCase();
  if (!exam.includes("neet") && !exam.includes("jee") && !exam.includes("cuet") && !exam.includes("ipmat")) out.push("exam");
  if (!TRACKS.includes(String(p.track ?? "") as (typeof TRACKS)[number])) out.push("track");
  if (!(typeof p.targetYear === "number" && Number.isInteger(p.targetYear) && p.targetYear > 2000)) out.push("year");
  return out;
}

/**
 * Exam years to offer. NEET/JEE are held in the first half of the year, so from June onward this year's sitting has
 * passed and the first option is next year. Four options, always >= the current year (the server enforces the same floor).
 */
export function targetYearOptions(now: Date = new Date()): number[] {
  const first = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return [first, first + 1, first + 2, first + 3];
}
