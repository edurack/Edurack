import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookMarked, CalendarCheck, Flame, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getTodaySummary } from "@/server-functions/practice-extras";
import type { TodaySummary } from "@/lib/pyq-types";

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
  if (!t) return <div className="h-28 animate-pulse rounded-3xl border border-border bg-card" aria-hidden />;

  const step = pickStartHere(t);
  const allDone = t.due === 0 && t.daily.done;

  return (
    <section className="min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-6" aria-label="Today">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Today</p>
          <p className="font-display mt-1 text-lg font-extrabold tracking-tight">{allDone && !t.weak ? "You're all caught up" : "Start here"}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5" data-testid="today-streak">
              <Flame className={`h-4 w-4 ${t.streak.current > 0 ? "text-amber-500" : ""}`} aria-hidden />
              {t.streak.current > 0 ? (
                <>
                  <b className="text-foreground">{t.streak.current}</b>-day streak{t.streak.doneToday ? " ✓" : ""}
                </>
              ) : (
                "No streak yet"
              )}
            </span>
            {t.daily.available && (
              <Link to="/pyq" search={{ practice: true, session: "daily" }} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <CalendarCheck className="h-4 w-4" aria-hidden />
                {t.daily.done ? "Today's PYQ done ✓" : "Today's PYQ"}
              </Link>
            )}
            <Link to="/notebook" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <BookMarked className="h-4 w-4" aria-hidden />
              {t.due > 0 ? <><b className="text-foreground">{t.due}</b> to revise</> : "Notebook"}
            </Link>
            {t.weak && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-4 w-4" aria-hidden />
                Weak: {t.weak.chapter}
              </span>
            )}
          </div>
        </div>
        <Link
          to={step.to}
          search={step.search}
          className="group inline-flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-left text-primary-foreground transition-opacity hover:opacity-90 sm:min-w-64"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold">{step.label}</span>
            <span className="block truncate text-xs opacity-80">{step.sub}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
