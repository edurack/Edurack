import type { MentorSessionOffering, OpenSlot } from "./session-types";

/**
 * Expands a recurring offering into concrete open slots over the next
 * `windowDays`, then attaches how many seats are already taken in each
 * slot (from `seatCounts`) and excludes any slot that's completely full.
 * A 1:1 offering (capacity 1) behaves exactly as before — the slot
 * disappears the moment it has one booking. A group offering keeps
 * showing up, with seatsRemaining ticking down, until capacity is hit.
 */
export function expandOfferingToSlots(
  offering: MentorSessionOffering,
  seatCounts: Map<string, number>, // key: `${offeringId}:${date}:${startTime}` → non-cancelled booking count
  windowDays = 21,
  now: Date = new Date(),
): OpenSlot[] {
  if (!offering.active) return [];

  const slots: OpenSlot[] = [];
  // All calendar math is done on plain "YYYY-MM-DD" strings in India time
  // (IST, UTC+5:30), never on local-timezone Date objects. The old version
  // built local-midnight Dates and then called toISOString(), which shifts
  // the date back a day on any server running ahead of UTC (e.g. IST) — a
  // session set for 4 Oct showed up as a slot on "Sat 3 Oct".
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const rangeStart = offering.dateRangeStart ? offering.dateRangeStart.slice(0, 10) : null;
  const rangeEnd = offering.isOngoing ? null : offering.dateRangeEnd ? offering.dateRangeEnd.slice(0, 10) : null;

  for (let i = 0; i < windowDays; i++) {
    const day = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + i));
    const dateStr = day.toISOString().slice(0, 10); // UTC-midnight Date, so this is exactly the IST calendar day

    if (rangeStart && dateStr < rangeStart) continue;
    if (rangeEnd && dateStr > rangeEnd) continue;
    if (!offering.recurringDays.includes(day.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)) continue;

    for (const startTime of offering.startTimes) {
      // Skip slots that have already started (start time is IST).
      if (i === 0 && isPast(dateStr, startTime, now)) continue;

      const key = `${offering.id}:${dateStr}:${startTime}`;
      const seatsTaken = seatCounts.get(key) ?? 0;
      const seatsRemaining = offering.capacity - seatsTaken;
      if (seatsRemaining <= 0) continue; // full — same as "already booked" for a 1:1 offering

      slots.push({
        offeringId: offering.id,
        date: dateStr,
        startTime,
        durationMinutes: offering.durationMinutes,
        capacity: offering.capacity,
        seatsTaken,
        seatsRemaining,
      });
    }
  }

  return slots.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

function isPast(dateStr: string, startTime: string, now: Date) {
  const [h, m] = startTime.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const slotUtcMs = Date.UTC(y, mo - 1, d, h, m) - 5.5 * 60 * 60 * 1000; // IST -> UTC
  return slotUtcMs <= now.getTime();
}
