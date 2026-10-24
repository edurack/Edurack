// The first thing a student sees on the dashboard: one clear PYQ action, a streak,
// a short quest path, and a tile per subject. For a brand-new student it turns into
// "Solve your first question", because that first answer is what makes people stay.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, CalendarCheck, Check, Flame, Lock, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getTodaySummary } from "@/server-functions/practice-extras";
import { getPyqTree } from "@/server-functions/pyq-practice";
import type { PyqTree, TodaySummary } from "@/lib/pyq-types";
import { headlineFor } from "@/components/today-card";
import { examLabel, pickFirstChapter, practiceProgress, type PracticeStats } from "@/lib/practice-stats";
import { PRACTICE_ANSWERED_EVENT } from "@/components/dashboard/streak-popup";
import { cn } from "@/lib/utils";


// Fixed colours (like the Today card) so the hero looks the same in light and dark mode.
const SUBJECT_STYLE: { match: RegExp; bar: string; chip: string }[] = [
  { match: /phys/i, bar: "#7ba4f0", chip: "bg-[#7ba4f0]/15 text-[#a9c4f7]" },
  { match: /chem/i, bar: "#f5c26b", chip: "bg-amber-300/15 text-amber-200" },
  { match: /bot|biolog/i, bar: "#5fd3a0", chip: "bg-emerald-400/15 text-emerald-200" },
  { match: /zoo/i, bar: "#f08fa8", chip: "bg-rose-400/15 text-rose-200" },
  { match: /math/i, bar: "#b79cf5", chip: "bg-violet-400/15 text-violet-200" },
];
const subjectStyle = (name: string, i: number) =>
  SUBJECT_STYLE.find((s) => s.match.test(name)) ?? { bar: ["#7ba4f0", "#f5c26b", "#5fd3a0", "#f08fa8"][i % 4], chip: "bg-white/10 text-white/80" };

type Quest = { key: string; label: string; hint: string; done: boolean; progress: number };

function buildQuests(t: TodaySummary | null, attempted: number): Quest[] {
  const longest = Math.max(t?.streak.longest ?? 0, t?.streak.current ?? 0);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return [
    { key: "first", label: "First PYQ", hint: "Solve one question", done: attempted > 0 || longest > 0, progress: attempted > 0 || longest > 0 ? 1 : 0 },
    { key: "s3", label: "3-day streak", hint: "Practise 3 days in a row", done: longest >= 3, progress: clamp(longest / 3) },
    { key: "q25", label: "25 PYQs", hint: "Attempt 25 questions", done: attempted >= 25, progress: clamp(attempted / 25) },
    { key: "s7", label: "7-day streak", hint: "A full week, no breaks", done: longest >= 7, progress: clamp(longest / 7) },
  ];
}

