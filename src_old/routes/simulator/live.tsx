import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { IconClock as Clock, IconX as X, IconTrophy as Trophy, IconCircleCheck as CheckCircle2, IconCircleX as XCircle, IconLogin as LogIn, IconSchool as GraduationCap, IconSparkles as Sparkles } from "@tabler/icons-react";
import { Grid3x3, MinusCircle, Compass } from "lucide-react"; // TODO: no Tabler mapping found yet
import { submitSimulatorLiveAttempt } from "@/server-functions/landing-demo";
import { SubjectBreakdownAccordion, MentorRecommendations } from "@/components/subject-performance";

export const Route = createFileRoute("/simulator/live")({
  component: SimulatorLivePage,
});

// ---------------------------------------------
// Demo test config — no backend auth required, but attempts are now
// recorded (anonymously) via submitSimulatorLiveAttempt.
// ---------------------------------------------
const TOTAL_TIME_SECONDS = 20 * 60; // 20 minutes

type Track = "PCB" | "PCM";
type Subject = "Physics" | "Chemistry" | "Biology" | "Mathematics";
type OptionKey = "A" | "B" | "C" | "D";
type QuestionStatus = "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked";

const TRACK_SUBJECTS: Record<Track, Subject[]> = {
  PCB: ["Physics", "Chemistry", "Biology"],
  PCM: ["Physics", "Chemistry", "Mathematics"],
};

const TRACK_TITLE: Record<Track, string> = {
  PCB: "NEET Track",
  PCM: "JEE Track",
};

type DemoQuestion = {
  id: string;
  subject: Subject;
  questionNo: number;
  body: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
};

