import { useMemo, useState, type ReactNode } from "react";
import { IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight } from "@tabler/icons-react";

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toIsoDate(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const y = c.getFullYear();
  const m = String(c.getMonth() + 1).padStart(2, "0");
  const day = String(c.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * A plain month-grid calendar. Every event just needs a `date` (ISO
 * "YYYY-MM-DD") — the calendar groups them itself, shows a count dot on
 * days that have any, and hands the selected day's events to
 * `renderEvent` so the caller decides what a day's list actually looks
 * like (a mentor's roster entry vs. a student's bookable slot button).
 */
export function SessionCalendar<T extends { date: string }>({
  events,
  renderEvent,
  emptyDayLabel = "Nothing this day.",
  initialMonth,
}: {
  events: T[];
  renderEvent: (event: T) => ReactNode;
  emptyDayLabel?: string;
  initialMonth?: Date;
}) {
  const today = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(() => {
    const base = initialMonth ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(initialMonth ?? today));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of events) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const out: { date: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) out.push({ date: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: toIsoDate(new Date(year, month, d)), dayNum: d });
    }
    return out;
  }, [monthCursor]);

  const selectedEvents = (eventsByDate.get(selectedDate) ?? []).slice().sort((a: any, b: any) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const todayIso = toIsoDate(today);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="clay p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="clay-btn-ghost flex h-8 w-8 items-center justify-center rounded-full"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-display text-sm font-bold text-foreground">{MONTH_LABEL.format(monthCursor)}</p>
          <button
            type="button"
            onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="clay-btn-ghost flex h-8 w-8 items-center justify-center rounded-full"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-foreground/40">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (c.date === null) return <div key={i} />;
            const dayEvents = eventsByDate.get(c.date) ?? [];
            const isSelected = c.date === selectedDate;
            const isToday = c.date === todayIso;
            return (
              <button
                key={c.date}
                type="button"
                onClick={() => setSelectedDate(c.date as string)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                  isSelected ? "clay-btn text-white" : isToday ? "clay-chip text-foreground" : "text-foreground/70 hover:bg-foreground/5"
                }`}
              >
                {c.dayNum}
                {dayEvents.length > 0 && (
                  <span
                    className={`mt-0.5 h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-[var(--sky-deep)]"}`}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="clay p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-foreground/40">
          {new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-foreground/50">{emptyDayLabel}</p>
        ) : (
          <div className="space-y-2">{selectedEvents.map((e) => renderEvent(e))}</div>
        )}
      </div>
    </div>
  );
}
