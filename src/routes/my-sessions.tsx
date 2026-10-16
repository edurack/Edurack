import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconVideo as Video,
  IconCalendarEvent as CalendarEvent,
  IconDownload as Download,
  IconChevronDown as ChevronDown,
  IconRefresh as Refresh,
  IconCircleCheck as CircleCheck,
  IconX as X,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { listMyBookedSessions, cancelMyBooking } from "@/server-functions/student-sessions";
import { AppHeader } from "@/components/app-header";
import { MentorAvatar, PhasePill, priceLabel } from "@/components/sessions/session-ui";
import { SITE_URL } from "@/lib/seo";
import {
  buildIcs,
  cancellationPolicy,
  dayParts,
  downloadIcs,
  formatDateLong,
  formatTimeRange,
  googleCalendarUrl,
  isActivePhase,
  relativeDay,
  sessionPhase,
  slotEnd,
  slotStart,
  timeUntilLabel,
  type SessionPhase,
} from "@/lib/session-time";

export const Route = createFileRoute("/my-sessions")({
  head: () => noindexHead("My Sessions"),
  component: MySessionsPage,
});

type Row = {
  id: string;
  offering_id: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  price: number;
  is_free: boolean;
  payment_status: "pending" | "paid" | "free" | "failed" | "refunded";
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  meeting_link: string | null;
  mentor_name?: string;
  mentor_photo_url?: string | null;
  mentor_session_offerings?: { title: string; thumbnail_url?: string | null };
};

type Booking = {
  id: string;
  offeringId: string;
  title: string;
  mentorName: string;
  mentorPhoto: string | null;
  date: string;
  time: string;
  duration: number;
  price: number;
  isFree: boolean;
  paymentStatus: Row["payment_status"];
  status: Row["status"];
  link: string | null;
  start: Date;
  end: Date;
};

