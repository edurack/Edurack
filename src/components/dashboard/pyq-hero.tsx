// The first thing a student can act on in the dashboard: where to start practising.
// A thin goal bar and one line of numbers, one "continue" button, and a soft tile per subject.
// For a brand-new student it turns into a single "Start your first 5" button, because that first answer is what makes people stay.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Atom, BookOpen, CalendarCheck, Check, FlaskConical, Flame, Leaf, PawPrint, RotateCcw, Sigma } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getTodaySummary } from "@/server-functions/practice-extras";
import { getPyqTree } from "@/server-functions/pyq-practice";
import type { PyqTree, TodaySummary } from "@/lib/pyq-types";
import { examLabel, pickFirstChapter, practiceProgress, type PracticeStats } from "@/lib/practice-stats";
import { PRACTICE_ANSWERED_EVENT } from "@/components/dashboard/streak-popup";
import { cn } from "@/lib/utils";

// One soft tint per subject. Every colour has a light and a dark value, so the tiles read well in both modes.
// The array order is also the order the tiles are shown in.
const SUBJECT_STYLE: { match: RegExp; icon: typeof Atom; tile: string; icon_: string; bar: string }[] = [
  { match: /phys/i, icon: Atom, tile: "bg-sky-500/10 hover:bg-sky-500/15", icon_: "text-sky-700 dark:text-sky-300", bar: "bg-sky-600 dark:bg-sky-400" },
  { match: /chem/i, icon: FlaskConical, tile: "bg-amber-500/10 hover:bg-amber-500/15", icon_: "text-amber-700 dark:text-amber-300", bar: "bg-amber-600 dark:bg-amber-400" },
  { match: /zoo/i, icon: PawPrint, tile: "bg-rose-500/10 hover:bg-rose-500/15", icon_: "text-rose-700 dark:text-rose-300", bar: "bg-rose-600 dark:bg-rose-400" },
  { match: /bot|biolog/i, icon: Leaf, tile: "bg-emerald-500/10 hover:bg-emerald-500/15", icon_: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-600 dark:bg-emerald-400" },
  { match: /math/i, icon: Sigma, tile: "bg-violet-500/10 hover:bg-violet-500/15", icon_: "text-violet-700 dark:text-violet-300", bar: "bg-violet-600 dark:bg-violet-400" },
];
const FALLBACK_STYLE = { icon: BookOpen, tile: "bg-foreground/[0.04] hover:bg-foreground/[0.07]", icon_: "text-foreground/70", bar: "bg-foreground/60" };
const subjectStyle = (name: string) => SUBJECT_STYLE.find((s) => s.match.test(name)) ?? FALLBACK_STYLE;
const subjectRank = (name: string) => {
  const i = SUBJECT_STYLE.findIndex((s) => s.match.test(name));
  return i === -1 ? SUBJECT_STYLE.length : i;
};

export function PyqHero({ className, stats = null, statsFailed = false }: { className?: string; /** The shared practice numbers (see use-practice-stats). null while loading. */ stats?: PracticeStats | null; statsFailed?: boolean }) {
  const { user } = useAuth();
  const [t, setT] = useState<TodaySummary | null>(null);
  const [tree, setTree] = useState<PyqTree | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!user) return;
    const token = await user.getIdToken();
    const [a, b] = await Promise.allSettled([getTodaySummary({ data: { token } }), getPyqTree({ data: { token } })]);
    if (isCancelled()) return;
    if (a.status === "fulfilled") setT(a.value);
    if (b.status === "fulfilled") setTree(b.value);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    // After an answer is saved in the streak popup, refetch so the goal bar and the numbers update at once.
    const onAnswered = () => void load(() => cancelled);
    window.addEventListener(PRACTICE_ANSWERED_EVENT, onAnswered);
    return () => { cancelled = true; window.removeEventListener(PRACTICE_ANSWERED_EVENT, onAnswered); };
  }, [load]);

  const exam = t?.exam ?? tree?.exam ?? null;
  const examName = exam ? examLabel(exam) : "NEET";

  // The numbers come from the shared stats (the same ones the performance card shows). If they failed to load we fall
  // back to the browse tree's own counts so the section still works.
  const treeAttempted = tree?.subjects.reduce((n, s) => n + s.attempted, 0) ?? 0;

  // "New" means they have never answered a question in ANY exam. (It used to be judged from the exam-scoped tree, so a
  // student who had practised JEE while their profile said NEET was told to "solve your first question".)
  const ready = loaded && (stats !== null || statsFailed);
  const questionsAnswered = stats ? stats.questionsAnswered : treeAttempted;
  const isNew = ready && questionsAnswered === 0 && (stats !== null || ((t?.streak.longest ?? 0) === 0 && (t?.streak.current ?? 0) === 0));

  const s = t?.streak;
  const lit = (s?.current ?? 0) > 0;
  const doneDays = s ? s.week.filter((d) => d.done).length : 0;
  const due = stats ? stats.overall.due : t?.due ?? 0;
  const dailyPending = Boolean(t?.daily.available && !t.daily.done);
  const o = stats?.overall ?? null;

  // ── Where the main button goes ──
  // New student: straight into 5 questions of the biggest chapter of their exam (no browsing, no setup).
  const first = pickFirstChapter(tree);
  const startTo = first ? { subject: first.subject, chapter: first.chapter, practice: true, first5: true, exam: exam ?? undefined } : { exam: exam ?? undefined };
  // Returning student: back to the chapter they were last in. (A chapter-less question opens that subject's chapter list.)
  const last = stats?.lastAttempt ?? null;
  const lastChapterNode = last?.chapter ? tree?.subjects.find((x) => x.subject === last.subject)?.chapters.find((c) => c.chapter.toLowerCase() === last.chapter.toLowerCase()) : undefined;
  const lastProgress = lastChapterNode ? practiceProgress(lastChapterNode.count, lastChapterNode.attempted, lastChapterNode.correct) : null;
  const lastLabel = last ? (last.chapter ? `${last.subject} · ${last.chapter}` : last.subject) + (lastProgress ? ` · ${lastProgress.attempted} of ${lastProgress.available}` : "") : null;
  // `fresh`: pick up at the first question not attempted yet instead of re-serving finished ones.
  const continueSearch = last
    ? last.chapter
      ? { subject: last.subject, chapter: last.chapter, practice: true, fresh: true, exam: (last.exam as "neet" | "jee" | null) ?? exam ?? undefined }
      : { subject: last.subject, exam: exam ?? undefined }
    : { exam: exam ?? undefined };

  const subjects = tree ? [...tree.subjects].sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject)).slice(0, 4) : [];

  const CTA = "group inline-flex min-h-14 w-full items-center justify-between gap-4 rounded-full bg-primary py-2 pl-6 pr-4 text-left text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto sm:min-w-80 motion-reduce:transition-none";
  const QUIET = "inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline";
  const num = "font-semibold text-foreground";
  const TILE = "flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-foreground/10 px-4 py-2 text-[13px]";

  return (
    <section aria-label="PYQ practice" className={cn("min-w-0", className)}>
      {!ready ? (
        <div aria-busy="true">
          <div className="h-14 w-full max-w-sm animate-pulse rounded-full bg-foreground/10" />
          <p className="mt-3 text-[13px] text-foreground/70">Loading your progress…</p>
        </div>
      ) : isNew ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{examName} PYQ practice · Free</p>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-foreground/80">Start with 5 real previous-year {examName} questions. Every one comes with the answer and a clear solution, and your streak starts with the first.</p>
          <Link to="/pyq" search={startTo} data-testid="hero-start-first-5" className={cn(CTA, "mt-5")}>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">Start Your First 5 {examName} PYQs</span>
              <span className="block truncate text-[13px] text-primary-foreground/90">{first ? `${first.subject} · ${first.chapter} · about 10 minutes` : "Free · answers and solutions included"}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </Link>
          <Link to="/pyq" search={{ exam: exam ?? undefined }} className={cn(QUIET, "mt-1")}>
            or pick a subject yourself
          </Link>
        </div>
      ) : (
        <div>
          {/* Goal and numbers: one thin bar, one line. */}
          {s && (
            <div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <p className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                  {s.doneToday && <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" strokeWidth={3} aria-hidden />}
                  <span className="truncate">{s.doneToday ? "Today's goal reached" : "Today's goal: solve 1 PYQ"}</span>
                </p>
                <p className="flex shrink-0 items-center gap-2 tabular-nums text-foreground/70">
                  <span data-testid="hero-streak" aria-label={lit ? `${s.current} day streak` : "No streak yet"} className="inline-flex items-center gap-0.5 font-semibold text-foreground/80">
                    <Flame className={cn("h-4 w-4", lit ? "fill-amber-500 text-amber-500" : "text-foreground/50")} aria-hidden />
                    {s.current}
                  </span>
                  <span>{doneDays} of 7 days</span>
                </p>
              </div>
              <div role="progressbar" aria-label="Days practised this week" aria-valuemin={0} aria-valuemax={7} aria-valuenow={doneDays} className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full rounded-full bg-primary transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${(doneDays / 7) * 100}%` }} />
              </div>
            </div>
          )}
          {o && (
            <p className={cn("text-[13px] tabular-nums text-foreground/70", s ? "mt-3" : "")} aria-label="Your practice at a glance">
              <span className={num}>{o.solved.toLocaleString("en-IN")}</span> solved · <span className={num}>{o.accuracy !== null ? `${o.accuracy}%` : "–"}</span> accuracy · <span className={num}>{o.weekAnswered.toLocaleString("en-IN")}</span> this week · <span className={num}>{o.due.toLocaleString("en-IN")}</span> to revise
            </p>
          )}

          {/* The one main action, with today's question and revision as quiet links. */}
          <Link to="/pyq" search={continueSearch} data-testid="hero-continue" className={cn(CTA, s || o ? "mt-5" : "")}>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">Continue practising</span>
              <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-primary-foreground/90">{lastLabel ?? "Pick a chapter and go"}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </Link>
          {((t?.daily.available ?? false) || due > 0) && (
            <div className="mt-3 grid grid-cols-2 gap-3 [&>*:only-child]:col-span-2">
              {t?.daily.available && (
                dailyPending ? (
                  <Link to="/pyq" search={{ practice: true, session: "daily" }} data-testid="hero-daily" className={cn(TILE, "transition-colors hover:bg-foreground/[0.04] motion-reduce:transition-none")}>
                    <CalendarCheck className="h-5 w-5 shrink-0 text-foreground/70" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">Today's PYQ</span>
                      <span className="block truncate text-foreground/70">{lit && !s?.doneToday ? "Keep your streak" : "Daily question"}</span>
                    </span>
                  </Link>
                ) : (
                  <div data-testid="hero-daily-done" className={TILE}>
                    <Check className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" strokeWidth={3} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">Today's PYQ</span>
                      <span className="block truncate text-emerald-700 dark:text-emerald-300">Done</span>
                    </span>
                  </div>
                )
              )}
              {due > 0 && (
                <Link to="/pyq" search={{ practice: true, session: "due" }} data-testid="hero-revise" className={cn(TILE, "transition-colors hover:bg-foreground/[0.04] motion-reduce:transition-none")}>
                  <RotateCcw className="h-5 w-5 shrink-0 text-foreground/70" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">Revise {due}</span>
                    <span className="block truncate text-foreground/70">Due today</span>
                  </span>
                </Link>
              )}
            </div>
          )}

          {/* A soft tile per subject: tap to open that subject's PYQs. */}
          {subjects.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-foreground/70">Practise by subject</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {subjects.map((sub) => {
                  const st = subjectStyle(sub.subject);
                  const Icon = st.icon;
                  const pct = sub.count > 0 ? Math.round((sub.attempted / sub.count) * 100) : 0;
                  return (
                    <Link
                      key={sub.subject}
                      to="/pyq"
                      search={{ subject: sub.subject, exam: exam ?? undefined }}
                      className={cn("flex min-h-32 min-w-0 flex-col rounded-2xl p-4 transition-colors motion-reduce:transition-none", st.tile)}
                    >
                      <Icon className={cn("h-6 w-6", st.icon_)} aria-hidden />
                      <p className="mt-3 truncate text-[15px] font-semibold text-foreground">{sub.subject}</p>
                      <p className="mt-0.5 text-[13px] text-foreground/70">{sub.count.toLocaleString("en-IN")} PYQs</p>
                      <div className="mt-auto pt-3">
                        {sub.attempted > 0 ? (
                          <>
                            <p className="text-[13px] font-medium text-foreground">{pct}% done</p>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                              <div className={cn("h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none", st.bar)} style={{ width: `${Math.max(pct, 4)}%` }} />
                            </div>
                          </>
                        ) : (
                          <p className="text-[13px] font-medium text-foreground">Start here</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
