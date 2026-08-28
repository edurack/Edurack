import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Clock, User, Grid3x3, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/server-functions/profile";
import { getTestForTaking, submitTestAttempt } from "@/server-functions/test-engine";
import { SmartContent } from "@/lib/smart-content";

export const Route = createFileRoute("/test/$testId")({
  component: TestEnginePage,
});

type OptionKey = "A" | "B" | "C" | "D";
type QuestionStatus = "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked";

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

function TestEnginePage() {
  const { testId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [candidateName, setCandidateName] = useState("");
  const [test, setTest] = useState<TestMeta | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSubject, setActiveSubject] = useState<string>("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, QuestionStatus>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
        startTimeRef.current = Date.now();
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

  // Countdown timer — auto-submits at zero.
  useEffect(() => {
    if (secondsLeft === null || submittedRef.current) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

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

  const minutes = Math.floor((secondsLeft ?? 0) / 60);
  const seconds = (secondsLeft ?? 0) % 60;

  const counts = {
    notVisited: Object.values(statuses).filter((s) => s === "not-visited").length,
    notAnswered: Object.values(statuses).filter((s) => s === "not-answered").length,
    answered: Object.values(statuses).filter((s) => s === "answered").length,
    marked: Object.values(statuses).filter((s) => s === "marked" || s === "answered-marked").length,
  };

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
                isCurrent ? "ring-2 ring-[var(--sky-deep)] ring-offset-2 ring-offset-background" : ""
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
      {/* Top bar */}
      <header className="clay mx-3 mt-3 flex flex-col gap-3 p-4 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-bold tracking-tight text-foreground">
            Edurack <span className="text-foreground/40">| CBT Portal</span>
          </p>
          <p className="text-xs text-foreground/50">Excellence in Assessment</p>
        </div>
        <div className="clay-inset flex items-center gap-4 rounded-2xl px-4 py-2.5">
          <User className="h-4 w-4 text-foreground/40" />
          <div className="text-xs">
            <p className="font-semibold text-foreground">{candidateName}</p>
            <p className="text-foreground/50">
              {test.name}
              {attemptNumber && attemptNumber > 1 && (
                <span className="ml-1.5 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                  Attempt {attemptNumber}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--sky-soft)] px-3 py-1.5 text-sm font-bold text-foreground">
            <Clock className="h-3.5 w-3.5" />
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        </div>
      </header>

      {/* Subject tabs */}
      <div className="mx-3 mt-3 flex flex-wrap gap-2 sm:mx-4">
        {test.subjects.map((s) => (
          <button
            key={s}
            onClick={() => selectSubject(s)}
            className={`rounded-2xl px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
              activeSubject === s ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mx-3 mt-3 grid grid-cols-1 gap-4 pb-6 sm:mx-4 lg:grid-cols-[1fr_320px]">
        {/* Question panel */}
        <div className="clay p-5 sm:p-6">
          {currentQuestion ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-foreground">
                  Question {currentQuestion.questionNo}:
                </h2>
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  {currentQuestion.subject}
                </span>
              </div>

              <SmartContent value={currentQuestion.body} className="mb-5 text-sm text-foreground" />

              <div className="space-y-2.5">
                {(["A", "B", "C", "D"] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`clay-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition ${
                      answers[currentQuestion.id] === opt ? "ring-2 ring-[var(--sky-deep)]" : ""
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

              <div className="mt-6 flex flex-wrap gap-2">
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
                  className="clay-btn-ghost rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide"
                >
                  Clear Response
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    disabled={currentIndex === 0}
                    onClick={() => goTo(currentIndex - 1)}
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
                  className="clay-btn rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-70"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
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