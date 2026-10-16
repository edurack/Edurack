// Student-facing "find a session" screen. Props unchanged
// ({ getToken, subjectFilter }) so the dashboard keeps working.
//
// Built around the question students actually have — "when can I talk to
// someone?" — so the primary control is a day strip, not a mentor list. Every
// card leads with its next open time (and how scarce it is), and one tap on a
// time opens the booking flow.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconSearch as Search, IconRefresh as Refresh, IconArrowRight as ArrowRight, IconCircleCheck as CircleCheck } from "@tabler/icons-react";
import { listOpenMentorSessions, listMyBookedSessions } from "@/server-functions/student-sessions";
import { formatForOffering, type OpenSlot, type PublicMentorOffering } from "@/lib/session-types";
import { addDaysIso, dayParts, formatSlot, formatTime12, istDateString, relativeDay } from "@/lib/session-time";
import { BookingDialog } from "@/components/sessions/booking-dialog";
import { FormatBadge, MentorAvatar, SessionCover, priceLabel, seatsNote } from "@/components/sessions/session-ui";

// Kept for the existing imports in dashboard.tsx and the detail route.
export { BookingDialog };

type PriceFilter = "all" | "free" | "paid";
type FormatFilter = "all" | "one_on_one" | "group";
type SortKey = "soon" | "price";
type MyBooking = { date: string; startTime: string };

