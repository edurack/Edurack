// Day strip + time grid. Replaces three different "list of date/time chips"
// implementations. Pick a day first (with a hint of how much is on it), then a
// time grouped Morning / Afternoon / Evening.
import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenSlot } from "@/lib/session-types";
import { dayParts, dayPartOf, formatTime12, relativeDay, type DayPart } from "@/lib/session-time";

const PART_ORDER: DayPart[] = ["Morning", "Afternoon", "Evening"];

export function SlotPicker({
  slots,
  selected,
  onSelect,
  showSeats = false,
  compact = false,
}: {
  slots: OpenSlot[];
  selected: OpenSlot | null;
  onSelect: (slot: OpenSlot) => void;
  /** Show "x left" on group sessions. */
  showSeats?: boolean;
  compact?: boolean;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, OpenSlot[]>();
    for (const s of slots) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);

  const [day, setDay] = useState<string | null>(selected?.date ?? byDate[0]?.[0] ?? null);
  // Keep the visible day valid if the slot list changes underneath us.
  useEffect(() => {
    if (byDate.length === 0) return setDay(null);
    if (!day || !byDate.some(([d]) => d === day)) setDay(selected?.date ?? byDate[0][0]);
  }, [byDate, day, selected]);

  const stripRef = useRef<HTMLDivElement>(null);
  const daySlots = byDate.find(([d]) => d === day)?.[1] ?? [];
  const parts = PART_ORDER.map((p) => ({ part: p, items: daySlots.filter((s) => dayPartOf(s.startTime) === p) })).filter((g) => g.items.length > 0);

  if (byDate.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No open times right now — check back soon.</p>;
  }

  return (
    <div>
      <div ref={stripRef} role="tablist" aria-label="Choose a day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {byDate.map(([d, list]) => {
          const p = dayParts(d);
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDay(d)}
              className={`flex min-h-[4.25rem] w-[3.75rem] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition-colors ${
                active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/40"
              }`}
            >
              <span className={`text-[11px] font-semibold ${active ? "text-background/70" : "text-muted-foreground"}`}>{relativeDay(d) === "Today" ? "Today" : relativeDay(d) === "Tomorrow" ? "Tmrw" : p.weekday}</span>
              <span className="font-display text-xl font-extrabold leading-tight tabular-nums">{p.day}</span>
              <span className={`text-[10px] ${active ? "text-background/60" : "text-muted-foreground"}`}>{p.month}</span>
              <span className="sr-only">{list.length} times</span>
            </button>
          );
        })}
      </div>

      <div className={`mt-3 space-y-3 ${compact ? "" : "mt-4"}`}>
        {parts.map(({ part, items }) => (
          <div key={part}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{part}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((s) => {
                const isSel = selected?.date === s.date && selected.startTime === s.startTime;
                const group = showSeats && s.capacity > 1 && s.capacity < 200;
                return (
                  <button
                    key={`${s.date}-${s.startTime}`}
                    type="button"
                    onClick={() => onSelect(s)}
                    aria-pressed={isSel}
                    className={`min-h-11 rounded-full border px-4 text-sm font-bold tabular-nums transition-colors ${
                      isSel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-foreground/40"
                    }`}
                  >
                    {formatTime12(s.startTime)}
                    {group && <span className={`ml-1.5 text-[11px] font-semibold ${isSel ? "text-primary-foreground/80" : s.seatsRemaining <= 3 ? "text-amber-700" : "text-muted-foreground"}`}>{s.seatsRemaining} left</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">All times are India Standard Time (IST).</p>
      </div>
    </div>
  );
}
