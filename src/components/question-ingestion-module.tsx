import { useEffect, useState, type FormEvent } from "react";
import { IconLoader2 as Loader2, IconCircleCheck as CheckCircle2, IconBook2 as BookOpen, IconCalendar as Calendar, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { ListChecks, FileQuestion, Circle, Hash } from "lucide-react"; // TODO: no Tabler mapping found yet
import {
  createQuestion,
  listBundles,
  listTestCoresForBundle,
  listQuestionsForTestSubject,
} from "@/server-functions/admin";
import { ImageInsertField } from "./admin/image-insert-field";

type AdminUser = { getIdToken: () => Promise<string> };

type DifficultyLevel = "Easy" | "Medium" | "Hard";
type OptionKey = "A" | "B" | "C" | "D";
type QuestionType = "mcq" | "integer";

type BundleOption = { id: string; title: string };

// Carries everything the numbering/subject logic needs — not just id/name
// like before, so the subject list and per-subject thresholds always come
// straight from what was actually configured on this test in Test Core,
// rather than from a fixed guess list.
type TestOption = {
  id: string;
  name: string;
  subjects: string[];
  weightage: { subject: string; questionCount: number }[];
};

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ClayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function QuestionIngestionModule({ adminUser }: { adminUser: AdminUser }) {
  const [bundles, setBundles] = useState<BundleOption[] | null>(null);
  const [tests, setTests] = useState<TestOption[] | null>(null);

  const [bundleId, setBundleId] = useState("");
  const [testId, setTestId] = useState("");
  const [subject, setSubject] = useState("");

  // Auto-numbering state — nextNumber is what gets submitted; it's derived,
  // never typed. threshold is this subject's weightage count from Test
  // Core (or null if this test has no weightage configured), shown as the
  // "x / y" progress indicator.
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const [questionType, setQuestionType] = useState<QuestionType>("mcq");

  const [questionBody, setQuestionBody] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctOption, setCorrectOption] = useState<OptionKey>("A");
  const [integerAnswer, setIntegerAnswer] = useState("");

  const [solution, setSolution] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("Medium");
  const [isPYQ, setIsPYQ] = useState(false);
  const [pyqYear, setPyqYear] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedTest = tests?.find((t) => t.id === testId) ?? null;

  // ─── Load bundles once ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const token = await adminUser.getIdToken();
      const { bundles: rows } = await listBundles({ data: { token } });
      setBundles(rows.map((b) => ({ id: b.id, title: b.title })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  // ─── Load tests (with their real subjects + weightage) when bundle changes
  useEffect(() => {
    if (!bundleId) {
      setTests(null);
      setTestId("");
      return;
    }
    (async () => {
      setTests(null);
      setTestId("");
      setSubject("");
      const token = await adminUser.getIdToken();
      const { testCores } = await listTestCoresForBundle({ data: { token, bundleId } });
      setTests(
        testCores.map((t) => ({
          id: t.id,
          name: t.name,
          subjects: t.subjects ?? [],
          weightage: t.weightage ?? [],
        })),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId, adminUser]);

  // Reset subject whenever the test changes — the previous test's subject
  // almost certainly doesn't exist on the new one.
  useEffect(() => {
    setSubject("");
    setNextNumber(null);
    setThreshold(null);
  }, [testId]);

  // ─── Fetch how many questions already exist for this test+subject, and
  // derive the next question number and this subject's threshold from it.
  // Runs every time the subject changes, so switching subjects mid-session
  // always shows that subject's own numbering, not a shared counter.
  useEffect(() => {
    if (!testId || !subject) {
      setNextNumber(null);
      setThreshold(null);
      return;
    }
    (async () => {
      setCountLoading(true);
      try {
        const token = await adminUser.getIdToken();
        const { questions } = await listQuestionsForTestSubject({ data: { token, testId, subject } });
        setNextNumber(questions.length + 1);
        const w = selectedTest?.weightage.find((row) => row.subject === subject);
        setThreshold(w ? w.questionCount : null);
      } finally {
        setCountLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, subject]);

  function resetQuestionFields() {
    setQuestionType("mcq");
    setQuestionBody("");
    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");
    setCorrectOption("A");
    setIntegerAnswer("");
    setSolution("");
    setDifficulty("Medium");
    setIsPYQ(false);
    setPyqYear("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!bundleId) return setError("Select a parent bundle.");
    if (!testId) return setError("Select a test within that bundle.");
    if (!subject) return setError("Select a subject.");
    if (nextNumber === null) return setError("Still working out the question number — try again in a moment.");
    if (!questionBody.trim()) return setError("Enter the question body.");

    if (questionType === "mcq") {
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
        return setError("All four options (A–D) must be filled in.");
      }
    } else {
      if (integerAnswer.trim() === "" || Number.isNaN(Number(integerAnswer))) {
        return setError("Enter a valid numeric answer.");
      }
    }

    if (!solution.trim()) return setError("Enter the step-by-step solution.");
    if (isPYQ && !pyqYear.trim()) return setError("Enter the PYQ year, or uncheck 'Previous Year Question'.");
    if (threshold !== null && nextNumber > threshold) {
      return setError(
        `${subject} already has ${threshold} questions from Test Core's weightage — this would exceed that. Update the weightage in Test Core first if that's intentional.`,
      );
    }

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await createQuestion({
        data: {
          token,
          question: {
            bundleId,
            testId,
            subject,
            questionNo: nextNumber,
            body: questionBody.trim(),
            type: questionType,
            ...(questionType === "mcq"
              ? {
                  options: {
                    A: optionA.trim(),
                    B: optionB.trim(),
                    C: optionC.trim(),
                    D: optionD.trim(),
                  },
                  correctOption,
                }
              : {
                  correctAnswer: Number(integerAnswer),
                }),
            solution: solution.trim(),
            difficulty,
            isPYQ,
            pyqYear: isPYQ ? pyqYear.trim() : undefined,
          },
        },
      });
      setSuccess(true);
      resetQuestionFields();
      // Advance the counter locally for fast serial entry — no need to
      // round-trip the count query again for the very next question in the
      // same subject.
      setNextNumber((n) => (n === null ? null : n + 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this question. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const hasSubjects = (selectedTest?.subjects.length ?? 0) > 0;
  const contextReady = Boolean(bundleId && testId && subject);

  return (
    <div>
      <ModuleHeader
        title="Question Ingestion Pipeline"
        subtitle="Bundle → Test → Subject. Question numbering is automatic, per subject."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Context selectors ──────────────────────────────────────── */}
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Ingestion context
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ClayField label="Parent bundle">
              <select
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                className={inputClass + " appearance-none"}
              >
                <option value="">{bundles === null ? "Loading…" : "Select bundle"}</option>
                {(bundles ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </ClayField>

            <ClayField label="Test">
              <select
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                disabled={!bundleId}
                className={inputClass + " appearance-none disabled:opacity-50"}
              >
                <option value="">
                  {!bundleId ? "Select a bundle first" : tests === null ? "Loading…" : "Select test"}
                </option>
                {(tests ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </ClayField>

            <ClayField label="Subject">
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!testId || !hasSubjects}
                className={inputClass + " appearance-none disabled:opacity-50"}
              >
                <option value="">
                  {!testId ? "Select a test first" : !hasSubjects ? "This test has no subjects" : "Select subject"}
                </option>
                {(selectedTest?.subjects ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </ClayField>
          </div>

          {testId && !hasSubjects && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" />
              This test has no subject tags configured — add them in Test Core before entering questions.
            </p>
          )}
          {(!bundleId || !testId || !subject) && hasSubjects && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground/40">
              <BookOpen className="h-3 w-3" />
              Select a bundle, test, and subject above to enable question entry below.
            </p>
          )}

          {contextReady && (
            <div className="clay-inset mt-4 flex items-center gap-2 rounded-2xl px-4 py-3">
              <Hash className="h-4 w-4 shrink-0 text-foreground/50" />
              {countLoading || nextNumber === null ? (
                <span className="text-sm text-foreground/50">Working out the next question number…</span>
              ) : (
                <span className="text-sm font-semibold text-foreground">
                  Adding question {nextNumber}
                  {threshold !== null ? ` of ${threshold}` : ""} for {subject}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Core question inputs ──────────────────────────────────── */}
        <div className={`clay p-5 sm:p-6 ${!contextReady ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center gap-2">
            <FileQuestion className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Question</h2>
          </div>

          <fieldset disabled={!contextReady || nextNumber === null} className="space-y-4">
            {/* ── Type toggle ────────────────────────────────────────── */}
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Question type
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionType("mcq")}
                  className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                    questionType === "mcq" ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  MCQ
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionType("integer")}
                  className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                    questionType === "integer" ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  Integer / Numerical
                </button>
              </div>
            </div>

            <ClayField label="Question body (text, LaTeX $…$/$$…$$, or diagram)">
              <ImageInsertField value={questionBody} onChange={setQuestionBody} rows={4} className={textareaClass}
                placeholder="e.g. The velocity of a particle is given by $v = u + at$. Find…" />
            </ClayField>

            {/* ── Options block (MCQ) or numeric answer (Integer) ─────── */}
            {questionType === "mcq" ? (
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  Options — tap the marker to flag the correct answer
                </span>
                <div className="space-y-2">
                  {(
                    [
                      { key: "A" as OptionKey, value: optionA, setValue: setOptionA },
                      { key: "B" as OptionKey, value: optionB, setValue: setOptionB },
                      { key: "C" as OptionKey, value: optionC, setValue: setOptionC },
                      { key: "D" as OptionKey, value: optionD, setValue: setOptionD },
                    ] as const
                  ).map((opt) => {
                    const isCorrect = correctOption === opt.key;
                    return (
                      <div key={opt.key} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCorrectOption(opt.key)}
                          aria-label={`Mark option ${opt.key} as correct`}
                          aria-pressed={isCorrect}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                            isCorrect ? "clay-btn text-white" : "clay-btn-ghost text-foreground/50"
                          }`}
                        >
                          {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : opt.key}
                        </button>
                        <ImageInsertField
                          value={opt.value}
                          onChange={opt.setValue}
                          placeholder={`Option ${opt.key}`}
                          className={inputClass}
                          compact
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground/40">
                  <Circle className="h-3 w-3" />
                  Currently marked correct: <span className="font-semibold text-foreground/60">Option {correctOption}</span>
                </p>
              </div>
            ) : (
              <ClayField label="Correct numerical answer">
                <input
                  value={integerAnswer}
                  onChange={(e) => setIntegerAnswer(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 5 or 12.5"
                  className={inputClass}
                />
              </ClayField>
            )}
          </fieldset>
        </div>

        {/* ── Solution & metadata panel ─────────────────────────────── */}
        <div className={`clay p-5 sm:p-6 ${!contextReady ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Solution &amp; metadata
            </h2>
          </div>

          <fieldset disabled={!contextReady || nextNumber === null} className="space-y-4">
            <ClayField label="Step-by-step solution (LaTeX enabled)">
              <ImageInsertField
                value={solution}
                onChange={setSolution}
                rows={5}
                className={textareaClass}
                placeholder="Step 1: … $$v^2 = u^2 + 2as$$ Step 2: …"
              />
            </ClayField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ClayField label="Difficulty index">
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className={inputClass + " appearance-none"}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </ClayField>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  Previous Year Question
                </span>
                <label className="clay-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={isPYQ}
                    onChange={(e) => {
                      setIsPYQ(e.target.checked);
                      if (!e.target.checked) setPyqYear("");
                    }}
                    className="h-4 w-4 accent-[var(--sky-deep)]"
                  />
                  <span className="text-sm text-foreground">Mark as PYQ</span>
                </label>
              </div>
            </div>

            <div
              className={`grid transition-all duration-300 ease-out ${
                isPYQ ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <ClayField label="PYQ year">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
                    <input
                      value={pyqYear}
                      onChange={(e) => setPyqYear(e.target.value)}
                      placeholder="e.g. 2023"
                      inputMode="numeric"
                      className={inputClass + " pl-10"}
                    />
                  </div>
                </ClayField>
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="mt-4 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-4 rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
              Question saved. Numbering advanced automatically for the next one.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !contextReady || nextNumber === null}
            className="clay-btn mt-5 flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save question"}
          </button>
        </div>
      </form>
    </div>
  );
}