import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookMarked, CalendarCheck, Check, Flame, RotateCcw, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getTodaySummary } from "@/server-functions/practice-extras";
import type { TodaySummary } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

type Step = { label: string; sub: string; to: "/pyq"; search: Record<string, unknown> };

/** The one thing to do next, in priority order: revise → today's PYQ → weakest chapter → just practise. */
export function pickStartHere(t: TodaySummary): Step {
  if (t.due > 0)
    return { label: `Revise ${t.due} question${t.due === 1 ? "" : "s"}`, sub: "Past mistakes, due back today", to: "/pyq", search: { practice: true, session: "due" } };
  if (t.daily.available && !t.daily.done)
    return { label: "Solve today's PYQ", sub: t.streak.current > 0 ? `Keep your ${t.streak.current}-day streak alive` : "Start your streak today", to: "/pyq", search: { practice: true, session: "daily" } };
  if (t.weak)
    return {
      label: `Practise ${t.weak.chapter}`,
      sub: `Weakest chapter · ${t.weak.available} PYQ${t.weak.available === 1 ? "" : "s"} left`,
      to: "/pyq",
      search: { subject: t.weak.subject, chapter: t.weak.chapter, practice: true, exam: t.exam ?? undefined },
    };
  return { label: "Practise PYQs", sub: "Pick a chapter and go", to: "/pyq", search: { exam: t.exam ?? undefined } };
}

/** Headline + sub-line: speaks to where the student is today, not a generic "Start here". */
export function headlineFor(t: TodaySummary): { title: string; sub: string } {
  const s = t.streak;
  if (s.doneToday)
    return t.due === 0 && !t.weak
      ? { title: "You're all caught up", sub: s.current > 1 ? `${s.current} days in a row. See you tomorrow.` : "Great start. Come back tomorrow to build your streak." }
      : { title: "Nice work today", sub: s.current > 1 ? `${s.current} days in a row. Want to do a little more?` : "A little more won't hurt." };
  if (s.current > 0) return { title: "Keep your streak alive", sub: "One question is enough to count for today." };
  return { title: "Start your streak today", sub: "Answer one PYQ and the flame lights up." };
}

/** What the dashboard knows about the student's next mentor session (it owns the booking logic). */
export type UpNextInfo =
  | { state: "loading" }
  | { state: "empty"; text: string }
  | { state: "session"; date: string; meta: string; title: string; joinUrl?: string; total: number };

// One card for the whole "what do I do now" moment. It looks like the rest of the dark dashboard cards:
// the flat `ink-section` navy (#141b2b), white text, #7ba4f0 eyebrow, white pill buttons, white/65 muted text.
// These are fixed colours on purpose, so it's identical in light and dark mode. White uses bg-[#ffffff] (not
// bg-white) because the dark-mode safety net in styles.css remaps `.bg-white` to the card colour.
const dayPhrase = (done: number) => `Practised on ${done} of the last 7 days`;
const PILL = "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full px-4 text-xs font-bold transition-colors";

export function TodayView({
  t,
  failed = false,
  upNext,
  onBrowseSessions,
  className,
  now = new Date(),
}: {
  /** null while loading */
  t: TodaySummary | null;
  /** The practice summary couldn't load: show just the Up next part so the card is never empty. */
  failed?: boolean;
  upNext?: UpNextInfo;
  onBrowseSessions?: () => void;
  className?: string;
  now?: Date;
}) {
  const dateLabel = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const weekday = now.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  const showToday = !failed;

  return (
    <section
      aria-label="Today"
      className={cn("ink-section relative isolate flex min-w-0 flex-col overflow-hidden rounded-3xl p-5 sm:p-6", className)}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 -z-10 h-64 w-64 rounded-full bg-[#7ba4f0]/15 blur-3xl" />

      {showToday && (t ? <TodayBody t={t} dateLabel={dateLabel} weekday={weekday} /> : <div className="h-52 animate-pulse rounded-2xl bg-white/[0.04]" aria-hidden />)}
      {upNext && <UpNextRow info={upNext} onBrowse={onBrowseSessions} divider={showToday} />}
    </section>
  );
}

function TodayBody({ t, dateLabel, weekday }: { t: TodaySummary; dateLabel: string; weekday: string }) {
  const step = pickStartHere(t);
  // When the big button already says "Practise <chapter>", a chip saying the same thing is noise.
  const showWeak = Boolean(t.weak) && step.search.chapter !== t.weak!.chapter;
  const { title, sub } = headlineFor(t);
  const s = t.streak;
  const doneDays = s.week.filter((d) => d.done).length;
  const lit = s.current > 0;

  return (
    <div className="animate-in fade-in duration-500 motion-reduce:animate-none">
      {/* Header: eyebrow + streak pill */}
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Today · <span className="hidden sm:inline">{weekday}, </span>{dateLabel}</p>
        <span
          data-testid="today-streak"
          aria-label={lit ? `${s.current} day streak` : "No streak yet"}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold",
            lit ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-white/15 bg-white/[0.06] text-white/70",
          )}
        >
          <Flame className={cn("h-4 w-4", lit ? "fill-amber-300 text-amber-300" : "text-white/50")} aria-hidden />
          {lit ? (
            <>
              <span className="tabular-nums">{s.current}</span> day streak
            </>
          ) : (
            "No streak yet"
          )}
        </span>
      </div>

      <h2 className="font-display mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]">{title}</h2>
      <p className="mt-1.5 text-sm text-white/65">{sub}</p>

      {/* This week: seven small dots, no extra box */}
      <div className="mt-4 max-w-sm" role="img" aria-label={dayPhrase(doneDays)}>
        <div className="flex items-center justify-between text-[11px] text-white/55" aria-hidden>
          <span>This week · {doneDays} of 7</span>
          {s.longest > 1 && <span className="font-semibold text-white/70">Best · {s.longest} days</span>}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {s.week.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1">
              <span className={cn("text-[9px] font-bold uppercase", d.isToday ? "text-white" : "text-white/40")}>{d.label}</span>
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full",
                  d.done ? "bg-amber-300 text-amber-950" : d.isToday ? "border-2 border-white/90 motion-safe:animate-pulse" : "bg-white/[0.07]",
                )}
              >
                {d.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : d.isToday ? <span className="h-1 w-1 rounded-full bg-[#ffffff]" aria-hidden /> : null}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Small status chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {t.daily.available && (
          <Chip to="/pyq" search={{ practice: true, session: "daily" }} icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden />} label="Daily PYQ" value={t.daily.done ? "Done" : "To do"} done={t.daily.done} />
        )}
        <Chip
          to={t.due > 0 ? "/pyq" : "/notebook"}
          search={t.due > 0 ? { practice: true, session: "due" } : undefined}
          icon={t.due > 0 ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <BookMarked className="h-3.5 w-3.5" aria-hidden />}
          label="Revision"
          value={t.due > 0 ? `${t.due} due` : "All clear"}
          done={t.due === 0}
          attention={t.due > 0}
        />
        {showWeak && t.weak && (
          <Chip
            to="/pyq"
            search={{ subject: t.weak.subject, chapter: t.weak.chapter, practice: true, exam: t.exam ?? undefined }}
            icon={<Target className="h-3.5 w-3.5" aria-hidden />}
            label="Weak spot"
            value={t.weak.chapter}
          />
        )}
      </div>

      {/* The one action: a slim white pill, like "Browse sessions" */}
      <Link
        to={step.to}
        search={step.search}
        className="group mt-4 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-full bg-[#ffffff] py-1 pl-5 pr-1 text-left text-sm font-bold text-[#141b2b] sm:w-auto sm:min-w-72"
      >
        <span className="truncate">{step.label}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#141b2b] text-white transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    </div>
  );
}