// 10 real NEET/JEE-difficulty questions per subject (40 total). Physics
// and Chemistry are shared between both tracks; Biology backs PCB,
// Mathematics backs PCM.
const demoQuestions: DemoQuestion[] = [
  // ---------------- Physics (shared) ----------------
  { id: "p1", subject: "Physics", questionNo: 1, body: "A ball is dropped from height h. The time taken to reach the ground is proportional to:", options: { A: "h", B: "√h", C: "h²", D: "1/h" }, correct: "B" },
  { id: "p2", subject: "Physics", questionNo: 2, body: "The dimensional formula of pressure is:", options: { A: "[MLT⁻²]", B: "[ML⁻¹T⁻²]", C: "[ML²T⁻²]", D: "[ML⁻²T⁻¹]" }, correct: "B" },
  { id: "p3", subject: "Physics", questionNo: 3, body: "In simple harmonic motion, the acceleration is maximum at the:", options: { A: "Mean position", B: "Extreme position", C: "Midway point", D: "It's constant everywhere" }, correct: "B" },
  { id: "p4", subject: "Physics", questionNo: 4, body: "A moving body collides elastically with an identical body at rest. After the collision, the first body's velocity becomes:", options: { A: "Same as before", B: "Double", C: "Zero", D: "Half" }, correct: "C" },
  { id: "p5", subject: "Physics", questionNo: 5, body: "The work done in moving a charge along an equipotential surface is:", options: { A: "Maximum", B: "Negative", C: "Zero", D: "Infinite" }, correct: "C" },
  { id: "p6", subject: "Physics", questionNo: 6, body: "Two capacitors of capacitance C each are connected in series. The equivalent capacitance is:", options: { A: "2C", B: "C", C: "C/2", D: "4C" }, correct: "C" },
  { id: "p7", subject: "Physics", questionNo: 7, body: "The escape velocity from Earth's surface is approximately:", options: { A: "7.9 km/s", B: "3.6 km/s", C: "25 km/s", D: "11.2 km/s" }, correct: "D" },
  { id: "p8", subject: "Physics", questionNo: 8, body: "According to Bohr's model, the radius of the nth orbit of a hydrogen atom is proportional to:", options: { A: "n", B: "1/n", C: "n²", D: "1/n²" }, correct: "C" },
  { id: "p9", subject: "Physics", questionNo: 9, body: "The bending of light around obstacles is called:", options: { A: "Refraction", B: "Dispersion", C: "Polarization", D: "Diffraction" }, correct: "D" },
  { id: "p10", subject: "Physics", questionNo: 10, body: "A transformer works on the principle of:", options: { A: "Self-induction", B: "Mutual induction", C: "Static electricity", D: "Thermionic emission" }, correct: "B" },

  // ---------------- Chemistry (shared) ----------------
  { id: "c1", subject: "Chemistry", questionNo: 1, body: "The IUPAC name of CH₃-CHO is:", options: { A: "Ethanol", B: "Methanal", C: "Ethanal", D: "Propanal" }, correct: "C" },
  { id: "c2", subject: "Chemistry", questionNo: 2, body: "Which of the following is a Lewis acid?", options: { A: "NH₃", B: "BF₃", C: "H₂O", D: "OH⁻" }, correct: "B" },
  { id: "c3", subject: "Chemistry", questionNo: 3, body: "The number of moles in 44 g of CO₂ (molar mass 44 g/mol) is:", options: { A: "0.5 mol", B: "2 mol", C: "4 mol", D: "1 mol" }, correct: "D" },
  { id: "c4", subject: "Chemistry", questionNo: 4, body: "Which of the following is an example of a redox reaction?", options: { A: "NaOH + HCl → NaCl + H₂O", B: "Zn + CuSO₄ → ZnSO₄ + Cu", C: "AgNO₃ + NaCl → AgCl + NaNO₃", D: "None of these" }, correct: "B" },
  { id: "c5", subject: "Chemistry", questionNo: 5, body: "The oxidation state of Mn in KMnO₄ is:", options: { A: "+2", B: "+4", C: "+6", D: "+7" }, correct: "D" },
  { id: "c6", subject: "Chemistry", questionNo: 6, body: "Which of the following is an aromatic compound?", options: { A: "Cyclohexane", B: "Hexane", C: "Benzene", D: "Cyclopropane" }, correct: "C" },
  { id: "c7", subject: "Chemistry", questionNo: 7, body: "The van't Hoff factor for a compound that dissociates completely into 3 ions is:", options: { A: "1", B: "2", C: "3", D: "0" }, correct: "C" },
  { id: "c8", subject: "Chemistry", questionNo: 8, body: "Which quantum number determines the shape of an orbital?", options: { A: "Principal (n)", B: "Azimuthal (l)", C: "Magnetic (m)", D: "Spin (s)" }, correct: "B" },
  { id: "c9", subject: "Chemistry", questionNo: 9, body: "The functional group –COOH is called:", options: { A: "Aldehyde", B: "Ketone", C: "Ester", D: "Carboxylic acid" }, correct: "D" },
  { id: "c10", subject: "Chemistry", questionNo: 10, body: "Which gas is primarily responsible for the greenhouse effect?", options: { A: "Nitrogen", B: "Argon", C: "Carbon dioxide", D: "Helium" }, correct: "C" },

  // ---------------- Biology (PCB track) ----------------
  { id: "b1", subject: "Biology", questionNo: 1, body: "The site of protein synthesis in a cell is the:", options: { A: "Mitochondria", B: "Golgi body", C: "Ribosome", D: "Lysosome" }, correct: "C" },
  { id: "b2", subject: "Biology", questionNo: 2, body: "The functional unit of the kidney is the:", options: { A: "Neuron", B: "Nephridium", C: "Alveolus", D: "Nephron" }, correct: "D" },
  { id: "b3", subject: "Biology", questionNo: 3, body: "Which hormone regulates blood sugar level?", options: { A: "Thyroxine", B: "Insulin", C: "Adrenaline", D: "Estrogen" }, correct: "B" },
  { id: "b4", subject: "Biology", questionNo: 4, body: "Meiosis results in the formation of:", options: { A: "Diploid somatic cells", B: "Triploid cells", C: "Haploid gametes", D: "Tetraploid cells" }, correct: "C" },
  { id: "b5", subject: "Biology", questionNo: 5, body: "The pigment primarily responsible for photosynthesis is:", options: { A: "Hemoglobin", B: "Melanin", C: "Carotene", D: "Chlorophyll" }, correct: "D" },
  { id: "b6", subject: "Biology", questionNo: 6, body: "Which of the following is a vector-borne disease?", options: { A: "Diabetes", B: "Malaria", C: "Asthma", D: "Anemia" }, correct: "B" },
  { id: "b7", subject: "Biology", questionNo: 7, body: "Exchange of gases in the lungs occurs in the:", options: { A: "Bronchi", B: "Trachea", C: "Alveoli", D: "Larynx" }, correct: "C" },
  { id: "b8", subject: "Biology", questionNo: 8, body: "DNA replication is best described as:", options: { A: "Conservative", B: "Dispersive", C: "Random", D: "Semi-conservative" }, correct: "D" },
  { id: "b9", subject: "Biology", questionNo: 9, body: "Which of these is NOT a nitrogenous base found in DNA?", options: { A: "Adenine", B: "Guanine", C: "Uracil", D: "Cytosine" }, correct: "C" },
  { id: "b10", subject: "Biology", questionNo: 10, body: "The process by which plants lose water vapor is called:", options: { A: "Respiration", B: "Photosynthesis", C: "Transpiration", D: "Excretion" }, correct: "C" },

  // ---------------- Mathematics (PCM track) ----------------
  { id: "m1", subject: "Mathematics", questionNo: 1, body: "If f(x) = x² − 4x + 3, the roots of f(x) = 0 are:", options: { A: "1, 3", B: "−1, −3", C: "1, −3", D: "−1, 3" }, correct: "A" },
  { id: "m2", subject: "Mathematics", questionNo: 2, body: "The derivative of sin(2x) with respect to x is:", options: { A: "cos(2x)", B: "2cos(2x)", C: "−2cos(2x)", D: "2sin(2x)" }, correct: "B" },
  { id: "m3", subject: "Mathematics", questionNo: 3, body: "The value of log₁₀(100) is:", options: { A: "1", B: "10", C: "2", D: "100" }, correct: "C" },
  { id: "m4", subject: "Mathematics", questionNo: 4, body: "If a fair die is rolled once, the probability of getting an even number is:", options: { A: "1/6", B: "1/3", C: "1/2", D: "2/3" }, correct: "C" },
  { id: "m5", subject: "Mathematics", questionNo: 5, body: "The sum of the first 10 natural numbers is:", options: { A: "45", B: "50", C: "55", D: "60" }, correct: "C" },
  { id: "m6", subject: "Mathematics", questionNo: 6, body: "The number of ways to arrange all the letters of the word \"MATH\" is:", options: { A: "12", B: "16", C: "20", D: "24" }, correct: "D" },
  { id: "m7", subject: "Mathematics", questionNo: 7, body: "If the slope of a line is 0, the line is:", options: { A: "Vertical", B: "Horizontal", C: "Diagonal", D: "Undefined" }, correct: "B" },
  { id: "m8", subject: "Mathematics", questionNo: 8, body: "The value of ∫₀² x dx is:", options: { A: "1", B: "2", C: "4", D: "8" }, correct: "B" },
  { id: "m9", subject: "Mathematics", questionNo: 9, body: "The determinant of the 3×3 identity matrix is:", options: { A: "0", B: "1", C: "3", D: "9" }, correct: "B" },
  { id: "m10", subject: "Mathematics", questionNo: 10, body: "If sin θ = 1/2, then θ (for 0° ≤ θ ≤ 90°) is:", options: { A: "30°", B: "45°", C: "60°", D: "90°" }, correct: "A" },
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
  const [phase, setPhase] = useState<"select" | "test" | "result">("select");
  const [track, setTrack] = useState<Track | null>(null);

  const [activeSubject, setActiveSubject] = useState<Subject>("Physics");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, QuestionStatus>>({});
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_TIME_SECONDS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [saving, setSaving] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  const SUBJECTS = track ? TRACK_SUBJECTS[track] : [];
  const trackQuestions = demoQuestions.filter((q) => SUBJECTS.includes(q.subject));
  const subjectQuestions = trackQuestions.filter((q) => q.subject === activeSubject);
  const currentQuestion = subjectQuestions[currentIndex];

  const isLastQuestionOverall =
    activeSubject === SUBJECTS[SUBJECTS.length - 1] && currentIndex === subjectQuestions.length - 1;

  function startTrack(t: Track) {
    const subjects = TRACK_SUBJECTS[t];
    const questions = demoQuestions.filter((q) => subjects.includes(q.subject));
    const initialStatuses: Record<string, QuestionStatus> = {};
    questions.forEach((q, i) => {
      initialStatuses[q.id] = i === 0 ? "not-answered" : "not-visited";
    });

    setTrack(t);
    setActiveSubject(subjects[0]);
    setCurrentIndex(0);
    setAnswers({});
    setStatuses(initialStatuses);
    setSecondsLeft(TOTAL_TIME_SECONDS);
    setResult(null);
    submittedRef.current = false;
    startTimeRef.current = Date.now();
    setPhase("test");
  }

  function computeResult(): DemoResult {
    const subjectBreakdown: SubjectResult[] = SUBJECTS.map((subject) => {
      const qs = trackQuestions.filter((q) => q.subject === subject);
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
    const totalMarks = trackQuestions.length * 4;
    const timeTakenMinutes = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000));

    return { score, totalMarks, correctCount, incorrectCount, unansweredCount, timeTakenMinutes, subjectBreakdown };
  }

  async function handleSubmit() {
    if (submittedRef.current || !track) return;
    submittedRef.current = true;
    const r = computeResult();
    setResult(r);
    setPhase("result");

    setSaving(true);
    try {
      await submitSimulatorLiveAttempt({ data: { track, ...r } });
    } catch {
      // Non-blocking — the student still sees their result either way.
    } finally {
      setSaving(false);
    }
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
    const first = trackQuestions.find((q) => q.subject === subject);
    if (first) markVisited(first.id);
  }

  function goTo(index: number) {
    setCurrentIndex(index);
    const q = subjectQuestions[index];
    if (q) markVisited(q.id);
    setPaletteOpen(false);
  }

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

  // ── Screen 1: track selection ────────────────────────────────────────
  if (phase === "select" || !track) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="clay w-full max-w-lg p-6 text-center sm:p-10">
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            Free CBT Demo
          </div>
          <h1 className="font-display mt-4 text-xl font-bold text-foreground sm:text-2xl">
            Which track are you preparing for?
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            20 minutes · 30 questions · Physics &amp; Chemistry are common to both.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => startTrack("PCB")}
              className="clay-btn flex flex-col items-center gap-1 rounded-2xl px-4 py-6 text-center"
            >
              <span className="text-base font-bold">NEET Track</span>
              <span className="text-xs font-normal opacity-80">Physics · Chemistry · Biology</span>
            </button>
            <button
              onClick={() => startTrack("PCM")}
              className="clay-btn flex flex-col items-center gap-1 rounded-2xl px-4 py-6 text-center"
              style={{ background: "var(--sky-soft)", color: "inherit" }}
            >
              <span className="text-base font-bold">JEE Track</span>
              <span className="text-xs font-normal opacity-80">Physics · Chemistry · Mathematics</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return <DemoResultView result={result} track={track} saving={saving} />;
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
            Edurack <span className="text-foreground/40">| {TRACK_TITLE[track]} Demo</span>
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