function Ring({ percent, size = 96 }: { percent: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${percent}% of PYQs attempted`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={8} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f5c26b" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - percent / 100) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-xl font-extrabold leading-none tabular-nums">{percent}%</p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/50">done</p>
        </div>
      </div>
    </div>
  );
}

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
    // After an answer is saved in the streak popup, refetch so the flame, week strip and ring update at once.
    const onAnswered = () => void load(() => cancelled);
    window.addEventListener(PRACTICE_ANSWERED_EVENT, onAnswered);
    return () => { cancelled = true; window.removeEventListener(PRACTICE_ANSWERED_EVENT, onAnswered); };
  }, [load]);

  const exam = t?.exam ?? tree?.exam ?? null;
  const examName = exam ? examLabel(exam) : "NEET";
  const total = tree?.totalQuestions ?? 0;

  // The numbers come from the shared stats (the same ones the performance card shows). If they failed to load we fall
  // back to the browse tree's own counts so the hero still works.
  const examStats = stats ? (exam ? stats.byExam[exam as "neet" | "jee"] : undefined) ?? stats.overall : null;
  const treeAttempted = tree?.subjects.reduce((n, s) => n + s.attempted, 0) ?? 0;
  // Available / unique attempted / remaining / accuracy: ONE rule (practiceProgress), the same one the chapter lists use.
  // `attempted` counts distinct questions, so redoing a question in revision never moves it.
  const prog = practiceProgress(total, examStats ? examStats.solved : treeAttempted, examStats ? examStats.correct : tree?.totalCorrect ?? 0);
  const attempted = prog.attempted;
  const accuracy = prog.accuracy;
  const percent = prog.percentDone;

  // "New" means they have never answered a question in ANY exam. (It used to be judged from the exam-scoped tree, so a
  // student who had practised JEE while their profile said NEET was told to "solve your first question".)
  const ready = loaded && (stats !== null || statsFailed);
  const questionsAnswered = stats ? stats.questionsAnswered : treeAttempted;
  const isNew = ready && questionsAnswered === 0 && (stats !== null || ((t?.streak.longest ?? 0) === 0 && (t?.streak.current ?? 0) === 0));

  const quests = buildQuests(t, questionsAnswered);
  const nextQuest = quests.find((q) => !q.done);
  const head = t ? headlineFor(t) : null;
  const s = t?.streak;
  const lit = (s?.current ?? 0) > 0;
  const due = stats ? stats.overall.due : t?.due ?? 0;
  const dailyPending = Boolean(t?.daily.available && !t.daily.done);

  // ── Where the main button goes ──
  // New student: straight into 5 questions of the biggest chapter of their exam (no browsing, no setup).
  const first = pickFirstChapter(tree);
  const startTo = first ? { subject: first.subject, chapter: first.chapter, practice: true, first5: true, exam: exam ?? undefined } : { exam: exam ?? undefined };
  // Returning student: back to the chapter they were last in. (A chapter-less question opens that subject's chapter list.)
  const last = stats?.lastAttempt ?? null;
  const lastChapterNode = last?.chapter ? tree?.subjects.find((x) => x.subject === last.subject)?.chapters.find((c) => c.chapter.toLowerCase() === last.chapter.toLowerCase()) : undefined;
  const lastProgress = lastChapterNode ? practiceProgress(lastChapterNode.count, lastChapterNode.attempted, lastChapterNode.correct) : null;
  const lastLabel = last ? (last.chapter ? `${last.subject} · ${last.chapter}` : last.subject) + (lastProgress ? ` · ${lastProgress.attempted} of ${lastProgress.available} done` : "") : null;
  // `fresh`: pick up at the first question not attempted yet instead of re-serving finished ones.
  const continueSearch = last
    ? last.chapter
      ? { subject: last.subject, chapter: last.chapter, practice: true, fresh: true, exam: (last.exam as "neet" | "jee" | null) ?? exam ?? undefined }
      : { subject: last.subject, exam: exam ?? undefined }
    : { exam: exam ?? undefined };

  const CTA = "group inline-flex min-h-14 w-full items-center justify-between gap-4 rounded-full bg-[#ffffff] py-1.5 pl-6 pr-1.5 text-left text-base font-extrabold text-[#141b2b] shadow-[0_8px_30px_-8px_rgba(123,164,240,0.6)] transition-transform hover:-translate-y-0.5 sm:w-auto sm:min-w-80 motion-reduce:transition-none";
  const ARROW = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#141b2b] text-white transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none";

  const title = !ready ? "Your PYQ practice" : isNew ? "Welcome to Edurack" : head?.title ?? `${examName} PYQ practice`;
  const sub = !ready
    ? "Loading your progress…"
    : isNew
      ? `Start with 5 real previous-year ${examName} questions. Every one comes with the answer and a clear solution, and your streak starts with the first.`
      : head?.sub ?? "Chapter-wise questions with solutions, free.";

  return (
    <section aria-label="PYQ practice" className={cn("ink-section relative isolate overflow-hidden rounded-3xl p-5 sm:p-7", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-[#7ba4f0]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 -z-10 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-amber-950">
              <Sparkles className="h-3 w-3" aria-hidden /> {examName} PYQ practice · Free
            </span>
            {!isNew && (
              <span
                data-testid="hero-streak"
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold", lit ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-white/15 bg-white/[0.06] text-white/70")}
              >
                <Flame className={cn("h-4 w-4", lit ? "fill-amber-300 text-amber-300" : "text-white/50")} aria-hidden />
                {lit ? `${s!.current} day streak` : "No streak yet"}
              </span>
            )}
          </div>

          <h2 className="font-display mt-4 text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70 sm:text-[15px]">{sub}</p>

          {isNew ? (
            <>
              <Link to="/pyq" search={startTo} data-testid="hero-start-first-5" className={cn(CTA, "mt-5")}>
                <span className="min-w-0">
                  <span className="block truncate">Start Your First 5 {examName} PYQs</span>
                  <span className="block truncate text-[11px] font-semibold text-[#141b2b]/60">{first ? `${first.subject} · ${first.chapter} · about 10 minutes` : "Free · answers and solutions included"}</span>
                </span>
                <span className={ARROW}><ArrowRight className="h-5 w-5" aria-hidden /></span>
              </Link>
              <Link to="/pyq" search={{ exam: exam ?? undefined }} className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">
                or pick a subject yourself
              </Link>
            </>
          ) : (
            <>
              {/* Returning students: today's question + streak come first. */}
              {ready && t && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {t.daily.available && (
                    dailyPending ? (
                      <Link to="/pyq" search={{ practice: true, session: "daily" }} data-testid="hero-daily" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/15 px-4 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/25">
                        <CalendarCheck className="h-4 w-4" aria-hidden />
                        Solve today's PYQ
                        <span className="text-xs font-semibold text-amber-200/80">{lit ? `keeps your ${s!.current}-day streak` : "starts your streak"}</span>
                      </Link>
                    ) : (
                      <span data-testid="hero-daily-done" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 text-sm font-bold text-emerald-100">
                        <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> Today's PYQ done
                      </span>
                    )
                  )}
                </div>
              )}

              <Link to="/pyq" search={continueSearch} data-testid="hero-continue" className={cn(CTA, "mt-4")}>
                <span className="min-w-0">
                  <span className="block truncate">Continue Practising</span>
                  <span className="block truncate text-[11px] font-semibold text-[#141b2b]/60">{lastLabel ? `Last: ${lastLabel}` : "Pick a chapter and go"}</span>
                </span>
                <span className={ARROW}><ArrowRight className="h-5 w-5" aria-hidden /></span>
              </Link>

              {due > 0 && (
                <Link to="/pyq" search={{ practice: true, session: "due" }} data-testid="hero-revise" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-bold text-white transition-colors hover:border-white/60">
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Revise {due} mistake{due === 1 ? "" : "s"} due today
                </Link>
              )}

              {s && (
                <div className="mt-5 max-w-sm" role="img" aria-label={`Practised on ${s.week.filter((d) => d.done).length} of the last 7 days`}>
                  <div className="grid grid-cols-7 gap-1.5">
                    {s.week.map((d) => (
                      <div key={d.day} className="flex flex-col items-center gap-1">
                        <span className={cn("text-[9px] font-bold uppercase", d.isToday ? "text-white" : "text-white/40")}>{d.label}</span>
                        <span className={cn("grid h-7 w-7 place-items-center rounded-full", d.done ? "bg-amber-300 text-amber-950" : d.isToday ? "border-2 border-white/90 motion-safe:animate-pulse" : "bg-white/[0.07]")}>
                          {d.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Progress panel: only once there is progress to show. */}
        {!isNew && (
          <div className="flex shrink-0 items-center gap-5 rounded-3xl border border-white/10 bg-white/[0.05] p-5 lg:w-[19rem] lg:flex-col lg:items-stretch lg:gap-4">
            <div className="flex items-center gap-4">
              <Ring percent={percent} />
              <div className="min-w-0">
                <p className="text-sm font-bold">{attempted.toLocaleString("en-IN")} <span className="font-medium text-white/55">of {total.toLocaleString("en-IN")} PYQs attempted</span></p>
                <p className="mt-0.5 text-xs text-white/60">{prog.remaining.toLocaleString("en-IN")} left{accuracy !== null ? ` · ${accuracy}% accuracy` : " · accuracy shows after your first answer"}</p>
                {nextQuest && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-200"><Trophy className="h-3.5 w-3.5" aria-hidden />Next: {nextQuest.label}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Milestones + subject tiles are for students who have started; a brand-new student gets one clear action instead. */}
      {!isNew && (
        <ol className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Milestones">
          {quests.map((q) => {
            const isNext = nextQuest?.key === q.key;
            return (
              <li key={q.key} className={cn("rounded-2xl border p-3", q.done ? "border-emerald-300/30 bg-emerald-400/10" : isNext ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.04]")}>
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", q.done ? "bg-emerald-400 text-emerald-950" : isNext ? "bg-amber-300 text-amber-950" : "bg-white/10 text-white/60")}>
                    {q.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : isNext ? <Flame className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
                  </span>
                  <p className="truncate text-xs font-extrabold">{q.label}</p>
                </div>
                <p className="mt-1.5 truncate text-[11px] text-white/55">{q.done ? "Unlocked" : q.hint}</p>
                {!q.done && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full bg-amber-300" initial={{ width: 0 }} animate={{ width: `${Math.max(q.progress * 100, isNext ? 6 : 0)}%` }} transition={{ duration: 0.8 }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!isNew && tree && tree.subjects.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-[#7ba4f0]">Practise by subject</p>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {tree.subjects.slice(0, 4).map((sub, i) => {
              const st = subjectStyle(sub.subject, i);
              const pct = sub.count > 0 ? Math.round((sub.attempted / sub.count) * 100) : 0;
              return (
                <Link
                  key={sub.subject}
                  to="/pyq"
                  search={{ subject: sub.subject, exam: exam ?? undefined }}
                  className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 transition-colors hover:border-white/30 hover:bg-white/[0.09]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold">{sub.subject}</p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden />
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/55">{sub.count.toLocaleString("en-IN")} PYQs</p>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full" style={{ background: st.bar }} initial={{ width: 0 }} animate={{ width: `${Math.max(pct, sub.attempted > 0 ? 4 : 0)}%` }} transition={{ duration: 0.9, delay: 0.05 * i }} />
                  </div>
                  <p className={cn("mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold", st.chip)}>{sub.attempted > 0 ? `${pct}% · ${sub.correct} right` : "Start here"}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
