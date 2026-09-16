import type { MentorSessionOffering, OpenSlot } from "./session-types";

/**
 * Expands a recurring offering into concrete open slots over the next
 * `windowDays`, then removes any (date, startTime) already taken by a
 * non-cancelled booking. Kept pure/sync so it can be unit tested and reused
 * server-side without touching Supabase directly.
 */
export function expandOfferingToSlots(
  offering: MentorSessionOffering,
  bookedKeys: Set<string>, // `${offeringId}:${date}:${startTime}`
  windowDays = 21,
  now: Date = new Date(),
): OpenSlot[] {
  if (!offering.active) return [];

  const slots: OpenSlot[] = [];
  const rangeStart = offering.dateRangeStart ? new Date(offering.dateRangeStart) : null;
  const rangeEnd = offering.isOngoing ? null : offering.dateRangeEnd ? new Date(offering.dateRangeEnd) : null;

  for (let i = 0; i < windowDays; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);

    if (rangeStart && day < stripTime(rangeStart)) continue;
    if (rangeEnd && day > stripTime(rangeEnd)) continue;
    if (!offering.recurringDays.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)) continue;

    const dateStr = toIsoDate(day);

    for (const startTime of offering.startTimes) {
      // Skip slots that have already started today.
      if (i === 0 && isPast(day, startTime, now)) continue;

      const key = `${offering.id}:${dateStr}:${startTime}`;
      if (bookedKeys.has(key)) continue;

      slots.push({
        offeringId: offering.id,
        date: dateStr,
        startTime,
        durationMinutes: offering.durationMinutes,
      });
    }
  }

  return slots.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

function stripTime(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isPast(day: Date, startTime: string, now: Date) {
  const [h, m] = startTime.split(":").map(Number);
  const slot = new Date(day);
  slot.setHours(h, m, 0, 0);
  return slot.getTime() <= now.getTime();
}