function DemoResultView({ result, track, saving }: { result: DemoResult; track: Track; saving: boolean }) {
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
            Free CBT Demo Mock Test · {TRACK_TITLE[track]}
          </p>
          <p className="font-display mt-2 text-5xl font-bold text-foreground">
            {result.score} <span className="text-xl text-foreground/40">/ {result.totalMarks}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--sky-deep)]">{percentage}%</p>
          {saving && <p className="mt-1 text-xs text-foreground/40">Saving your result…</p>}

          <div className="mt-6 grid grid-cols-4 gap-3 text-sm">
            <StatBox icon={CheckCircle2} color="text-[var(--mint-soft)]" value={result.correctCount} label="Correct" />
            <StatBox icon={XCircle} color="text-[var(--coral-soft)]" value={result.incorrectCount} label="Incorrect" />
            <StatBox icon={MinusCircle} color="text-foreground/40" value={result.unansweredCount} label="Skipped" />
            <StatBox icon={Clock} color="text-foreground/40" value={result.timeTakenMinutes} label="Minutes" />
          </div>
        </div>

        {/* Subject breakdown — expandable accordion per subject with
            accuracy, correct/incorrect/unattempted, and an estimated
            percentile. Shared with the real test-result/test-analysis
            pages via components/subject-performance.tsx. */}
        <div className="clay mb-6 p-5 sm:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">Subject-wise breakdown</p>
          <SubjectBreakdownAccordion
            subjects={result.subjectBreakdown.map((s) => {
              const totalMarks = (s.correct + s.incorrect + s.unanswered) * 4;
              const percent = totalMarks > 0 ? Math.max(0, Math.round((s.marks / totalMarks) * 100)) : 0;
              return {
                subject: s.subject,
                correct: s.correct,
                incorrect: s.incorrect,
                unanswered: s.unanswered,
                percent,
                marksLabel: `${s.marks} / ${totalMarks} marks`,
              };
            })}
          />
        </div>

        {/* Mentor recommendation — surfaced for the student's weakest
            subject(s), matched against each mentor's Expertise Showcase and
            only shown when the mentor's own score genuinely beats the
            student's. */}
        <MentorRecommendations
          subjects={result.subjectBreakdown.map((s) => {
            const totalMarks = (s.correct + s.incorrect + s.unanswered) * 4;
            const percent = totalMarks > 0 ? Math.max(0, Math.round((s.marks / totalMarks) * 100)) : 0;
            return { subject: s.subject as string, percent };
          })}
        />

        {/* CTA: keep the momentum going */}
        <div className="clay mb-6 overflow-hidden p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              That was just a taste
            </div>
            <h3 className="font-display mt-3 text-xl font-bold text-foreground sm:text-2xl">
              Ready for the full {track === "PCB" ? "NEET" : "JEE"} 2027 CBT experience?
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
  // Accepts an icon component from either @tabler/icons-react or
  // lucide-react — both accept className as an optional prop, which is all
  // this component actually uses. Fixes the type mismatch that showed up
  // whenever a Lucide icon (used when no Tabler equivalent exists, e.g.
  // MinusCircle above) was passed where a single Tabler icon's type was
  // expected, and removes the need for the old "as any" cast.
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
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