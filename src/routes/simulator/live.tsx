import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Grid3x3,
  X,
  Trophy,
  CheckCircle2,
  XCircle,
  MinusCircle,
  LogIn,
  Compass,
  GraduationCap,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/simulator/live")({
  component: SimulatorLivePage,
});

// ---------------------------------------------
// Demo test config — no backend, no auth required.
// ---------------------------------------------
const TOTAL_TIME_SECONDS = 20 * 60; // 20 minutes
const SUBJECTS = ["Physics", "Chemistry", "Biology"] as const;

type OptionKey = "A" | "B" | "C" | "D";
type Subject = (typeof SUBJECTS)[number];
type QuestionStatus = "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked";

type DemoQuestion = {
  id: string;
  subject: Subject;
  questionNo: number;
  body: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
};

// 10 easy, dummy questions per subject (30 total).
const demoQuestions: DemoQuestion[] = [
  // ---------------- Physics ----------------
  { id: "p1", subject: "Physics", questionNo: 1, body: "What is the SI unit of force?", options: { A: "Newton", B: "Joule", C: "Watt", D: "Pascal" }, correct: "A" },
  { id: "p2", subject: "Physics", questionNo: 2, body: "Speed is defined as distance divided by:", options: { A: "Time", B: "Mass", C: "Force", D: "Area" }, correct: "A" },
  { id: "p3", subject: "Physics", questionNo: 3, body: "The SI unit of electric current is:", options: { A: "Ampere", B: "Volt", C: "Ohm", D: "Watt" }, correct: "A" },
  { id: "p4", subject: "Physics", questionNo: 4, body: "Acceleration due to gravity on Earth is approximately:", options: { A: "9.8 m/s²", B: "3.8 m/s²", C: "15 m/s²", D: "1 m/s²" }, correct: "A" },
  { id: "p5", subject: "Physics", questionNo: 5, body: "\"Every action has an equal and opposite reaction\" is:", options: { A: "Newton's Third Law", B: "Newton's First Law", C: "Ohm's Law", D: "Boyle's Law" }, correct: "A" },
  { id: "p6", subject: "Physics", questionNo: 6, body: "The SI unit of power is:", options: { A: "Watt", B: "Joule", C: "Newton", D: "Pascal" }, correct: "A" },
  { id: "p7", subject: "Physics", questionNo: 7, body: "Light travels fastest through:", options: { A: "Vacuum", B: "Water", C: "Glass", D: "Air" }, correct: "A" },
  { id: "p8", subject: "Physics", questionNo: 8, body: "The SI unit of energy is:", options: { A: "Joule", B: "Newton", C: "Watt", D: "Volt" }, correct: "A" },
  { id: "p9", subject: "Physics", questionNo: 9, body: "Sound cannot travel through:", options: { A: "Vacuum", B: "Air", C: "Water", D: "Solid" }, correct: "A" },
  { id: "p10", subject: "Physics", questionNo: 10, body: "The center of an atom is called the:", options: { A: "Nucleus", B: "Electron", C: "Proton", D: "Neutron" }, correct: "A" },

  // ---------------- Chemistry ----------------
  { id: "c1", subject: "Chemistry", questionNo: 1, body: "The chemical symbol for Gold is:", options: { A: "Au", B: "Ag", C: "Fe", D: "Pb" }, correct: "A" },
  { id: "c2", subject: "Chemistry", questionNo: 2, body: "The chemical formula of water is:", options: { A: "H2O", B: "CO2", C: "NaCl", D: "O2" }, correct: "A" },
  { id: "c3", subject: "Chemistry", questionNo: 3, body: "Plants absorb which gas for photosynthesis?", options: { A: "Carbon dioxide", B: "Oxygen", C: "Nitrogen", D: "Hydrogen" }, correct: "A" },
  { id: "c4", subject: "Chemistry", questionNo: 4, body: "Atomic number represents the number of:", options: { A: "Protons", B: "Neutrons", C: "Atomic mass units", D: "Isotopes" }, correct: "A" },
  { id: "c5", subject: "Chemistry", questionNo: 5, body: "The pH of pure water is:", options: { A: "7", B: "0", C: "14", D: "1" }, correct: "A" },
  { id: "c6", subject: "Chemistry", questionNo: 6, body: "Common salt is chemically known as:", options: { A: "Sodium chloride", B: "Sodium carbonate", C: "Calcium chloride", D: "Potassium chloride" }, correct: "A" },
  { id: "c7", subject: "Chemistry", questionNo: 7, body: "Which element has the symbol 'O'?", options: { A: "Oxygen", B: "Osmium", C: "Gold", D: "Iron" }, correct: "A" },
  { id: "c8", subject: "Chemistry", questionNo: 8, body: "Rust forms when iron reacts with:", options: { A: "Oxygen and moisture", B: "Nitrogen", C: "Hydrogen", D: "Carbon dioxide" }, correct: "A" },
  { id: "c9", subject: "Chemistry", questionNo: 9, body: "The most abundant gas in Earth's atmosphere is:", options: { A: "Nitrogen", B: "Oxygen", C: "Carbon dioxide", D: "Hydrogen" }, correct: "A" },
  { id: "c10", subject: "Chemistry", questionNo: 10, body: "Which of these is an alkali metal?", options: { A: "Sodium", B: "Iron", C: "Copper", D: "Zinc" }, correct: "A" },

  // ---------------- Biology ----------------
  { id: "b1", subject: "Biology", questionNo: 1, body: "The powerhouse of the cell is the:", options: { A: "Mitochondria", B: "Nucleus", C: "Ribosome", D: "Golgi body" }, correct: "A" },
  { id: "b2", subject: "Biology", questionNo: 2, body: "Humans have how many chromosomes?", options: { A: "46", B: "44", C: "48", D: "23" }, correct: "A" },
  { id: "b3", subject: "Biology", questionNo: 3, body: "Which organ pumps blood in the human body?", options: { A: "Heart", B: "Liver", C: "Kidney", D: "Lungs" }, correct: "A" },
  { id: "b4", subject: "Biology", questionNo: 4, body: "Photosynthesis occurs mainly in the:", options: { A: "Leaves", B: "Roots", C: "Stem", D: "Flowers" }, correct: "A" },
  { id: "b5", subject: "Biology", questionNo: 5, body: "DNA stands for:", options: { A: "Deoxyribonucleic acid", B: "Ribonucleic acid", C: "Deoxyribose acid", D: "Dinucleic acid" }, correct: "A" },
  { id: "b6", subject: "Biology", questionNo: 6, body: "Which blood cells fight infection?", options: { A: "White blood cells", B: "Red blood cells", C: "Platelets", D: "Plasma" }, correct: "A" },
  { id: "b7", subject: "Biology", questionNo: 7, body: "The basic unit of life is the:", options: { A: "Cell", B: "Tissue", C: "Organ", D: "Organism" }, correct: "A" },
  { id: "b8", subject: "Biology", questionNo: 8, body: "Which organ filters blood in humans?", options: { A: "Kidney", B: "Liver", C: "Heart", D: "Lungs" }, correct: "A" },
  { id: "b9", subject: "Biology", questionNo: 9, body: "Plants prepare their food through:", options: { A: "Photosynthesis", B: "Respiration", C: "Digestion", D: "Excretion" }, correct: "A" },
  { id: "b10", subject: "Biology", questionNo: 10, body: "The study of living organisms is called:", options: { A: "Biology", B: "Geology", C: "Physics", D: "Chemistry" }, correct: "A" },
];

