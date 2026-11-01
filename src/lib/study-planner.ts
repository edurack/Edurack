// Study planner: turns "exam date + hours a day + how much of the syllabus is done" into phases, weekly targets and a
// subject split. Pure maths, no I/O. The split rules are rules of thumb, shown as a suggestion (not as exam facts):
//   - the final week is light revision plus rest, with a mock every other day;
//   - the rest is shared between learning, revision and full-length mocks, and the less of the syllabus is done the
//     more of it goes to learning;
//   - the subject split follows the marks: NEET UG is 180 / 180 / 360 (Physics / Chemistry / Biology), JEE Main is 100 each.
import { addDaysISO, daysBetween } from "@/lib/exam-dates";

export type PlannerExam = "neet" | "jee";
export type PlannerInput = { exam: PlannerExam; today: string; examDate: string; hoursPerDay: number; syllabusDonePct: number };

export type PlanPhase = { key: "learn" | "revise" | "mock" | "final"; label: string; start: string; end: string; days: number; focus: string; mocksPerWeek: number };
export type Plan = {
  daysLeft: number;
  weeksLeft: number;
  phases: PlanPhase[];
  subjects: { subject: string; sharePct: number; hoursPerWeek: number }[];
  hoursPerWeek: number;
  warnings: string[];
};

const SUBJECTS: Record<PlannerExam, { subject: string; sharePct: number }[]> = {
  neet: [
    { subject: "Biology", sharePct: 50 },
    { subject: "Physics", sharePct: 25 },
    { subject: "Chemistry", sharePct: 25 },
  ],
  jee: [
    { subject: "Physics", sharePct: 34 },
    { subject: "Chemistry", sharePct: 33 },
    { subject: "Maths", sharePct: 33 },
  ],
};

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function buildPlan(input: PlannerInput): Plan | null {
  const daysLeft = daysBetween(input.today, input.examDate);
  if (!Number.isFinite(daysLeft) || daysLeft < 1) return null;
  const hours = clamp(input.hoursPerDay, 1, 14);
  const done = clamp(input.syllabusDonePct, 0, 100) / 100;

  const finalDays = daysLeft >= 14 ? 7 : Math.max(1, Math.floor(daysLeft / 2));
  const rest = daysLeft - finalDays;

  // Shares of the time before the final week.
  const learnShare = 0.55 * (1 - done);
  const mockShare = 0.25 + 0.1 * done;
  const reviseShare = 1 - learnShare - mockShare;
  let learn = Math.round(rest * learnShare);
  let mock = Math.round(rest * mockShare);
  if (rest >= 28) mock = Math.max(mock, 14); // enough mocks to matter
  if (done >= 0.995) learn = 0;
  let revise = rest - learn - mock;
  if (revise < 0) {
    learn = Math.max(0, learn + revise);
    revise = 0;
  }
  if (rest < 28) {
    // Too little time for four phases: keep learning (if needed) and mocks only.
    mock = Math.min(rest, Math.max(mock, Math.floor(rest / 2)));
    learn = rest - mock;
    revise = 0;
  }

  const mocksPerWeek = hours >= 6 ? 3 : 2;
  const phases: PlanPhase[] = [];
  let cursor = input.today;
  const push = (key: PlanPhase["key"], label: string, days: number, focus: string, perWeek: number) => {
    if (days <= 0) return;
    phases.push({ key, label, start: cursor, end: addDaysISO(cursor, days - 1), days, focus, mocksPerWeek: perWeek });
    cursor = addDaysISO(cursor, days);
  };
  push("learn", "Finish the syllabus", learn, "Cover the chapters you have not done, highest-weightage first. One PYQ set per chapter as you finish it.", 0);
  push("revise", "Revise and fix weak chapters", revise, "Go back over every chapter. Use the mistakes from your tests and drills to decide what to revise.", 1);
  push("mock", "Full-length mocks", mock, "Take full tests in exam conditions, then spend as long analysing each one as you spent taking it.", mocksPerWeek);
  push("final", "Final week", finalDays, "Light revision of formulas and notes, a mock every other day, and proper sleep. No new topics.", 3);

  const hoursPerWeek = Math.round(hours * 7);
  const warnings: string[] = [];
  if (done < 0.5 && daysLeft < 60) warnings.push("Less than half the syllabus is done with under 60 days left. Focus on the highest-weightage chapters first; finishing every chapter may not be realistic.");
  if (hours < 3 && daysLeft < 120) warnings.push("Under 3 hours a day with under 4 months left is tight. Even one extra hour a day adds more than 100 hours before the exam.");
  if (hours > 11) warnings.push("More than 11 hours a day is hard to sustain for weeks. Keep a lighter day each week and protect your sleep.");

  return {
    daysLeft,
    weeksLeft: Math.round((daysLeft / 7) * 10) / 10,
    phases,
    subjects: SUBJECTS[input.exam].map((s) => ({ ...s, hoursPerWeek: Math.round((hoursPerWeek * s.sharePct) / 100) })),
    hoursPerWeek,
    warnings,
  };
}
