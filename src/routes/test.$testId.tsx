import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconLoader2 as Loader2, IconClock as Clock, IconUser as User, IconX as X, IconShieldCheck as ShieldCheck, IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { Grid3x3 } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/server-functions/profile";
import { getTestForTaking, submitTestAttempt } from "@/server-functions/test-engine";
import { SmartContent } from "@/lib/smart-content";

export const Route = createFileRoute("/test/$testId")({
  component: TestEnginePage,
});

type OptionKey = "A" | "B" | "C" | "D";
type QuestionStatus = "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked";
// "loading": auth/profile/test data still being fetched
// "ready": data loaded, showing the pre-test proctoring gate — timer hasn't
//   started yet, waiting on the user's "Start Test" click (needed for the
//   Fullscreen API, which requires a fresh user gesture)
// "active": test in progress, timer running, fullscreen + tab/copy
//   monitoring live
type Phase = "loading" | "ready" | "active";

type Question = {
  id: string;
  subject: string;
  questionNo: number;
  body: string;
  options: Record<OptionKey, string>;
};

type TestMeta = {
  id: string;
  name: string;
  subjects: string[];
  totalQuestions: number;
  timeLimitMinutes: number;
};

// Auto-submit thresholds. Violation N+1 triggers the auto-submit (so
// TAB_SWITCH_LIMIT=5 means the 6th switch/exit ends the test).
const TAB_SWITCH_LIMIT = 5;
const COPY_LIMIT = 10;

// Per-subject accent so the test doesn't read as one flat color — falls
// back to the existing sky accent for any subject name not in this map
// (e.g. CUET domain subjects, which are admin-defined free text).
const SUBJECT_ACCENTS: Record<string, { bg: string; text: string; ring: string }> = {
  Physics: { bg: "bg-indigo-500", text: "text-indigo-600", ring: "ring-indigo-400" },
  Chemistry: { bg: "bg-emerald-500", text: "text-emerald-600", ring: "ring-emerald-400" },
  Biology: { bg: "bg-rose-500", text: "text-rose-600", ring: "ring-rose-400" },
  Mathematics: { bg: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-400" },
};
function subjectAccent(subject: string) {
  return (
    SUBJECT_ACCENTS[subject] ?? {
      bg: "bg-[var(--sky-deep)]",
      text: "text-[var(--sky-deep)]",
      ring: "ring-[var(--sky-deep)]",
    }
  );
}

function requestFullscreenSafe(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  return request ? request() : Promise.reject(new Error("Fullscreen not supported"));
}

function exitFullscreenSafe() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const isFullscreen = document.fullscreenElement ?? (doc as any).webkitFullscreenElement;
  if (!isFullscreen) return;
  (document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc))?.().catch(() => {});
}