type SubjectResult = { subject: Subject; correct: number; incorrect: number; unanswered: number; marks: number };
type DemoResult = {
  score: number;
  totalMarks: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenMinutes: number;
  subjectBreakdown: SubjectResult[];
};

function SimulatorLivePage() {
  const [phase, setPhase] = useState<"test" | "result">("test");

  const [activeSubject, setActiveSubject] = useState<Subject>(SUBJECTS[0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, QuestionStatus>>(() => {
    const initial: Record<string, QuestionStatus> = {};
    demoQuestions.forEach((q, i) => {
      initial[q.id] = i === 0 ? "not-answered" : "not-visited";
    });
    return initial;
  });
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_TIME_SECONDS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  const subjectQuestions = demoQuestions.filter((q) => q.subject === activeSubject);
  const currentQuestion = subjectQuestions[currentIndex];

  // Whether the current question is the very last one across every
  // subject — i.e. there's genuinely nowhere further to advance to.
  const isLastQuestionOverall =
    activeSubject === SUBJECTS[SUBJECTS.length - 1] && currentIndex === subjectQuestions.length - 1;

  function computeResult(): DemoResult {
    const subjectBreakdown: SubjectResult[] = SUBJECTS.map((subject) => {
      const qs = demoQuestions.filter((q) => q.subject === subject);
      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;
      qs.forEach((q) => {
        const ans = answers[q.id];
        if (!ans) unanswered += 1;
        else if (ans === q.correct) correct += 1;
        else incorrect += 1;
      });
      const marks = correct * 4 - incorrect * 1;
      return { subject, correct, incorrect, unanswered, marks };
    });

    const correctCount = subjectBreakdown.reduce((s, b) => s + b.correct, 0);
    const incorrectCount = subjectBreakdown.reduce((s, b) => s + b.incorrect, 0);
    const unansweredCount = subjectBreakdown.reduce((s, b) => s + b.unanswered, 0);
    const score = subjectBreakdown.reduce((s, b) => s + b.marks, 0);
    const totalMarks = demoQuestions.length * 4;
    const timeTakenMinutes = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000));

    return { score, totalMarks, correctCount, incorrectCount, unansweredCount, timeTakenMinutes, subjectBreakdown };
  }

  function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setResult(computeResult());
    setPhase("result");
  }

  // Countdown timer — auto-submits at zero.
  useEffect(() => {
    if (phase !== "test" || submittedRef.current) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  function markVisited(id: string) {
    setStatuses((prev) => (prev[id] === "not-visited" ? { ...prev, [id]: "not-answered" } : prev));
  }

  function selectSubject(subject: Subject) {
    setActiveSubject(subject);
    setCurrentIndex(0);
    const first = demoQuestions.find((q) => q.subject === subject);
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
  // into the first question of the next subject in SUBJECTS. Only a
  // no-op when there's truly nothing left (last question of the last
  // subject), matching isLastQuestionOverall above.
  function advance() {
    if (currentIndex < subjectQuestions.length - 1) {
      goTo(currentIndex + 1);
      return;
    }
    const subjectIndex = SUBJECTS.indexOf(activeSubject);
    const nextSubject = SUBJECTS[subjectIndex + 1];
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

  if (phase === "result" && result) {
    return <DemoResultView result={result} />;
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

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
      <header className="clay mx-3 mt-3 flex flex-col gap-3 p-4 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-bold tracking-tight text-foreground">
            Edurack <span className="text-foreground/40">| Free CBT Demo</span>
          </p>
          <p className="text-xs text-foreground/50">No login needed — 20 min · 30 questions</p>
        </div>
        <div className="clay-inset flex items-center gap-4 rounded-2xl px-4 py-2.5">
          <div className="text-xs">
            <p className="font-semibold text-foreground">Guest Candidate</p>
            <p className="text-foreground/50">Free Demo Mock Test</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--sky-soft)] px-3 py-1.5 text-sm font-bold text-foreground">
            <Clock className="h-3.5 w-3.5" />
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        </div>
      </header>

      <div className="mx-3 mt-3 flex flex-wrap gap-2 sm:mx-4">
        {SUBJECTS.map((s) => (
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

              <p className="mb-5 text-sm text-foreground">{currentQuestion.body}</p>

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
                    <span className="text-sm text-foreground">{currentQuestion.options[opt]}</span>
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
                  className="clay-btn rounded-full px-6 py-2.5 text-sm font-bold"
                >
                  Submit
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground/60">No questions in this subject.</p>
          )}
        </div>

        <div className="clay hidden h-fit p-5 lg:block">{PalettePanel}</div>
      </div>

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

function DemoResultView({ result }: { result: DemoResult }) {
  const percentage = result.totalMarks > 0 ? Math.round((result.score / result.totalMarks) * 100) : 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Score card */}
        <div className="clay mb-6 p-6 text-center sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Free CBT Demo Mock Test
          </p>
          <p className="font-display mt-2 text-5xl font-bold text-foreground">
            {result.score} <span className="text-xl text-foreground/40">/ {result.totalMarks}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--sky-deep)]">{percentage}%</p>

          <div className="mt-6 grid grid-cols-4 gap-3 text-sm">
            <StatBox icon={CheckCircle2} color="text-[var(--mint-soft)]" value={result.correctCount} label="Correct" />
            <StatBox icon={XCircle} color="text-[var(--coral-soft)]" value={result.incorrectCount} label="Incorrect" />
            <StatBox icon={MinusCircle} color="text-foreground/40" value={result.unansweredCount} label="Skipped" />
            <StatBox icon={Clock} color="text-foreground/40" value={result.timeTakenMinutes} label="Minutes" />
          </div>
        </div>

        {/* Subject breakdown */}
        <div className="clay mb-6 p-5 sm:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">Subject-wise breakdown</p>
          <div className="space-y-3">
            {result.subjectBreakdown.map((s) => {
              const subjectTotal = (s.correct + s.incorrect + s.unanswered) * 4;
              const subjectPct = subjectTotal > 0 ? Math.max(0, Math.round((s.marks / subjectTotal) * 100)) : 0;
              return (
                <div key={s.subject}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">{s.subject}</span>
                    <span className="text-foreground/60">
                      {s.marks} marks · {s.correct}✓ {s.incorrect}✗ {s.unanswered}–
                    </span>
                  </div>
                  <div className="clay-inset h-2.5 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-[var(--sky-deep)] transition-all"
                      style={{ width: `${subjectPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA: keep the momentum going */}
        <div className="clay mb-6 overflow-hidden p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              That was just a taste
            </div>
            <h3 className="font-display mt-3 text-xl font-bold text-foreground sm:text-2xl">
              Ready for the full NEET 2027 CBT experience?
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-foreground/60">
              Create a free account to unlock full-length mock tests, live leaderboards, detailed
              analytics — and mentorship from AIIMS &amp; IIT rankers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              to="/auth"
              className="clay-btn flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center text-sm font-bold"
            >
              <LogIn className="h-5 w-5" />
              Login / Sign Up
            </Link>
            <Link
              to="/auth"
              className="clay-btn-ghost flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center text-sm font-bold"
            >
              <Compass className="h-5 w-5" />
              See More Tests
            </Link>
            <Link
              to="/"
              hash="mentors"
              className="clay-btn-ghost flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center text-sm font-bold"
            >
              <GraduationCap className="h-5 w-5" />
              Get AIIMS/IIT Mentorship
            </Link>
          </div>
        </div>

        <Link
          to="/"
          className="clay-btn-ghost block w-full rounded-full px-6 py-3 text-center text-sm font-semibold"
        >
          Back to Home
        </Link>
      </main>
    </div>
  );
}

function StatBox({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof CheckCircle2;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <div className="clay-inset rounded-2xl px-3 py-3">
      <Icon className={`mx-auto mb-1 h-4 w-4 ${color}`} />
      <p className="font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-foreground/50">{label}</p>
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