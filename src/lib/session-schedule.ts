// Pure schedule logic for session offerings, shared by the create/edit dialog
// (live "students will be able to book…" preview and overlap warnings) and
// the server (which enforces the same rules, so a hand-crafted request can't
// get around them). Everything is India wall-clock via lib/session-time.
import { addDaysIso, istDateString, slotEnd, slotStart } from "@/lib/session-time";
import type { DayOfWeek } from "@/lib/session-types";

export type ScheduleDraft = {
  id?: string;
  title: string;
  recurringDays: DayOfWeek[];
  startTimes: string[]; // "HH:mm"
  dateRangeStart: string | null; // "YYYY-MM-DD"
  dateRangeEnd: string | null;
  isOngoing: boolean;
  durationMinutes: number;
};

export type DraftSlot = { date: string; startTime: string };

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() as DayOfWeek;

/** Does this schedule produce a session on this exact date + time (ignoring "is it in the past")? */
export function slotMatchesSchedule(d: Pick<ScheduleDraft, "recurringDays" | "startTimes" | "dateRangeStart" | "dateRangeEnd" | "isOngoing">, date: string, time: string): boolean {
  const day = date.slice(0, 10);
  const t = time.slice(0, 5);
  if (d.dateRangeStart && day < d.dateRangeStart.slice(0, 10)) return false;
  if (!d.isOngoing && d.dateRangeEnd && day > d.dateRangeEnd.slice(0, 10)) return false;
  if (!d.recurringDays.includes(weekdayOf(day))) return false;
  return d.startTimes.some((s) => s.slice(0, 5) === t);
}

/** The next bookable occurrences of a schedule, soonest first. */
export function previewSlots(d: ScheduleDraft, opts: { limit?: number; windowDays?: number; now?: Date } = {}): DraftSlot[] {
  const { limit = 200, windowDays = 90, now = new Date() } = opts;
  const today = istDateString(now);
  const times = Array.from(new Set(d.startTimes.filter(Boolean))).sort();
  const out: DraftSlot[] = [];
  for (let i = 0; i < windowDays && out.length < limit; i++) {
    const date = addDaysIso(today, i);
    for (const t of times) {
      if (!slotMatchesSchedule(d, date, t)) continue;
      if (slotStart(date, t).getTime() <= now.getTime()) continue; // already started
      out.push({ date, startTime: t });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export type ScheduleConflict = { date: string; startTime: string; otherTitle: string };

/**
 * Where does `draft` put the mentor in two places at once? Compares every
 * upcoming occurrence against every other offering's occurrences.
 */
export function findScheduleConflicts(draft: ScheduleDraft, others: ScheduleDraft[], opts: { windowDays?: number; now?: Date } = {}): ScheduleConflict[] {
  const { windowDays = 60, now = new Date() } = opts;
  const mine = previewSlots(draft, { windowDays, now });
  if (mine.length === 0) return [];
  const conflicts: ScheduleConflict[] = [];
  for (const other of others) {
    if (other.id && other.id === draft.id) continue;
    const theirs = previewSlots(other, { windowDays, now });
    for (const a of mine) {
      const aStart = slotStart(a.date, a.startTime).getTime();
      const aEnd = slotEnd(a.date, a.startTime, draft.durationMinutes).getTime();
      for (const b of theirs) {
        if (b.date !== a.date) continue;
        const bStart = slotStart(b.date, b.startTime).getTime();
        const bEnd = slotEnd(b.date, b.startTime, other.durationMinutes).getTime();
        if (aStart < bEnd && bStart < aEnd) conflicts.push({ date: a.date, startTime: a.startTime, otherTitle: other.title });
      }
    }
  }
  return conflicts.sort((x, y) => (x.date + x.startTime).localeCompare(y.date + y.startTime));
}

