import { useEffect, useMemo, useRef, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Flag, Flame, Lightbulb, SlidersHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { bumpGuestPyqCount, getGuestPyqCount } from "@/lib/guest-pyq";
import { SmartContent } from "@/lib/smart-content";
import { listPyqQuestions, listWeakPyqQuestions, submitPyqAnswer } from "@/server-functions/pyq-practice";
import { checkGuestPyqAnswer, listGuestPyqQuestions } from "@/server-functions/pyq-guest";
import { listPyqSession, togglePyqBookmark } from "@/server-functions/practice-extras";
import { ReportDialog } from "@/components/pyq/report-dialog";
import { SessionSummary } from "@/components/pyq/session-summary";
import { GUEST_PYQ_LIMIT, SESSION_TITLES, type Difficulty, type OptionKey, type PyqCheckResult, type PyqList, type PyqQuestion, type PyqStatus, type SessionKind } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";
import { track, trackOnce } from "@/lib/analytics";
import { answeredProps, completedProps, isMistakeRevision, practiceModeFor, practiceProps, type PracticeContext } from "@/lib/practice-events";

type Props = {
  /** Chapter practice (browse mode). Omit when `weakAttemptId` is set. */
  subject?: string;
  chapter?: string;
  topic?: string;
  /** "Practice my weak topics": a mixed session built from this attempt's weak chapters. */
  weakAttemptId?: string;
  /** A ready-made session: today's PYQ, revision that's due, mistakes, or bookmarks. */
  session?: SessionKind;
  /** Called when the student finishes the list or taps the back control. */
  /** Exam the student is browsing (so the list matches the tree). */
  exam?: string;
  /** Logged-out visitor: free preview via the guest endpoints, nothing saved, sign-up prompt after a few questions. */
  guest?: boolean;
  /** Cap the list (e.g. 5 for the new-student "first 5 PYQs" start). Finishing the capped list ends the session normally. */
  limit?: number;
  /** Open on the questions not attempted yet (falls back to everything once none are left), so "continue" never re-serves finished questions. */
  startFresh?: boolean;
  /** Where the session was launched from, for analytics only (e.g. "first_five"). */
  source?: string;
  onExit: () => void;
};

type StatusFilter = "all" | "unsolved" | "wrong" | "new";
type Local = PyqCheckResult & { chosenOption?: OptionKey; chosenValue?: number };

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];
const EMPTY_SESSION: Record<SessionKind, string> = {
  daily: "There's no PYQ for today yet. Check back soon.",
  due: "Nothing is due for revision right now. Nice work — we'll remind you when something is.",
  wrong: "No mistakes to fix. Keep practising and anything you get wrong will appear here.",
  bookmarked: "No bookmarks yet. Tap the bookmark icon on any question to save it for later.",
};
const SCROLL_ROW = "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function PyqPractice({ subject, chapter, topic, weakAttemptId, session, exam, guest = false, limit, startFresh = false, source, onExit }: Props) {
  const { user: authUser } = useAuth();
  // A guest never uses the signed-in endpoints, even if auth finishes loading mid-session.
  const user = guest ? null : authUser;
  const [gated, setGated] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | "All">("All");
  const [year, setYear] = useState("All");
  // A weak-topics session starts on questions the student hasn't solved yet.
  // A fresh start (Continue / "5 more") shows only questions never attempted; mistake revision is the one place repeats are the point.
  const defaultStatus: StatusFilter = weakAttemptId ? "unsolved" : startFresh && !session ? "new" : "all";
  const [statusF, setStatusF] = useState<StatusFilter>(defaultStatus);
  const [showFilters, setShowFilters] = useState(false);

  const [list, setList] = useState<PyqList | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  const [picked, setPicked] = useState<Record<string, OptionKey | undefined>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Local>>({});
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [streakNow, setStreakNow] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Set the instant a check/reveal starts (state updates are asynchronous, so two quick taps could both get past `busy`).
  const inflight = useRef(false);
  // In mistake revision the point is to TRY again, so the solution stays hidden until an answer is submitted.
  const revising = session === "due" || session === "wrong";

  // Analytics. One `practice_started` per practice session and one `practice_completed` per finished session: the refs
  // make a refetch (difficulty chip), a StrictMode re-run or a re-render unable to send either twice.
  const mode = practiceModeFor({ session, weakAttemptId });
  const startedFor = useRef<string | null>(null);
  const completedSent = useRef(false);
  const ctxFor = (qq?: PyqQuestion): PracticeContext => ({ mode, exam, subject: qq?.subject ?? subject, chapter: qq?.chapter ?? chapter, guest, source });

  // Already used the free questions on an earlier visit? Go straight to the sign-up prompt.
  useEffect(() => {
    if (guest && getGuestPyqCount() >= GUEST_PYQ_LIMIT) setGated(true);
  }, [guest]);

  // Only these actually change what the server has to fetch (a different
  // chapter/topic/exam, or the difficulty match). "year" and "status" are
  // applied to the already-loaded list below instead of round-tripping —
  // they used to be sent to the server too, but the server only ever used
  // them to filter the list it had already built, so toggling them re-ran
  // the whole (slow) query for no reason and flashed the loading skeleton.
  useEffect(() => {
    if (!user && !guest) return;
    let cancelled = false;
    setList(null);
    setLoadError(null);
    (async () => {
      try {
        const difficultyFilter = difficulty === "All" ? undefined : difficulty;
        let res: PyqList;
        if (user) {
          const token = await user.getIdToken();
          res = session
            ? await listPyqSession({ data: { token, kind: session, difficulty: difficultyFilter } })
            : weakAttemptId
            ? await listWeakPyqQuestions({ data: { token, attemptId: weakAttemptId, difficulty: difficultyFilter } })
            : await listPyqQuestions({ data: { token, subject: subject!, exam, chapter: chapter!, topic, difficulty: difficultyFilter } });
        } else {
          // Guest: chapter/topic practice only (sessions and weak-topic runs need an account).
          res = await listGuestPyqQuestions({ data: { subject: subject!, chapter: chapter!, topic, exam } });
        }
        if (cancelled) return;
        setList(res);
        const sessionKey = [mode, subject, chapter, topic, weakAttemptId, session, guest ? "g" : "u"].join("|");
        if (res.questions.length > 0 && startedFor.current !== sessionKey) {
          startedFor.current = sessionKey;
          const props = { ...practiceProps(ctxFor()), question_count: limit ? Math.min(limit, res.questions.length) : res.questions.length };
          track("practice_started", props);
          if (isMistakeRevision(mode)) track("mistake_revision_started", { ...props, source: session });
        }
        // Union, not replace: other filters shrink the server's year list, and the
        // filter panel shouldn't change shape while the student is using it.
        setYears((prev) => [...new Set([...prev, ...res.years])].sort((a, b) => b.localeCompare(a)));
        setIdx(0);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load questions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, guest, subject, chapter, topic, weakAttemptId, session, exam, difficulty]);

  // "Not attempted yet" with nothing left to attempt: show the whole list instead of an empty screen.
  useEffect(() => {
    if (list && statusF === "new" && defaultStatus === "new" && !list.questions.some((x) => x.status === "new" || x.status === "revealed")) setStatusF("all");
  }, [list, statusF, defaultStatus]);

  // Year/status chips just re-filter the list already in memory — no fetch.
  useEffect(() => {
    setIdx(0);
  }, [year, statusF]);

  const questions = useMemo(() => {
    let qs = list?.questions ?? [];
    if (year !== "All") qs = qs.filter((x) => x.source.year === year);
    if (statusF === "unsolved") qs = qs.filter((x) => x.status !== "correct");
    else if (statusF === "wrong") qs = qs.filter((x) => x.status === "wrong");
    else if (statusF === "new") qs = qs.filter((x) => x.status === "new" || x.status === "revealed"); // a peeked-at solution isn't an attempt
    return limit ? qs.slice(0, limit) : qs;
  }, [list, year, statusF, limit]);
  const q: PyqQuestion | undefined = questions[idx];
  const result = q ? results[q.id] : undefined;
  const activeFilters = (difficulty !== "All" ? 1 : 0) + (year !== "All" ? 1 : 0) + (statusF !== defaultStatus ? 1 : 0);

  const canCheck = useMemo(() => {
    if (!q || result) return false;
    if (q.type === "mcq") return Boolean(picked[q.id]);
    const n = Number(typed[q.id]);
    return (typed[q.id] ?? "").trim() !== "" && Number.isFinite(n);
  }, [q, result, picked, typed]);

  async function send(answer: { option?: OptionKey; value?: number } | null) {
    if ((!user && !guest) || !q || busy || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      let res: PyqCheckResult;
      if (user) {
        const token = await user.getIdToken();
        res = await submitPyqAnswer({ data: { token, questionId: q.id, answer } });
      } else {
        res = await checkGuestPyqAnswer({ data: { questionId: q.id, answer } });
        bumpGuestPyqCount();
      }
      setResults((r) => ({ ...r, [q.id]: { ...res, chosenOption: answer?.option, chosenValue: answer?.value } }));
      // Only a real answer is an answer; peeking at the solution (answer === null) isn't sent. Never the chosen option/number.
      if (answer !== null) {
        track("question_answered", { ...answeredProps(ctxFor(q), { questionId: q.id, questionType: q.type, isCorrect: res.isCorrect }), corrected: res.corrected === true });
        // Once per India day per student, however many times the daily question screen is opened.
        if (mode === "daily" && user) trackOnce(`daily:${user.uid}`, "daily_question_completed", { ...practiceProps(ctxFor(q)), is_correct: res.isCorrect }, "day");
      }
      if (res.streak) setStreakNow(res.streak.current);
      // Keep the status chip in sync without refetching the list.
      setList((l) =>
        l ? { ...l, questions: l.questions.map((x) => (x.id === q.id ? { ...x, status: res.status as PyqStatus } : x)) } : l,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function check() {
    if (!q) return;
    void send(q.type === "mcq" ? { option: picked[q.id] } : { value: Number(typed[q.id]) });
  }

  async function toggleBookmark() {
    if (!q) return;
    if (!user) {
      setActionError("Log in or create a free account to bookmark questions.");
      return;
    }
    const value = !q.bookmarked;
    // Optimistic: the star flips immediately, and flips back if the server says no.
    const flip = (v: boolean) => setList((l) => (l ? { ...l, questions: l.questions.map((x) => (x.id === q.id ? { ...x, bookmarked: v } : x)) } : l));
    flip(value);
    try {
      const token = await user.getIdToken();
      await togglePyqBookmark({ data: { token, questionId: q.id, value } });
    } catch {
      flip(!value);
      setActionError("Couldn't update your bookmark. Try again.");
    }
  }

  const atEnd = idx >= questions.length - 1;
  function next() {
    // Guests hit the sign-up prompt at the end of their free slice, or once their free questions are used up.
    if (guest && (atEnd || getGuestPyqCount() >= GUEST_PYQ_LIMIT)) {
      setGated(true);
      return;
    }
    if (atEnd) setFinished(true);
    else setIdx((i) => i + 1);
  }

  const weakChapters = list?.weak?.chapters.filter((c) => c.count > 0) ?? [];
  const heading = session ? SESSION_TITLES[session] : weakAttemptId ? "Your weak topics" : topic ? `${chapter} · ${topic}` : chapter;
  const subheading = session
    ? "Practice"
    : weakAttemptId
    ? weakChapters.length > 0
      ? weakChapters.map((c) => c.chapter).join(" · ")
      : "From your last test"
    : subject;

  useEffect(() => {
    if (!finished || completedSent.current) return;
    completedSent.current = true;
    const all = Object.values(results);
    const counts = {
      answered: all.filter((r) => !r.revealed).length,
      correct: all.filter((r) => !r.revealed && r.isCorrect).length,
      wrong: all.filter((r) => !r.revealed && !r.isCorrect).length,
      peeked: all.filter((r) => r.revealed).length,
    };
    track("practice_completed", completedProps(ctxFor(), counts));
    if (isMistakeRevision(mode)) track("mistake_revision_completed", { ...completedProps(ctxFor(), counts), source: session });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (gated) {
    const all = Object.values(results);
    return (
      <GuestGate
        answered={all.filter((r) => !r.revealed).length}
        correct={all.filter((r) => !r.revealed && r.isCorrect).length}
        onBack={onExit}
      />
    );
  }

  if (finished) {
    const all = Object.values(results);
    const stats = {
      answered: all.filter((r) => !r.revealed).length,
      correct: all.filter((r) => !r.revealed && r.isCorrect).length,
      wrong: all.filter((r) => !r.revealed && !r.isCorrect).length,
      peeked: all.filter((r) => r.revealed).length,
    };
    return <SessionSummary title={heading} stats={stats} streak={streakNow} weakAttemptId={weakAttemptId} showQuickMock={!revising && !guest} onDone={onExit} />;
  }

  return (
    <div className="animate-in fade-in duration-300 motion-reduce:animate-none">
      {reporting && q && <ReportDialog questionId={q.id} onClose={() => setReporting(false)} />}
      {/* Top bar */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onExit}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{heading}</p>
          <p className="truncate text-[11px] text-foreground/50">{subheading}</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold",
            activeFilters > 0 ? "clay-btn text-white" : "clay-chip text-foreground/70",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters{activeFilters > 0 && ` (${activeFilters})`}
        </button>
      </div>

      {showFilters && (
        <div className="clay-inset mb-3 space-y-3 rounded-2xl p-3 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          <FilterGroup label="Difficulty">
            {(["All", "Easy", "Medium", "Hard"] as const).map((d) => (
              <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                {d}
              </Chip>
            ))}
          </FilterGroup>
          {years.length > 1 && (
            <FilterGroup label="Paper year">
              {["All", ...years].map((y) => (
                <Chip key={y} active={year === y} onClick={() => setYear(y)}>
                  {y === "All" ? "All years" : y}
                </Chip>
              ))}
            </FilterGroup>
          )}
          <FilterGroup label="Show">
            {([["all", "Everything"], ["new", "Not attempted yet"], ["unsolved", "Not solved yet"], ["wrong", "Got wrong"]] as const).map(([id, label]) => (
              <Chip key={id} active={statusF === id} onClick={() => setStatusF(id)}>
                {label}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      )}

      {list === null && !loadError ? (
        <div className="space-y-3" aria-live="polite">
          <div className="clay h-72 animate-pulse bg-foreground/5" />
        </div>
      ) : loadError ? (
        <div className="clay p-6 text-center text-sm text-foreground/70">
          <p>{loadError}</p>
          <button onClick={onExit} className="mt-3 text-xs font-bold text-[var(--sky-deep)]">
            Go back
          </button>
        </div>
      ) : !q ? (
        session && activeFilters === 0 ? (
          <div className="clay p-8 text-center">
            <p className="text-sm font-semibold text-foreground/80">{EMPTY_SESSION[session]}</p>
            <button onClick={onExit} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white">
              Back
            </button>
          </div>
        ) : weakAttemptId && statusF === "unsolved" && difficulty === "All" && year === "All" ? (
          <div className="clay p-8 text-center">
            <p className="font-semibold text-foreground">You've solved every available PYQ for your weak chapters. Nice work!</p>
            <button onClick={() => setStatusF("all")} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white">
              Review them anyway
            </button>
          </div>
        ) : (
          <div className="clay p-8 text-center">
            <p className="font-semibold text-foreground">No questions match these filters.</p>
            <button
              onClick={() => {
                setDifficulty("All");
                setYear("All");
                setStatusF(defaultStatus);
              }}
              className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white"
            >
              Clear filters
            </button>
          </div>
        )
      ) : (
        <>
          {/* Progress */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-foreground/50">
              <span className="font-semibold text-foreground/70">
                Question {idx + 1} of {questions.length}
                {list && list.total > questions.length && ` (first ${questions.length} of ${list.total})`}
              </span>
              <StatusPill status={result ? (result.isCorrect ? "correct" : result.revealed ? "revealed" : "wrong") : q.status} />
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-[var(--sky-deep)] transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
              />
            </div>
            {guest && (
              <p className="mt-1.5 text-[11px] text-foreground/50">
                Free preview: {GUEST_PYQ_LIMIT} questions without logging in.{" "}
                <Link to="/auth" search={{ tab: "signup" }} className="font-bold text-[var(--sky-deep)] underline-offset-2 hover:underline">
                  Sign up free
                </Link>{" "}
                to practise the full chapter.
              </p>
            )}
          </div>

          <article key={q.id} className="clay p-4 animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none sm:p-6">
            {/* Where this question came from — e.g. "JEE MAINS 2022 29 JUNE SHIFT 2" */}
            <div className="flex items-start justify-between gap-2">
              <p className="inline-flex max-w-full rounded-full bg-[var(--sky-soft)] px-3 py-1 text-[11px] font-bold uppercase leading-snug tracking-wide text-foreground">
                <span className="truncate">{q.source.label}</span>
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => void toggleBookmark()}
                  aria-pressed={q.bookmarked}
                  aria-label={q.bookmarked ? "Remove bookmark" : "Bookmark this question"}
                  className="grid h-9 w-9 place-items-center rounded-full text-foreground/50 hover:bg-foreground/5"
                >
                  <Bookmark className={cn("h-4 w-4", q.bookmarked && "fill-[var(--sky-deep)] text-[var(--sky-deep)]")} aria-hidden />
                </button>
                {!guest && (
                  <button
                    onClick={() => setReporting(true)}
                    aria-label="Report this question"
                    className="grid h-9 w-9 place-items-center rounded-full text-foreground/50 hover:bg-foreground/5"
                  >
                    <Flag className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-foreground/50">
              <DifficultyTag d={q.difficulty} />
              {weakAttemptId ? <span>· {q.chapter}</span> : !topic && q.topic !== "General" && <span>· {q.topic}</span>}
              <span>· {q.type === "mcq" ? "+4 / −1" : "+4 / 0"}</span>
            </div>

            <SmartContent value={q.body} className="mt-4 text-[15px] leading-relaxed text-foreground" />

            {q.type === "mcq" ? (
              <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
                {OPTIONS.map((opt) => {
                  const chosen = result ? result.chosenOption === opt : picked[q.id] === opt;
                  const isCorrect = result?.correctOption === opt;
                  const isWrongChoice = Boolean(result) && chosen && !isCorrect;
                  return (
                    <button
                      key={opt}
                      role="radio"
                      aria-checked={chosen}
                      disabled={Boolean(result) || busy}
                      onClick={() => setPicked((p) => ({ ...p, [q.id]: opt }))}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-colors duration-150",
                        isCorrect
                          ? "border-emerald-500/50 bg-[var(--mint-soft)]/60"
                          : isWrongChoice
                            ? "border-destructive/50 bg-[var(--coral-soft)]/60"
                            : chosen
                              ? "border-[var(--sky-deep)] bg-[var(--sky-soft)]/50"
                              : "border-transparent bg-foreground/[0.04] hover:bg-foreground/[0.07]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                          isCorrect
                            ? "bg-emerald-600 text-white"
                            : isWrongChoice
                              ? "bg-destructive text-white"
                              : chosen
                                ? "bg-[var(--sky-deep)] text-white"
                                : "bg-foreground/10 text-foreground/60",
                        )}
                      >
                        {opt}
                      </span>
                      <div className="min-w-0 flex-1">
                        <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                        {isCorrect && <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Correct answer</p>}
                        {isWrongChoice && <p className="mt-1 text-[11px] font-bold text-destructive">Your answer</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4">
                <label htmlFor={`ans-${q.id}`} className="mb-1.5 block text-xs font-semibold text-foreground/60">
                  Your answer (numerical)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={Boolean(result)}
                    aria-label="Toggle negative sign"
                    onClick={() =>
                      setTyped((t) => {
                        const v = t[q.id] ?? "";
                        return { ...t, [q.id]: v.startsWith("-") ? v.slice(1) : `-${v}` };
                      })
                    }
                    className="clay-chip w-12 shrink-0 rounded-2xl text-lg font-bold text-foreground/70 disabled:opacity-50"
                  >
                    ±
                  </button>
                  <input
                    id={`ans-${q.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={Boolean(result)}
                    value={result ? String(result.chosenValue ?? "") : typed[q.id] ?? ""}
                    onChange={(e) => {
                      // Digits, one dot, optional leading minus — nothing else.
                      const v = e.target.value;
                      if (/^-?\d*\.?\d*$/.test(v)) setTyped((t) => ({ ...t, [q.id]: v }));
                    }}
                    placeholder="e.g. 12 or -3.5"
                    className={cn(
                      "clay-inset min-w-0 flex-1 rounded-2xl border px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-[var(--sky-deep)]",
                      result ? (result.isCorrect ? "border-emerald-500/50" : "border-destructive/50") : "border-transparent",
                    )}
                  />
                </div>
                {result && !result.isCorrect && (
                  <p className="mt-2 text-xs font-semibold text-foreground/60">
                    Correct answer: <span className="text-emerald-700 dark:text-emerald-300">{result.correctAnswer}</span>
                  </p>
                )}
              </div>
            )}

            {/* Verdict + solution */}
            {result && (
              <div className="mt-4 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
                {!result.revealed && (
                  <p
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm font-bold",
                      result.isCorrect ? "bg-[var(--mint-soft)]/60 text-emerald-800 dark:text-emerald-200" : "bg-[var(--coral-soft)]/60 text-destructive",
                    )}
                    role="status"
                  >
                    {result.isCorrect ? "Correct! Nice work." : "Not quite — read the solution below."}
                  </p>
                )}
                {result.corrected && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-200" role="status">
                    Mistake corrected. That one is fixed.
                  </p>
                )}
                {result.streak?.increased && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-foreground">
                    <Flame className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                    {result.streak.current}-day streak!
                  </p>
                )}
                {result.solution && <Solution text={result.solution} />}
              </div>
            )}

            {!result && !revising && (
              <button
                onClick={() => void send(null)}
                disabled={busy}
                className="mt-4 text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                I give up — show the solution
              </button>
            )}
            {actionError && <p className="mt-3 text-xs font-semibold text-destructive">{actionError}</p>}
          </article>

          {/* Thumb-reach controls */}
          <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-2 rounded-full bg-background/80 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              aria-label="Previous question"
              className="clay-chip grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70 disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            {result ? (
              <button onClick={next} className="clay-btn h-11 flex-1 rounded-full px-5 text-sm font-bold text-white">
                {atEnd ? "Finish" : "Next question"}
              </button>
            ) : (
              <button
                onClick={check}
                disabled={!canCheck || busy}
                className="clay-btn inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Check answer
              </button>
            )}
            {!result && (
              <button
                onClick={next}
                aria-label={atEnd ? "Finish without answering" : "Skip question"}
                className="clay-chip grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GuestGate({ answered, correct, onBack }: { answered: number; correct: number; onBack: () => void }) {
  return (
    <div className="clay animate-in fade-in p-6 text-center duration-300 motion-reduce:animate-none sm:p-8" role="status">
      <p className="font-display text-xl font-bold text-foreground sm:text-2xl">
        {answered > 0 ? "Nice start. Keep going with a free account." : "You've used your free questions."}
      </p>
      {answered > 0 && (
        <p className="mt-2 text-sm font-semibold text-foreground/70">
          You got {correct} of {answered} right.
        </p>
      )}
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-foreground/60">
        Create a free account to continue this chapter, practise every NEET PYQ with detailed solutions, and save your progress.
      </p>
      <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2.5">
        <Link to="/auth" search={{ tab: "signup" }} className="clay-btn inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-bold text-white">
          Create free account
        </Link>
        <Link to="/auth" search={{ tab: "signin" }} className="clay-chip inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-bold text-foreground/80">
          I already have an account
        </Link>
        <button onClick={onBack} className="mt-1 text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline">
          Back to chapters
        </button>
      </div>
    </div>
  );
}

function Solution({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl bg-[var(--sky-soft)]/60 px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground/70">
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          Solution
        </span>
        <ChevronDown className={cn("h-4 w-4 text-foreground/50 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-[var(--sky-deep)] pl-3">
          <SmartContent value={text} className="text-sm leading-relaxed text-foreground/80" />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: PyqStatus }) {
  if (status === "new") return null;
  const map: Record<Exclude<PyqStatus, "new">, { label: string; cls: string }> = {
    correct: { label: "Solved", cls: "bg-[var(--mint-soft)]/70 text-emerald-800 dark:text-emerald-200" },
    wrong: { label: "Tried · got wrong", cls: "bg-[var(--coral-soft)]/70 text-destructive" },
    revealed: { label: "Solution viewed", cls: "bg-foreground/10 text-foreground/60" },
  };
  const m = map[status];
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.cls)}>{m.label}</span>;
}

function DifficultyTag({ d }: { d: Difficulty }) {
  const cls = d === "Easy" ? "text-emerald-600 dark:text-emerald-400" : d === "Hard" ? "text-destructive" : "text-amber-600 dark:text-amber-400";
  return <span className={cn("font-bold", cls)}>{d}</span>;
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
      <div className={SCROLL_ROW}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200",
        active ? "clay-btn text-white" : "clay-chip text-foreground/70",
      )}
    >
      {children}
    </button>
  );
}