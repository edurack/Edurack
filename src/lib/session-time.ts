// Single source of truth for *when* a mentor session is, on both server and
// client. Every slot is stored as an India wall-clock date ("2026-10-23") and
// time ("17:00"). Previously each screen re-derived that on its own — some
// parsed it in the viewer's/server's local timezone, some printed raw 24h
// strings — which is how reminders ended up firing at the wrong hour on a UTC
// server. Everything now goes through slotStart().
//
// Pure functions only (no DOM, no node APIs), so it is safe to import from
// anywhere.

export const IST_SUFFIX = "+05:30";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ─── Policy knobs (change here, everything follows) ─────────────────────
/** A student cancelling at least this long before start gets an automatic full refund. */
export const SESSION_FREE_CANCEL_HOURS = 24;
/** The Join button / meeting link becomes usable this long before start. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;

// ─── Instants ───────────────────────────────────────────────────────────
export function slotStart(date: string, time: string): Date {
  return new Date(`${date.slice(0, 10)}T${time.slice(0, 5)}:00${IST_SUFFIX}`);
}

export function slotEnd(date: string, time: string, durationMinutes: number): Date {
  return new Date(slotStart(date, time).getTime() + durationMinutes * 60_000);
}

/** Today's calendar date in India ("YYYY-MM-DD"). */
export function istDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds whole days to a "YYYY-MM-DD" string (pure calendar math, no timezones involved). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ─── Formatting ─────────────────────────────────────────────────────────
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "5:00 – 5:45 PM" (or "11:30 AM – 12:15 PM" when it crosses noon). */
export function formatTimeRange(hhmm: string, durationMinutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const endTotal = h * 60 + m + durationMinutes;
  const endH = Math.floor(endTotal / 60) % 24;
  const endM = endTotal % 60;
  const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  const a = formatTime12(hhmm);
  const b = formatTime12(end);
  // Drop the first AM/PM when both halves share it.
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

const asUtcDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

export function formatDateLong(date: string): string {
  return asUtcDate(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDateShort(date: string): string {
  return asUtcDate(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function dayParts(date: string) {
  const d = asUtcDate(date);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
  };
}

/** "Today" / "Tomorrow" / "Fri, 23 Oct". */
export function relativeDay(date: string, now: Date = new Date()): string {
  const today = istDateString(now);
  if (date.slice(0, 10) === today) return "Today";
  if (date.slice(0, 10) === addDaysIso(today, 1)) return "Tomorrow";
  return asUtcDate(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Today · 5:00 PM IST" — the one line used for a slot everywhere. */
export function formatSlot(date: string, time: string, now: Date = new Date()): string {
  return `${relativeDay(date, now)} · ${formatTime12(time)} IST`;
}

/** "2h 14m", "45 min", "3 days". */
export function timeUntilLabel(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) {
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

export type DayPart = "Morning" | "Afternoon" | "Evening";
export function dayPartOf(hhmm: string): DayPart {
  const h = Number(hhmm.split(":")[0]);
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

// ─── Where a booking is in its life ─────────────────────────────────────
// A booking's stored status stays "upcoming" until someone changes it, and
// nothing used to — so a session that happened last week still said
// "Upcoming". The phase below derives the truth from the clock too.
export type SessionPhase = "scheduled" | "joinable" | "live" | "completed" | "missed" | "cancelled";

export function sessionPhase(
  b: { sessionDate: string; startTime: string; durationMinutes: number; status: string },
  now: Date = new Date(),
): SessionPhase {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "no_show") return "missed";
  if (b.status === "completed") return "completed";
  const start = slotStart(b.sessionDate, b.startTime).getTime();
  const end = start + b.durationMinutes * 60_000;
  const t = now.getTime();
  if (t >= end) return "completed";
  if (t >= start) return "live";
  if (t >= start - JOIN_OPENS_MINUTES_BEFORE * 60_000) return "joinable";
  return "scheduled";
}

export const isActivePhase = (p: SessionPhase) => p === "scheduled" || p === "joinable" || p === "live";

// ─── Cancellation policy ────────────────────────────────────────────────
export type CancellationPolicy = {
  canCancel: boolean;
  refund: "full" | "none" | "not_applicable";
  headline: string;
  detail: string;
};

export function cancellationPolicy(start: Date, isPaid: boolean, now: Date = new Date()): CancellationPolicy {
  const hoursLeft = (start.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) {
    return { canCancel: false, refund: "not_applicable", headline: "This session has started", detail: "Sessions can't be cancelled once they've begun." };
  }
  if (!isPaid) {
    return { canCancel: true, refund: "not_applicable", headline: "Cancel this booking?", detail: "Your seat goes back to other students. You can book another time whenever you like." };
  }
  if (hoursLeft >= SESSION_FREE_CANCEL_HOURS) {
    return {
      canCancel: true,
      refund: "full",
      headline: "Cancel and get a full refund",
      detail: `You're more than ${SESSION_FREE_CANCEL_HOURS} hours out, so the full amount goes back to your original payment method (usually 5–7 business days).`,
    };
  }
  return {
    canCancel: true,
    refund: "none",
    headline: "Cancel without a refund",
    detail: `Sessions cancelled less than ${SESSION_FREE_CANCEL_HOURS} hours before start aren't refunded automatically. Your seat is released. If something went wrong, contact support.`,
  };
}

// ─── Add to calendar ────────────────────────────────────────────────────
const calStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: { title: string; details?: string; start: Date; end: Date; location?: string | null }): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${calStamp(e.start)}/${calStamp(e.end)}`,
  });
  if (e.details) p.set("details", e.details);
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildIcs(e: { uid: string; title: string; description?: string; start: Date; end: Date; location?: string | null }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edurack//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@edurack.in`,
    `DTSTAMP:${calStamp(new Date())}`,
    `DTSTART:${calStamp(e.start)}`,
    `DTEND:${calStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Session starts in 15 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Browser-only: saves an .ics file. */
export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