const segmented = (active: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-bold transition-colors ${active ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"}`;

const chip = (active: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-bold transition-colors ${
    active ? "border-foreground bg-foreground text-background" : "border-border text-foreground/70 hover:border-foreground/40"
  }`;

export function StudentOpenSessionsModule({ getToken, subjectFilter }: { getToken: () => Promise<string>; subjectFilter?: string }) {
  const [offerings, setOfferings] = useState<PublicMentorOffering[] | null>(null);
  const [slotsByOffering, setSlotsByOffering] = useState<Record<string, OpenSlot[]>>({});
  const [myBookings, setMyBookings] = useState<Map<string, MyBooking>>(new Map());
  const [loadError, setLoadError] = useState(false);

  const [query, setQuery] = useState(subjectFilter ?? "");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [subject, setSubject] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("soon");
  const [booking, setBooking] = useState<{ offering: PublicMentorOffering; slot: OpenSlot } | null>(null);

  async function load() {
    setLoadError(false);
    try {
      const token = await getToken();
      const [{ offerings: rows, slotsByOffering: slots }, { bookings }] = await Promise.all([
        listOpenMentorSessions({ data: { token } }),
        listMyBookedSessions({ data: { token } }),
      ]);
      setOfferings(rows as PublicMentorOffering[]);
      setSlotsByOffering(slots as Record<string, OpenSlot[]>);
      // Only a *future, active* booking blocks rebooking now (see payments.ts).
      const today = istDateString();
      const mine = new Map<string, MyBooking>();
      for (const b of bookings as any[]) {
        if (b.status === "upcoming" && String(b.session_date).slice(0, 10) >= today && !mine.has(b.offering_id)) {
          mine.set(b.offering_id, { date: String(b.session_date).slice(0, 10), startTime: String(b.start_time).slice(0, 5) });
        }
      }
      setMyBookings(mine);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything except the day filter — the day strip counts against this.
  const base = useMemo(() => {
    if (!offerings) return [];
    const q = query.trim().toLowerCase();
    return offerings.filter((o) => {
      if ((slotsByOffering[o.id] ?? []).length === 0) return false;
      if (priceFilter === "free" && !o.isFree) return false;
      if (priceFilter === "paid" && o.isFree) return false;
      const f = formatForOffering(o);
      if (formatFilter === "one_on_one" && f !== "one_on_one") return false;
      if (formatFilter === "group" && f === "one_on_one") return false;
      if (subject && o.subject !== subject) return false;
      if (q && !`${o.title} ${o.mentorName} ${o.description} ${o.subject ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [offerings, slotsByOffering, priceFilter, formatFilter, subject, query]);

  const days = useMemo(() => {
    const today = istDateString();
    return Array.from({ length: 14 }, (_, i) => {
      const date = addDaysIso(today, i);
      const count = base.filter((o) => (slotsByOffering[o.id] ?? []).some((s) => s.date === date)).length;
      return { date, count };
    });
  }, [base, slotsByOffering]);

  const results = useMemo(() => {
    const rows = base
      .map((o) => {
        const all = slotsByOffering[o.id] ?? [];
        return { offering: o, slots: day ? all.filter((s) => s.date === day) : all };
      })
      .filter((r) => r.slots.length > 0);
    rows.sort((a, b) =>
      sort === "price"
        ? Number(a.offering.price) - Number(b.offering.price) || (a.slots[0].date + a.slots[0].startTime).localeCompare(b.slots[0].date + b.slots[0].startTime)
        : (a.slots[0].date + a.slots[0].startTime).localeCompare(b.slots[0].date + b.slots[0].startTime),
    );
    return rows;
  }, [base, slotsByOffering, day, sort]);

  const subjects = useMemo(() => Array.from(new Set((offerings ?? []).map((o) => o.subject).filter(Boolean) as string[])).slice(0, 8), [offerings]);

  const filtersActive = Boolean(query || priceFilter !== "all" || formatFilter !== "all" || subject || day);
  function clearFilters() {
    setQuery("");
    setPriceFilter("all");
    setFormatFilter("all");
    setSubject(null);
    setDay(null);
  }

  if (loadError) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">We couldn't load sessions. Check your connection and try again.</p>
        <button type="button" onClick={load} className="clay-btn mt-4 inline-flex min-h-11 items-center gap-2 px-5 text-sm">
          <Refresh className="h-4 w-4" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search + type filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block lg:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mentors, topics, subjects"
            aria-label="Search sessions"
            className="min-h-11 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border p-1">
            {(["all", "free", "paid"] as PriceFilter[]).map((f) => (
              <button key={f} type="button" onClick={() => setPriceFilter(f)} className={segmented(priceFilter === f)}>
                {f === "all" ? "Any price" : f === "free" ? "Free" : "Paid"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-full border border-border p-1">
            {(
              [
                ["all", "Any format"],
                ["one_on_one", "1:1"],
                ["group", "Group"],
              ] as [FormatFilter, string][]
            ).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setFormatFilter(f)} className={segmented(formatFilter === f)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {subjects.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSubject(null)} className={chip(subject === null)}>
            All subjects
          </button>
          {subjects.map((s) => (
            <button key={s} type="button" onClick={() => setSubject(subject === s ? null : s)} className={chip(subject === s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Day strip */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">When are you free?</p>
        <div role="tablist" aria-label="Filter by day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            role="tab"
            aria-selected={day === null}
            onClick={() => setDay(null)}
            className={`flex min-h-[4.25rem] w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl border text-xs font-bold transition-colors ${
              day === null ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/40"
            }`}
          >
            Any day
          </button>
          {days.map(({ date, count }) => {
            const p = dayParts(date);
            const active = day === date;
            const empty = count === 0;
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={empty && !active}
                onClick={() => setDay(active ? null : date)}
                className={`flex min-h-[4.25rem] w-[3.75rem] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/40"
                }`}
              >
                <span className={`text-[11px] font-semibold ${active ? "text-background/70" : "text-muted-foreground"}`}>{relativeDay(date) === "Today" ? "Today" : p.weekday}</span>
                <span className="font-display text-xl font-extrabold leading-tight tabular-nums">{p.day}</span>
                <span className={`text-[10px] font-semibold ${active ? "text-background/70" : empty ? "text-muted-foreground" : "text-primary"}`}>{empty ? "—" : `${count} open`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {offerings === null ? "Loading sessions…" : `${results.length} session${results.length === 1 ? "" : "s"}${day ? ` on ${relativeDay(day)}` : " open"}`}
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="min-h-9 rounded-full border border-border bg-card px-3 text-xs font-bold text-foreground focus:outline-none">
            <option value="soon">Soonest first</option>
            <option value="price">Price: low to high</option>
          </select>
        </label>
      </div>

      <div className="mt-4">
        {offerings === null ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-3xl bg-secondary" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-semibold">{filtersActive ? "Nothing matches those filters." : "No sessions are open right now."}</p>
            <p className="mt-1 text-sm text-muted-foreground">{filtersActive ? "Try a different day or clear the filters." : "Mentors add new times all the time — check back soon."}</p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="clay-btn mt-4 inline-flex min-h-11 items-center px-5 text-sm">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map(({ offering, slots }) => (
              <SessionCard
                key={offering.id}
                offering={offering}
                slots={slots}
                dayFiltered={Boolean(day)}
                mine={myBookings.get(offering.id) ?? null}
                onPick={(slot) => setBooking({ offering, slot })}
              />
            ))}
          </div>
        )}
      </div>

      {booking && (
        <BookingDialog
          offering={booking.offering}
          slot={booking.slot}
          slots={slotsByOffering[booking.offering.id]}
          getToken={getToken}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SessionCard({
  offering,
  slots,
  dayFiltered,
  mine,
  onPick,
}: {
  offering: PublicMentorOffering;
  slots: OpenSlot[];
  dayFiltered: boolean;
  mine: MyBooking | null;
  onPick: (slot: OpenSlot) => void;
}) {
  const next = slots[0];
  const preview = slots.slice(0, 3);
  const seats = seatsNote(offering, next);

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <Link to="/mentor-session/$offeringId" params={{ offeringId: offering.id }} className="relative block" aria-label={`${offering.title} — details`}>
        <SessionCover offering={offering} className="aspect-[16/10] w-full" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {offering.subject && <span className="rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-primary">{offering.subject}</span>}
        </div>
        <FormatBadge offering={offering} className="absolute right-3 top-3" />
        <span className="absolute bottom-3 left-3 rounded-full bg-foreground px-3 py-1 text-xs font-extrabold text-background">{priceLabel(offering)}</span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <MentorAvatar name={offering.mentorName} photoUrl={offering.mentorPhotoUrl} size={22} />
          <p className="truncate text-xs font-semibold text-muted-foreground">{offering.mentorName}</p>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{offering.durationMinutes} min</span>
        </div>
        <Link to="/mentor-session/$offeringId" params={{ offeringId: offering.id }} className="mt-1.5 block font-display text-lg font-bold leading-snug tracking-tight hover:underline">
          {offering.title}
        </Link>
        {offering.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{offering.description}</p>}

        <div className="mt-auto pt-4">
          {mine ? (
            <Link to="/my-sessions" className="flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-50 px-3.5 text-sm font-bold text-emerald-900">
              <CircleCheck className="h-4 w-4 shrink-0" />
              <span className="truncate">You're booked · {formatSlot(mine.date, mine.startTime)}</span>
            </Link>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold">{dayFiltered ? relativeDay(next.date) : `Next: ${formatSlot(next.date, next.startTime)}`}</p>
                {seats && <span className={`text-xs font-bold ${seats.urgent ? "text-amber-700" : "text-muted-foreground"}`}>{seats.text}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {preview.map((s) => (
                  <button
                    key={`${s.date}-${s.startTime}`}
                    type="button"
                    onClick={() => onPick(s)}
                    className="min-h-10 rounded-full border border-border px-3.5 text-sm font-bold tabular-nums transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    {dayFiltered ? formatTime12(s.startTime) : `${relativeDay(s.date).replace(/^\w+, /, "")} · ${formatTime12(s.startTime)}`}
                  </button>
                ))}
                <Link to="/mentor-session/$offeringId" params={{ offeringId: offering.id }} className="ml-auto inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary hover:underline">
                  {slots.length > preview.length ? `+${slots.length - preview.length} more` : "Details"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
