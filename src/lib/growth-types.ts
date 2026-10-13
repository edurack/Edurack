// Shared (client + server) shape of the COO "Growth Hub" snapshot. Pure types.
export type GrowthSnapshot = {
  generatedAt: string;
  totals: { students: number; new1d: number; new7d: number; prev7d: number; new30d: number };
  signups: { day: string; n: number }[];
  activity: { day: string; answered: number; active: number }[];
  active: { dau: number; wau: number; mau: number };
  answered7d: number;
  accuracy7d: number | null;
  funnel: { label: string; n: number }[];
  streaks: { doneToday: number; atRisk: number; best: number };
  neverPracticed: number;
  segments: { exam: { label: string; n: number }[]; track: { label: string; n: number }[] };
  subjects7d: { label: string; n: number }[];
  chapters7d: { label: string; subject: string; n: number }[];
  outreach: { sent7d: number; campaigns: number };
  /** practiceEvents only exist since tracking was deployed; the UI explains this. */
  eventsSince: string | null;
};