function toBooking(r: Row): Booking {
  const date = String(r.session_date).slice(0, 10);
  const time = String(r.start_time).slice(0, 5);
  return {
    id: r.id,
    offeringId: r.offering_id,
    title: r.mentor_session_offerings?.title ?? "Mentor session",
    mentorName: r.mentor_name ?? "Your mentor",
    mentorPhoto: r.mentor_photo_url ?? null,
    date,
    time,
    duration: r.duration_minutes,
    price: Number(r.price),
    isFree: r.is_free,
    paymentStatus: r.payment_status,
    status: r.status,
    link: r.meeting_link,
    start: slotStart(date, time),
    end: slotEnd(date, time, r.duration_minutes),
  };
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function MySessionsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function load() {
    if (!user) return;
    setLoadError(false);
    try {
      const token = await user.getIdToken();
      const { bookings } = await listMyBookedSessions({ data: { token } });
      setRows(bookings as Row[]);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const { upcoming, past } = useMemo(() => {
    const all = (rows ?? []).map(toBooking).map((b) => ({ b, phase: sessionPhase({ sessionDate: b.date, startTime: b.time, durationMinutes: b.duration, status: b.status }, now) }));
    return {
      upcoming: all.filter((x) => isActivePhase(x.phase)).sort((a, z) => a.b.start.getTime() - z.b.start.getTime()),
      past: all.filter((x) => !isActivePhase(x.phase)).sort((a, z) => z.b.start.getTime() - a.b.start.getTime()),
    };
  }, [rows, now]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const next = upcoming[0] ?? null;
  const restUpcoming = next ? upcoming.slice(1) : upcoming;
  const shown = tab === "upcoming" ? restUpcoming : past;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <Link to="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          <span className="block font-light">Your</span>
          <span className="block font-extrabold">sessions</span>
        </h1>

        {notice && (
          <div role="status" className="mt-5 flex items-start gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-emerald-900/60 hover:text-emerald-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loadError ? (
          <div className="mt-6 rounded-3xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">We couldn't load your sessions.</p>
            <button type="button" onClick={load} className="clay-btn mt-4 inline-flex min-h-11 items-center gap-2 px-5 text-sm">
              <Refresh className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : rows === null ? (
          <div className="mt-6 space-y-3">
            <div className="ink-section h-56 animate-pulse rounded-3xl" />
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-3xl bg-secondary" />
            ))}
          </div>
        ) : (
          <>
            {next && tab === "upcoming" && <NextUp item={next} now={now} onCancel={() => setCancelling(next.b)} />}

            <div className="mt-6 inline-flex rounded-full border border-border p-1">
              {(
                [
                  ["upcoming", "Upcoming", upcoming.length],
                  ["past", "Past", past.length],
                ] as const
              ).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`min-h-10 rounded-full px-5 text-sm font-bold transition-colors ${tab === k ? "bg-foreground text-background" : "text-foreground/70"}`}
                >
                  {label}
                  {n > 0 ? ` · ${n}` : ""}
                </button>
              ))}
            </div>

            <div className="mt-5">
              {shown.length === 0 ? (
                tab === "upcoming" && next ? (
                  <p className="text-sm text-muted-foreground">That's your only upcoming session.</p>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border p-10 text-center">
                    <p className="text-sm font-semibold">{tab === "upcoming" ? "Nothing booked yet." : "No past sessions yet."}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{tab === "upcoming" ? "Talk to a mentor who's already cracked your exam." : "Sessions you attend or cancel show up here."}</p>
                    {tab === "upcoming" && (
                      <Link to="/dashboard" className="clay-btn mt-4 inline-flex min-h-11 items-center px-6 text-sm">
                        Find a session
                      </Link>
                    )}
                  </div>
                )
              ) : (
                <ul className="space-y-3">
                  {shown.map(({ b, phase }) => (
                    <SessionRow key={b.id} b={b} phase={phase} now={now} onCancel={() => setCancelling(b)} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

      {cancelling && (
        <CancelDialog
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async () => {
            const token = await user.getIdToken();
            const res = await cancelMyBooking({ data: { token, bookingId: cancelling.id } });
            setCancelling(null);
            setNotice(
              res.refunded
                ? "Booking cancelled. Your refund has been started and should reach your original payment method in 5–7 business days."
                : "Booking cancelled. Your seat has been released.",
            );
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────
function NextUp({ item, now, onCancel }: { item: { b: Booking; phase: SessionPhase }; now: Date; onCancel: () => void }) {
  const { b, phase } = item;
  const live = phase === "live";
  const canJoin = (phase === "joinable" || live) && b.link;
  const msUntil = b.start.getTime() - now.getTime();
  const policy = cancellationPolicy(b.start, !b.isFree && b.price > 0, now);

  return (
    <section className="ink-section mt-6 rounded-3xl p-5 sm:p-7">
      <p className="flex items-center gap-2 text-sm font-medium text-white/65">
        {live ? (
          <>
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            Happening now
          </>
        ) : (
          "Your next session starts in"
        )}
      </p>
      <p className="mt-1.5 font-display text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl">{live ? "Join now" : timeUntilLabel(msUntil)}</p>

      <div className="mt-5 flex items-center gap-3">
        <MentorAvatar name={b.mentorName} photoUrl={b.mentorPhoto} size={40} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.title}</p>
          <p className="truncate text-sm text-white/60">
            with {b.mentorName} · {relativeDay(b.date, now)}, {formatTimeRange(b.time, b.duration)} IST
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {canJoin ? (
          <a href={b.link as string} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#141b2b] hover:bg-white/90">
            <Video className="h-4 w-4" />
            Join session
          </a>
        ) : b.link ? (
          <span className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-5 text-sm font-semibold text-white/80">Join link opens 15 min before</span>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-5 text-sm font-semibold text-white/80">Your mentor will add the link — we'll email you</span>
        )}
        <AddToCalendar b={b} dark />
        {policy.canCancel && (
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-white/60 hover:text-white">
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

// ── List row ───────────────────────────────────────────────────────────
function SessionRow({ b, phase, now, onCancel }: { b: Booking; phase: SessionPhase; now: Date; onCancel: () => void }) {
  const p = dayParts(b.date);
  const active = isActivePhase(phase);
  const canJoin = (phase === "joinable" || phase === "live") && b.link;
  const policy = cancellationPolicy(b.start, !b.isFree && b.price > 0, now);

  return (
    <li className="rounded-3xl border border-border bg-card p-4">
      <div className="flex gap-4">
        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-center ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
          <div>
            <p className="font-display text-2xl font-extrabold leading-none tabular-nums">{p.day}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide opacity-80">{p.month}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold leading-snug">{b.title}</p>
            {(!active || phase === "joinable" || phase === "live") && <PhasePill phase={phase} />}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MentorAvatar name={b.mentorName} photoUrl={b.mentorPhoto} size={16} />
            <span className="truncate">{b.mentorName}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateLong(b.date)} · {formatTimeRange(b.time, b.duration)} IST · {b.isFree ? "Free" : priceLabel({ isFree: false, price: b.price })}
            {b.paymentStatus === "refunded" && <span className="ml-1.5 font-semibold text-foreground/70">· Refunded</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {active ? (
          <>
            {canJoin ? (
              <a href={b.link as string} target="_blank" rel="noreferrer" className="clay-btn inline-flex min-h-10 items-center gap-1.5 px-5 text-sm">
                <Video className="h-4 w-4" />
                Join
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{b.link ? "Join link opens 15 min before" : "Mentor will add the meeting link"}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <AddToCalendar b={b} />
              {policy.canCancel && (
                <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground">
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <Link to="/mentor-session/$offeringId" params={{ offeringId: b.offeringId }} className="inline-flex min-h-10 items-center text-xs font-bold text-primary hover:underline">
            Book again
          </Link>
        )}
      </div>
    </li>
  );
}

// ── Add to calendar ────────────────────────────────────────────────────
function AddToCalendar({ b, dark = false }: { b: Booking; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const title = `${b.title} with ${b.mentorName}`;
  const details = `Edurack mentor session. Meeting link and details: ${SITE_URL}/my-sessions`;
  const btn = dark
    ? "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10"
    : "inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground";
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={btn}>
        <CalendarEvent className="h-4 w-4" />
        Add to calendar
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-background py-1 text-foreground shadow-float">
            <a
              href={googleCalendarUrl({ title, details, start: b.start, end: b.end, location: b.link })}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 px-4 text-sm font-semibold hover:bg-secondary"
            >
              <CalendarEvent className="h-4 w-4" />
              Google Calendar
            </a>
            <button
              type="button"
              onClick={() => {
                downloadIcs(`edurack-session-${b.date}`, buildIcs({ uid: b.id, title, description: details, start: b.start, end: b.end, location: b.link }));
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold hover:bg-secondary"
            >
              <Download className="h-4 w-4" />
              Apple / Outlook (.ics)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cancel ─────────────────────────────────────────────────────────────
function CancelDialog({ booking, onClose, onConfirm }: { booking: Booking; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const policy = cancellationPolicy(booking.start, !booking.isFree && booking.price > 0);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't cancel this booking. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancel booking"
        className="w-full max-w-md rounded-t-3xl border border-border bg-background p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-extrabold tracking-tight">{policy.headline}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {booking.title} · {formatDateLong(booking.date)}, {formatTimeRange(booking.time, booking.duration)} IST
        </p>
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-relaxed ${policy.refund === "none" ? "bg-amber-50 text-amber-900" : "bg-secondary text-foreground/80"}`}>{policy.detail}</p>
        {error && (
          <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-full border border-border text-sm font-bold hover:border-foreground/40 disabled:opacity-50">
            Keep booking
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || !policy.canCancel}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel booking
          </button>
        </div>
      </div>
    </div>
  );
}
