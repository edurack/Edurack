import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  ListChecks,
  FileQuestion,
  CheckCircle2,
  Circle,
  BookOpen,
  Calendar,
} from "lucide-react";
import { createQuestion, listBundles, listTestCoresForBundle } from "@/server-functions/admin";

type AdminUser = { getIdToken: () => Promise<string> };

type DifficultyLevel = "Easy" | "Medium" | "Hard";
type OptionKey = "A" | "B" | "C" | "D";

type BundleOption = { id: string; title: string };
type TestOption = { id: string; name: string };

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

  const [questionNo, setQuestionNo] = useState("");
  const [questionBody, setQuestionBody] = useState("");

  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctOption, setCorrectOption] = useState<OptionKey>("A");

  const [solution, setSolution] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("Medium");
  const [isPYQ, setIsPYQ] = useState(false);
  const [pyqYear, setPyqYear] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ─── Load bundles once ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const token = await adminUser.getIdToken();
      const { bundles: rows } = await listBundles({ data: { token } });
      setBundles(rows.map((b) => ({ id: b.id, title: b.title })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  // ─── Load tests whenever the selected bundle changes ────────────────────
  useEffect(() => {
    if (!bundleId) {
      setTests(null);
      setTestId("");
      return;
    }
    (async () => {
      setTests(null);
      setTestId("");
      const token = await adminUser.getIdToken();
      const { testCores } = await listTestCoresForBundle({ data: { token, bundleId } });
      setTests(testCores.map((t) => ({ id: t.id, name: t.name })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId, adminUser]);

  function resetQuestionFields() {
    setQuestionNo("");
    setQuestionBody("");
    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");
    setCorrectOption("A");
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
    const qNo = Number(questionNo);
    if (!qNo || qNo <= 0) return setError("Enter a valid question number.");
    if (!questionBody.trim()) return setError("Enter the question body.");
    if (!subject.trim()) return setError("Enter a subject.");
    if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
      return setError("All four options (A–D) must be filled in.");
    }
    if (!solution.trim()) return setError("Enter the step-by-step solution.");
    if (isPYQ && !pyqYear.trim()) return setError("Enter the PYQ year, or uncheck 'Previous Year Question'.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await createQuestion({
        data: {
          token,
          question: {
            bundleId,
            testId,
            subject: subject.trim(),
            questionNo: qNo,
            body: questionBody.trim(),
            options: {
              A: optionA.trim(),
              B: optionB.trim(),
              C: optionC.trim(),
              D: optionD.trim(),
            },
            correctOption,
            solution: solution.trim(),
            difficulty,
            isPYQ,
            pyqYear: isPYQ ? pyqYear.trim() : undefined,
          },
        },
      });
      setSuccess(true);
      resetQuestionFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this question. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Question Ingestion Pipeline"
        subtitle="Bundle → Test → Subject. Add one question at a time, with LaTeX-ready text fields."
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
                <option value="">
                  {bundles === null ? "Loading…" : "Select bundle"}
                </option>
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
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Physics, Verbal Ability, Accountancy…"
                className={inputClass}
                list="question-subject-suggestions"
              />
              <datalist id="question-subject-suggestions">
                <option value="Physics" />
                <option value="Chemistry" />
                <option value="Mathematics" />
                <option value="Verbal Ability" />
                <option value="Accountancy" />
                <option value="General Test" />
              </datalist>
            </ClayField>
          </div>

          {(!bundleId || !testId) && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground/40">
              <BookOpen className="h-3 w-3" />
              Select a bundle and test above to enable question entry below.
            </p>
          )}
        </div>

        {/* ── Core question inputs ──────────────────────────────────── */}
        <div className={`clay p-5 sm:p-6 ${!bundleId || !testId ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center gap-2">
            <FileQuestion className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Question
            </h2>
          </div>

          <fieldset disabled={!bundleId || !testId} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <ClayField label="Question no.">
                <input
                  value={questionNo}
                  onChange={(e) => setQuestionNo(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 1"
                  className={inputClass}
                />
              </ClayField>
            </div>

            <ClayField label="Question body (text, LaTeX $…$/$$…$$, or image URL)">
              <textarea
                value={questionBody}
                onChange={(e) => setQuestionBody(e.target.value)}
                rows={4}
                placeholder="e.g. The velocity of a particle is given by $v = u + at$. Find…"
                className={textareaClass}
              />
            </ClayField>

            {/* ── Options block ─────────────────────────────────────── */}
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
                          isCorrect
                            ? "clay-btn text-white"
                            : "clay-btn-ghost text-foreground/50"
                        }`}
                      >
                        {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : opt.key}
                      </button>
                      <input
                        value={opt.value}
                        onChange={(e) => opt.setValue(e.target.value)}
                        placeholder={`Option ${opt.key}`}
                        className={inputClass + " flex-1"}
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
          </fieldset>
        </div>

        {/* ── Solution & metadata panel ─────────────────────────────── */}
        <div className={`clay p-5 sm:p-6 ${!bundleId || !testId ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Solution &amp; metadata
            </h2>
          </div>

          <fieldset disabled={!bundleId || !testId} className="space-y-4">
            <ClayField label="Step-by-step solution (LaTeX enabled)">
              <textarea
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={5}
                placeholder="Step 1: … $$v^2 = u^2 + 2as$$ Step 2: …"
                className={textareaClass}
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

            {/* Conditional PYQ year input — animated slide-in rather than an
                abrupt mount/unmount, so the layout doesn't jump when toggled. */}
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
              Question saved. Form cleared for the next entry.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !bundleId || !testId}
            className="clay-btn mt-5 flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save question"}
          </button>
        </div>
      </form>
    </div>
  );
}