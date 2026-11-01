// Exam dates for the countdown and planner tools. Each date says whether NTA has made it official, where that comes
// from and when we last checked, because a countdown to the wrong date does harm.
//
// To update: change the dates here, set `official`, bump VERIFIED_ON, and the countdown pages, FAQs and JSON-LD follow.
// Always check against NTA's own notices (jeemain.nta.nic.in and neet.nta.nic.in), not coaching sites.

export const VERIFIED_ON = "2026-10-31";

export type ExamEvent = { label: string; date: string; endDate?: string; official: boolean };

/** JEE Main 2027: NTA public notice and Information Bulletin of 24 October 2026 (Session 1 dates revised to 20-24 and 28 January). */
export const JEE_MAIN_2027 = {
  name: "JEE Main 2027",
  site: "jeemain.nta.nic.in",
  source: "NTA public notice and Information Bulletin of 24 October 2026",
  session1: { first: "2027-01-20", last: "2027-01-28", days: ["2027-01-20", "2027-01-21", "2027-01-22", "2027-01-23", "2027-01-24", "2027-01-28"] },
  session2: { first: "2027-04-02", last: "2027-04-07", days: ["2027-04-02", "2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06", "2027-04-07"] },
  events: [
    { label: "Session 1 applications open", date: "2026-10-24", endDate: "2026-11-22", official: true },
    { label: "Session 1 correction window", date: "2026-11-27", endDate: "2026-11-29", official: true },
    { label: "Session 1 exam city slip", date: "2026-12-30", official: true },
    { label: "Session 2 applications open", date: "2027-01-05", endDate: "2027-02-03", official: true },
    { label: "Session 1 admit card", date: "2027-01-13", official: true },
    { label: "Session 1 exam", date: "2027-01-20", endDate: "2027-01-28", official: true },
    { label: "Session 2 exam city slip", date: "2027-03-12", official: true },
    { label: "Session 2 admit card", date: "2027-03-25", official: true },
    { label: "Session 2 exam", date: "2027-04-02", endDate: "2027-04-07", official: true },
  ] as ExamEvent[],
} as const;

/**
 * NEET UG 2027: NTA had NOT announced a date when this was last checked. Early May is the usual time and the first Sunday of
 * May 2027 is 2 May, so that is used as a PLANNING date only. The page must say so, and must switch to the official date
 * (set `official: true`) the day NTA publishes it.
 */
export const NEET_UG_2027 = {
  name: "NEET UG 2027",
  site: "neet.nta.nic.in",
  officialDate: null as string | null,
  planningDate: "2027-05-02",
  official: false,
  note: "NTA has not announced the NEET UG 2027 date. NEET has been held in early May in recent years, and the first Sunday of May 2027 is 2 May, so the planner uses 2 May 2027 until NTA publishes the real date.",
} as const;

/** Whole days from `fromISO` to `toISO` (both YYYY-MM-DD), negative if the date has passed. */
export function daysBetween(fromISO: string, toISO: string): number {
  const f = Date.parse(`${fromISO}T00:00:00Z`);
  const t = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((t - f) / 86_400_000);
}

/** Today's date in India as YYYY-MM-DD (the exams are in India, so "today" should be too). */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const formatDateLong = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