function Chip({
  to,
  search,
  icon,
  label,
  value,
  done,
  attention,
}: {
  to: "/pyq" | "/notebook";
  search?: Record<string, unknown>;
  icon: React.ReactNode;
  label: string;
  value: string;
  done?: boolean;
  attention?: boolean;
}) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-1.5 rounded-xl border pl-1.5 pr-2.5 text-xs transition-colors",
        attention ? "border-amber-300/50 bg-amber-300/10 hover:bg-amber-300/15" : "border-white/10 bg-white/[0.05] hover:border-white/25 hover:bg-white/[0.09]",
      )}
    >
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md", done ? "bg-emerald-400 text-emerald-950" : attention ? "bg-amber-300 text-amber-950" : "bg-white/10 text-white")}>
        {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : icon}
      </span>
      <span className="text-white/60">{label}</span>
      <span className="truncate font-bold text-white">{value}</span>
    </Link>
  );
}

function UpNextRow({ info, onBrowse, divider }: { info: UpNextInfo; onBrowse?: () => void; divider: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", divider && "mt-5 border-t border-white/10 pt-4")}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#7ba4f0]">Up next</p>
        {info.state === "loading" && <p className="mt-1 text-sm text-white/60">Checking your calendar…</p>}
        {info.state === "empty" && (
          <>
            <p className="mt-1 text-sm font-bold">Nothing booked yet</p>
            <p className="max-w-xs text-balance text-xs text-white/60">{info.text}</p>
          </>
        )}
        {info.state === "session" && (
          <>
            <p className="mt-1 text-sm font-bold leading-snug">
              {info.date} · {info.meta}
            </p>
            <p className="truncate text-xs text-white/60">{info.title}</p>
          </>
        )}
      </div>

      {info.state === "empty" && (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onBrowse} className={cn(PILL, "border border-white/25 text-white hover:border-white/60")}>
            Browse sessions <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
          </button>
          <Link to="/my-sessions" className="inline-flex min-h-9 items-center px-1 text-xs font-semibold text-white/70 hover:text-white">
            My sessions
          </Link>
        </div>
      )}
      {info.state === "session" && (
        <div className="flex shrink-0 items-center gap-2">
          {info.joinUrl && (
            <a href={info.joinUrl} target="_blank" rel="noreferrer" className={cn(PILL, "bg-[#ffffff] text-[#141b2b]")}>
              Join session
            </a>
          )}
          <Link to="/my-sessions" className={cn(PILL, "border border-white/25 text-white hover:border-white/60")}>
            {info.total > 1 ? `All ${info.total} sessions` : "My sessions"}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Fetches the practice summary and renders the merged card. If the summary fails the card still shows "Up next". */
export function TodayCard({ upNext, onBrowseSessions, className }: { upNext?: UpNextInfo; onBrowseSessions?: () => void; className?: string }) {
  const { user } = useAuth();
  const [t, setT] = useState<TodaySummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await getTodaySummary({ data: { token } });
        if (!cancelled) setT(res);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nothing to show at all (summary failed and no Up next info): don't leave an empty card on the dashboard.
  if (failed && !upNext) return null;
  return <TodayView t={t} failed={failed} upNext={upNext} onBrowseSessions={onBrowseSessions} className={className} />;
}
