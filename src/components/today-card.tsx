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
    return { label: `Revise ${t.due} question${t.due === 1 ? "" : "s"}`, sub: "Mistakes from earlier, due back today", to: "/pyq", search: { practice: true, session: "due" } };
  if (t.daily.available && !t.daily.done)
    return { label: "Solve today's PYQ", sub: t.streak.current > 0 ? `Keep your ${t.streak.current}-day streak alive` : "Start your streak today", to: "/pyq", search: { practice: true, session: "daily" } };
  if (t.weak)
    return {
      label: `Practise ${t.weak.chapter}`,
      sub: `Your weakest chapter · ${t.weak.available} PYQ${t.weak.available === 1 ? "" : "s"} left`,
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

// Deepens in light mode (white text) and lightens in dark mode (dark text), so contrast holds in both themes.
const HERO_BG =
  "bg-[linear-gradient(135deg,var(--primary)_0%,color-mix(in_oklab,var(--primary)_68%,black)_100%)] dark:bg-[linear-gradient(135deg,var(--primary)_0%,color-mix(in_oklab,var(--primary)_78%,white)_100%)]";

const dayPhrase = (done: number) => `Practised on ${done} of the last 7 days`;

export function TodayView({ t, now = new Date() }: { t: TodaySummary; now?: Date }) {
  const step = pickStartHere(t);
  // When the big button already says "Practise <chapter>", a tile saying the same thing is noise.
  const showWeakTile = Boolean(t.weak) && step.search.chapter !== t.weak!.chapter;
  const { title, sub } = headlineFor(t);
  const s = t.streak;
  const doneDays = s.week.filter((d) => d.done).length;
  const lit = s.current > 0;
  const dateLabel = now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  return (
    <section
      aria-label="Today"
      className={cn(
        "relative isolate overflow-hidden rounded-3xl text-primary-foreground",
        "shadow-[0_24px_48px_-24px_color-mix(in_oklab,var(--primary)_75%,transparent)]",
        "animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none",
        HERO_BG,
      )}
    >
      {/* Decoration: dotted texture + two soft glows. Purely visual. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] [background-image:radial-gradient(currentColor_1px,transparent_1.2px)] [background-size:16px_16px]" />
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-primary-foreground/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-56 w-56 rounded-full bg-primary-foreground/10 blur-3xl" />

      <div className="p-5 sm:p-7">
        {/* Header: message + streak badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden />
              Today · {dateLabel}
            </p>
            <h2 className="font-display mt-2 text-balance text-[22px] font-extrabold leading-[1.15] tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1.5 max-w-sm text-balance text-sm opacity-80">{sub}</p>
          </div>

          <div className="flex shrink-0 flex-col items-center pt-2" data-testid="today-streak" aria-label={lit ? `${s.current} day streak` : "No streak yet"}>
            <div
              className={cn(
                "relative grid h-[68px] w-[68px] place-items-center rounded-[22px] border",
                lit ? "border-amber-300/50 bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_8px_24px_-6px_rgba(251,191,36,0.75)]" : "border-primary-foreground/20 bg-primary-foreground/10",
              )}
            >
              <Flame className={cn("absolute -top-3 h-7 w-7 drop-shadow", lit ? "fill-amber-100 text-amber-600" : "text-primary-foreground/60")} aria-hidden />
              <span className="font-display mt-3 text-3xl font-extrabold leading-none tabular-nums">{s.current}</span>
            </div>
            <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest opacity-80">{lit ? (s.current === 1 ? "day" : "days") : "streak"}</span>
          </div>
        </div>

        {/* Week strip */}
        <div className="mt-5 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/10 px-3 pb-2.5 pt-3 backdrop-blur-sm" role="img" aria-label={dayPhrase(doneDays)}>
          <div className="grid grid-cols-7 gap-1.5">
            {s.week.map((d) => (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <span className={cn("text-[10px] font-bold uppercase", d.isToday ? "opacity-100" : "opacity-60")}>{d.label}</span>
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold transition-colors",
                    d.done
                      ? "bg-amber-300 text-amber-950 shadow-[0_4px_12px_-4px_rgba(251,191,36,0.8)]"
                      : d.isToday
                        ? "border-2 border-primary-foreground/90 motion-safe:animate-pulse"
                        : "border border-primary-foreground/25 text-primary-foreground/40",
                  )}
                >
                  {d.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : d.isToday ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" aria-hidden /> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 flex items-center justify-between gap-2 text-[11px] opacity-75">
            <span>{dayPhrase(doneDays)}</span>
            {s.longest > 1 && <span className="shrink-0 font-semibold">Best · {s.longest} days</span>}
          </p>
        </div>

        {/* Today's missions */}
        <div className={cn("mt-3 grid gap-2.5", t.daily.available ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
          {t.daily.available && (
            <Tile
              to="/pyq"
              search={{ practice: true, session: "daily" }}
              icon={<CalendarCheck className="h-4 w-4" aria-hidden />}
              label="Today's PYQ"
              value={t.daily.done ? "Done" : "Solve now"}
              done={t.daily.done}
              delay={60}
            />
          )}
          <Tile
            to={t.due > 0 ? "/pyq" : "/notebook"}
            search={t.due > 0 ? { practice: true, session: "due" } : undefined}
            icon={t.due > 0 ? <RotateCcw className="h-4 w-4" aria-hidden /> : <BookMarked className="h-4 w-4" aria-hidden />}
            label="Revision"
            value={t.due > 0 ? `${t.due} due` : "All clear"}
            done={t.due === 0}
            attention={t.due > 0}
            delay={120}
          />
          {showWeakTile && t.weak && (
            <Tile
              to="/pyq"
              search={{ subject: t.weak.subject, chapter: t.weak.chapter, practice: true, exam: t.exam ?? undefined }}
              icon={<Target className="h-4 w-4" aria-hidden />}
              label="Weakest chapter"
              value={t.weak.chapter}
              note={`${t.weak.available} PYQ${t.weak.available === 1 ? "" : "s"} left`}
              className={t.daily.available ? "col-span-2 sm:col-span-1" : ""}
              delay={180}
            />
          )}
        </div>

        {/* The one big action */}
        <Link
          to={step.to}
          search={step.search}
          className="group mt-3.5 flex min-h-[60px] items-center justify-between gap-3 rounded-2xl bg-primary-foreground px-4 py-3 text-left text-primary shadow-[0_14px_28px_-14px_rgba(0,0,0,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-14px_rgba(0,0,0,0.6)] active:translate-y-0 motion-reduce:transition-none"
        >
          <span className="min-w-0">
            <span className="font-display block truncate text-[15px] font-extrabold">{step.label}</span>
            <span className="block truncate text-xs font-medium opacity-70">{step.sub}</span>
          </span>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      </div>
    </section>
  );
}

function Tile({
  to,
  search,
  icon,
  label,
  value,
  note,
  done,
  attention,
  className,
  delay = 0,
}: {
  to: "/pyq" | "/notebook";
  search?: Record<string, unknown>;
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  done?: boolean;
  attention?: boolean;
  className?: string;
  delay?: number;
}) {
  return (
    <Link
      to={to}
      search={search}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/10 p-3 transition-colors duration-200 hover:bg-primary-foreground/[0.17] motion-reduce:transition-none",
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 motion-reduce:animate-none",
        attention && "border-amber-300/60 bg-amber-300/15",
        className,
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", done ? "bg-emerald-400/90 text-emerald-950" : attention ? "bg-amber-300 text-amber-950" : "bg-primary-foreground/15")}>
        {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
        <span className="font-display block truncate text-sm font-extrabold leading-snug">{value}</span>
        {note && <span className="block truncate text-[11px] opacity-70">{note}</span>}
      </span>
    </Link>
  );
}

export function TodayCard() {
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

  // Never get in the way of the dashboard: if this fails, it simply isn't there.
  if (failed) return null;
  if (!t) return <div className="h-[340px] animate-pulse rounded-3xl bg-primary/15 sm:h-72" aria-hidden />;
  return <TodayView t={t} />;
}