function TestEnginePage() {
  const { testId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [candidateName, setCandidateName] = useState("");
  const [test, setTest] = useState<TestMeta | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, QuestionStatus>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Proctoring state ──────────────────────────────────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [copyCount, setCopyCount] = useState(0);
  const [warning, setWarning] = useState<{
    message: string;
    tone: "warn" | "danger";
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [autoSubmitReason, setAutoSubmitReason] = useState<string | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const [{ profile }, data] = await Promise.all([
          getProfile({ data: { token } }),
          getTestForTaking({ data: { token, testId } }),
        ]);
        setCandidateName(profile?.fullName || user.displayName || "Candidate");
        setTest(data.test);
        setAttemptNumber(data.attemptNumber);
        setQuestions(data.questions as Question[]);
        setActiveSubject(data.test.subjects[0] ?? "");
        setSecondsLeft(data.test.timeLimitMinutes * 60);

        const initialStatuses: Record<string, QuestionStatus> = {};
        (data.questions as Question[]).forEach((q, i) => {
          initialStatuses[q.id] = i === 0 ? "not-answered" : "not-visited";
        });
        setStatuses(initialStatuses);
        // Timer/fullscreen deliberately NOT started here — see startTest().
        setPhase("ready");
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this test.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, testId]);

  const subjectQuestions = useMemo(
    () => (questions ?? []).filter((q) => q.subject === activeSubject),
    [questions, activeSubject],
  );
  const currentQuestion = subjectQuestions[currentIndex];

  const isFirstQuestionOverall =
    Boolean(test) && activeSubject === test!.subjects[0] && currentIndex === 0;

  // Whether the current question is the very last one across every
  // subject — i.e. there's genuinely nowhere further to advance to.
  const isLastQuestionOverall =
    Boolean(test) &&
    activeSubject === test!.subjects[test!.subjects.length - 1] &&
    currentIndex === subjectQuestions.length - 1;

  async function handleSubmit() {
    if (!user || !questions || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    exitFullscreenSafe();
    try {
      const token = await user.getIdToken();
      const timeTakenMinutes = Math.round((Date.now() - startTimeRef.current) / 60000);
      const res = await submitTestAttempt({
        data: { token, testId, answers, timeTakenMinutes },
      });
      // Results are shown on their own dedicated page, not inline here.
      navigate({ to: "/test-result/$attemptId", params: { attemptId: res.attemptId } });
    } catch (err) {
      submittedRef.current = false;
      setLoadError("Could not submit your test. Please try again.");
      setSubmitting(false);
    }
  }

  // Countdown timer — only runs once the test is actually active, and
  // auto-submits at zero.
  useEffect(() => {
    if (phase !== "active" || secondsLeft === null || submittedRef.current) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  // ── Proctoring: tab switches, fullscreen exits, copy attempts ────────
  // Client-side only — this raises the bar and leaves an audit trail, it
  // is not a hard guarantee against a determined cheater (devtools, a
  // second device, etc. are still possible). Treat it as deterrence, not
  // lockdown security.
  function showWarning(
    message: string,
    tone: "warn" | "danger",
    action?: { label: string; onClick: () => void },
  ) {
    setWarning({ message, tone, action });
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setWarning(null), 6000);
  }

  function triggerAutoSubmit(reason: string) {
    if (submittedRef.current || autoSubmitReason) return;
    setAutoSubmitReason(reason);
    setTimeout(() => handleSubmit(), 1500);
  }

  function reenterFullscreen() {
    requestFullscreenSafe().catch(() => {});
  }

  function registerViolation(kind: "tab" | "copy" | "fullscreen") {
    if (submittedRef.current) return;

    if (kind === "copy") {
      setCopyCount((prev) => {
        const next = prev + 1;
        if (next > COPY_LIMIT) {
          triggerAutoSubmit(`Copying was flagged ${next} times, past the ${COPY_LIMIT}-time limit.`);
        } else {
          showWarning(`Copy detected (${next}/${COPY_LIMIT}). Repeated copying will auto-submit your test.`, "warn");
        }
        return next;
      });
      return;
    }

    setTabSwitchCount((prev) => {
      const next = prev + 1;
      if (next > TAB_SWITCH_LIMIT) {
        triggerAutoSubmit(
          kind === "fullscreen"
            ? `You exited fullscreen ${next} times, past the ${TAB_SWITCH_LIMIT}-time limit.`
            : `You switched tabs/windows ${next} times, past the ${TAB_SWITCH_LIMIT}-time limit.`,
        );
      } else {
        showWarning(
          kind === "fullscreen"
            ? `Fullscreen exited (${next}/${TAB_SWITCH_LIMIT}). Repeated exits will auto-submit your test.`
            : `Tab switch detected (${next}/${TAB_SWITCH_LIMIT}). Repeated switching will auto-submit your test.`,
          "warn",
          kind === "fullscreen" ? { label: "Re-enter Fullscreen", onClick: reenterFullscreen } : undefined,
        );
      }
      return next;
    });
  }

  useEffect(() => {
    if (phase !== "active") return;

    function handleVisibility() {
      if (document.hidden) registerViolation("tab");
    }
    function handleCopy() {
      registerViolation("copy");
    }
    function handleFullscreenChange() {
      const isFullscreen = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
      if (!isFullscreen) registerViolation("fullscreen");
    }

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, []);

  function startTest() {
    startTimeRef.current = Date.now();
    requestFullscreenSafe()
      .catch(() => {
        // Fullscreen isn't supported/allowed on this device/browser — still
        // start the test rather than blocking the candidate entirely.
        // Tab-switch and copy detection work regardless of fullscreen.
      })
      .finally(() => setPhase("active"));
  }

  function markVisited(id: string) {
    setStatuses((prev) => (prev[id] === "not-visited" ? { ...prev, [id]: "not-answered" } : prev));
  }

  function selectSubject(subject: string) {
    setActiveSubject(subject);
    setCurrentIndex(0);
    const first = (questions ?? []).find((q) => q.subject === subject);
    if (first) markVisited(first.id);
  }

  function goTo(index: number) {
    setCurrentIndex(index);
    const q = subjectQuestions[index];
    if (q) markVisited(q.id);
    setPaletteOpen(false);
  }

  // Moves to the next question within the current subject, or — if
  // already on the last question of the current subject — rolls over
  // into the first question of the next subject in test.subjects. Only a
  // no-op when there's truly nothing left (last question of the last
  // subject), matching isLastQuestionOverall above.
  function advance() {
    if (!test) return;
    if (currentIndex < subjectQuestions.length - 1) {
      goTo(currentIndex + 1);
      return;
    }
    const subjectIndex = test.subjects.indexOf(activeSubject);
    const nextSubject = test.subjects[subjectIndex + 1];
    if (nextSubject) selectSubject(nextSubject);
  }

  // Mirrors advance() in reverse: steps back within the current subject,
  // or — if already on the first question of the current subject — rolls
  // back into the LAST question of the previous subject. Only a no-op when
  // there's truly nowhere further back (first question of the first
  // subject), matching isFirstQuestionOverall above.
  function goBack() {
    if (currentIndex > 0) {
      goTo(currentIndex - 1);
      return;
    }
    if (!test || !questions) return;
    const subjectIndex = test.subjects.indexOf(activeSubject);
    const prevSubject = test.subjects[subjectIndex - 1];
    if (!prevSubject) return;
    const prevQuestions = questions.filter((q) => q.subject === prevSubject);
    const lastIndex = Math.max(0, prevQuestions.length - 1);
    setActiveSubject(prevSubject);
    setCurrentIndex(lastIndex);
    const last = prevQuestions[lastIndex];
    if (last) markVisited(last.id);
    setPaletteOpen(false);
  }

  function selectOption(option: OptionKey) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option }));
  }

  function saveAndNext() {
    if (!currentQuestion) return;
    const hasAnswer = Boolean(answers[currentQuestion.id]);
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: hasAnswer ? "answered" : "not-answered" }));
    advance();
  }

  function saveAndMark() {
    if (!currentQuestion) return;
    const hasAnswer = Boolean(answers[currentQuestion.id]);
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: hasAnswer ? "answered-marked" : "marked" }));
    advance();
  }

  function clearResponse() {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: undefined }));
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: "not-answered" }));
  }

  if (loading || !user || (test === null && !loadError)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="clay max-w-md p-8 text-center">
          <p className="font-display text-lg font-bold text-foreground">Can't open this test</p>
          <p className="mt-2 text-sm text-foreground/60">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!test || !questions) return null;

  // ── Pre-test proctoring gate ──────────────────────────────────────────
  if (phase === "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="clay w-full max-w-lg p-6 text-center sm:p-8">
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-violet-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            AI-Monitored Test
          </div>
          <h1 className="font-display mt-4 text-xl font-bold text-foreground sm:text-2xl">{test.name}</h1>
          <p className="mt-2 text-sm text-foreground/60">
            {test.totalQuestions} questions · {test.timeLimitMinutes} minutes · {test.subjects.join(" · ")}
          </p>

          <div className="clay-inset mt-6 rounded-2xl p-4 text-left text-xs text-foreground/70">
            <p className="mb-2 font-bold uppercase tracking-wide text-foreground/50">Before you begin</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>This test runs in fullscreen and is monitored for tab switches and copying.</li>
              <li>
                Switching tabs or exiting fullscreen more than {TAB_SWITCH_LIMIT} times will auto-submit your test.
              </li>
              <li>Copying text more than {COPY_LIMIT} times will auto-submit your test.</li>
              <li>Once submitted — manually or automatically — this attempt can't be resumed.</li>
            </ul>
          </div>

          <button
            onClick={startTest}
            className="clay-btn mt-6 w-full rounded-full px-6 py-3 text-sm font-bold uppercase tracking-wide"
          >
            Start Test in Fullscreen
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor((secondsLeft ?? 0) / 60);
  const seconds = (secondsLeft ?? 0) % 60;
  const timePercent = test.timeLimitMinutes > 0 ? ((secondsLeft ?? 0) / (test.timeLimitMinutes * 60)) * 100 : 100;
  const timerTone = timePercent > 50 ? "bg-emerald-500" : timePercent > 20 ? "bg-amber-500" : "bg-rose-600 animate-pulse";

  const counts = {
    notVisited: Object.values(statuses).filter((s) => s === "not-visited").length,
    notAnswered: Object.values(statuses).filter((s) => s === "not-answered").length,
    answered: Object.values(statuses).filter((s) => s === "answered").length,
    marked: Object.values(statuses).filter((s) => s === "marked" || s === "answered-marked").length,
  };

  const currentAccent = subjectAccent(activeSubject);

  const PalettePanel = (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <LegendItem color="bg-foreground/20" label="Not Visited" value={counts.notVisited} />
        <LegendItem color="bg-[var(--coral-soft)]" label="Not Answered" value={counts.notAnswered} />
        <LegendItem color="bg-[var(--mint-soft)]" label="Answered" value={counts.answered} />
        <LegendItem color="bg-[var(--sky-deep)]" label="Marked" value={counts.marked} />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground/50">
        {activeSubject} — Q1–{subjectQuestions.length}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {subjectQuestions.map((q, i) => {
          const status = statuses[q.id] ?? "not-visited";
          const isCurrent = i === currentIndex;
          const statusClass =
            status === "answered"
              ? "bg-[var(--mint-soft)] text-foreground"
              : status === "not-answered"
                ? "bg-[var(--coral-soft)] text-foreground"
                : status === "marked" || status === "answered-marked"
                  ? "bg-[var(--sky-deep)] text-white"
                  : "bg-foreground/10 text-foreground/60";
          return (
            <button
              key={q.id}
              onClick={() => goTo(i)}
              className={`h-9 w-9 rounded-xl text-xs font-bold transition-all ${statusClass} ${
                isCurrent ? `ring-2 ${currentAccent.ring} ring-offset-2 ring-offset-background` : ""
              }`}
            >
              {String(q.questionNo).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Violation toast */}
      {warning && (
        <div
          className={`fixed left-1/2 top-4 z-50 w-[92%] max-w-md -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            warning.tone === "danger" ? "bg-rose-600" : "bg-amber-500"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{warning.message}</p>
              {warning.action && (
                <button
                  onClick={warning.action.onClick}
                  className="mt-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-white/30"
                >
                  {warning.action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-submit overlay */}
      {autoSubmitReason && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="clay max-w-sm p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-500" />
            <p className="font-display text-base font-bold text-foreground">Test auto-submitted</p>
            <p className="mt-2 text-sm text-foreground/60">{autoSubmitReason}</p>
            <p className="mt-3 text-xs text-foreground/40">Submitting your answers…</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="mx-auto max-w-6xl px-3 pt-3 sm:px-4">
        <div className="clay flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold tracking-tight text-foreground">
              Edurack <span className="text-foreground/40">| CBT Portal</span>
            </p>
            <p className="text-xs text-foreground/50">Excellence in Assessment</p>
          </div>
          <div className="clay-inset flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5 sm:flex-nowrap">
            <User className="h-4 w-4 shrink-0 text-foreground/40" />
            <div className="min-w-0 text-xs">
              <p className="truncate font-semibold text-foreground">{candidateName}</p>
              <p className="truncate text-foreground/50">
                {test.name}
                {attemptNumber && attemptNumber > 1 && (
                  <span className="ml-1.5 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                    Attempt {attemptNumber}
                  </span>
                )}
              </p>
            </div>
            <div
              className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-white transition-colors ${timerTone}`}
            >
              <Clock className="h-3.5 w-3.5" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </div>
        </div>

        {/* Proctoring status — always visible while the test is active */}
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground/50 sm:justify-start">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          AI-monitored session · tab/fullscreen {tabSwitchCount}/{TAB_SWITCH_LIMIT} · copies {copyCount}/{COPY_LIMIT}
        </div>
      </header>

      {/* Subject tabs — horizontally scrollable on small screens instead of
          wrapping, so the row stays compact on narrow phones. */}
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
          {test.subjects.map((s) => {
            const accent = subjectAccent(s);
            const isActive = activeSubject === s;
            return (
              <button
                key={s}
                onClick={() => selectSubject(s)}
                className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
                  isActive ? `${accent.bg} text-white shadow-md` : "clay-chip text-foreground/70"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-3 pb-6 pt-3 sm:px-4 lg:grid-cols-[1fr_320px]">
        {/* Question panel */}
        <div className="clay p-5 sm:p-6">
          {currentQuestion ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-foreground">
                  Question {currentQuestion.questionNo}:
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${currentAccent.text}`}
                >
                  {currentQuestion.subject}
                </span>
              </div>

              <SmartContent value={currentQuestion.body} className="mb-5 text-sm text-foreground" />

              <div className="space-y-2.5">
                {(["A", "B", "C", "D"] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`clay-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition ${
                      answers[currentQuestion.id] === opt ? `ring-2 ${currentAccent.ring}` : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${currentQuestion.id}`}
                      checked={answers[currentQuestion.id] === opt}
                      onChange={() => selectOption(opt)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="text-sm font-semibold text-foreground/50">({opt})</span>
                    <SmartContent value={currentQuestion.options[opt]} className="text-sm text-foreground" />
                  </label>
                ))}
              </div>

              {/* Primary actions — 2-up grid on mobile so nothing overflows
                  or wraps awkwardly on narrow phones; single row from sm up. */}
              <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  onClick={saveAndNext}
                  className="clay-btn rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide"
                >
                  Save &amp; Next
                </button>
                <button
                  onClick={saveAndMark}
                  className="clay-btn rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide"
                  style={{ background: "var(--sky-soft)", color: "inherit" }}
                >
                  Save &amp; Mark for Review
                </button>
                <button
                  onClick={clearResponse}
                  className="clay-btn-ghost col-span-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide sm:col-span-1"
                >
                  Clear Response
                </button>
              </div>

              {/* Navigation — stacks Submit onto its own full-width row on
                  small screens instead of squeezing it into the same line. */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={isFirstQuestionOverall}
                    onClick={goBack}
                    className="clay-btn-ghost rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    &lt;&lt; Back
                  </button>
                  <button
                    disabled={isLastQuestionOverall}
                    onClick={advance}
                    className="clay-btn-ghost rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    Next &gt;&gt;
                  </button>
                  <button
                    onClick={() => setPaletteOpen(true)}
                    className="clay-btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold lg:hidden"
                  >
                    <Grid3x3 className="h-3.5 w-3.5" />
                    Questions
                  </button>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="clay-btn w-full rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-70 sm:w-auto"
                >
                  {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Submit"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground/60">No questions in this subject.</p>
          )}
        </div>

        {/* Palette panel — fixed sidebar on desktop */}
        <div className="clay hidden h-fit p-5 lg:block">{PalettePanel}</div>
      </div>

      {/* Palette — off-canvas drawer on small screens, instead of stacking
          at the bottom of the page. */}
      {paletteOpen && (
        <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPaletteOpen(false)} />
          <div className="clay relative h-full w-[85%] max-w-sm overflow-y-auto rounded-l-3xl rounded-r-none p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Question Palette</p>
              <button onClick={() => setPaletteOpen(false)} className="text-foreground/40 hover:text-foreground/70">
                <X className="h-5 w-5" />
              </button>
            </div>
            {PalettePanel}
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-foreground ${color}`}>
        {value}
      </span>
      <span className="text-foreground/60">{label}</span>
    </div>
  );
}