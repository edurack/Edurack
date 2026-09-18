import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { getTrialAssignmentByCode, submitTrialAssignment } from "@/server-functions/intern-trial";
import { IconFileText as FileText, IconCircleCheck as CheckCircle2 } from "@tabler/icons-react";
import { ImageInsertField } from "@/components/admin/image-insert-field";
import { QuestionContentRenderer } from "@/components/shared/question-content-renderer";

export const Route = createFileRoute("/intern/trial/$code")({
  component: TrialPage,
});

type OptionKey = "A" | "B" | "C" | "D";
type QuestionType = "mcq" | "integer";
type DraftAnswer = {
  body: string;
  type: QuestionType;
  options?: { A: string; B: string; C: string; D: string };
  correctOption?: OptionKey;
  correctAnswer?: number;
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";
const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function TrialPage() {
  const { code } = Route.useParams();
  const [assignment, setAssignment] = useState<Awaited<ReturnType<typeof getTrialAssignmentByCode>>["assignment"] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<DraftAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTrialAssignmentByCode({ data: { code } });
        setAssignment(res.assignment);
        if (res.assignment.status === "open") {
          setAnswers(
            Array.from({ length: res.assignment.sampleCount }, () => ({
              body: "",
              type: "mcq" as QuestionType,
              options: { A: "", B: "", C: "", D: "" },
              correctOption: "A" as OptionKey,
              solution: "",
              difficulty: "Medium" as const,
            })),
          );
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "This link isn't valid.");
      }
    })();
  }, [code]);

  function updateAnswer(i: number, patch: Partial<DraftAnswer>) {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitTrialAssignment({
        data: {
          code,
          answers: answers.map((a) =>
            a.type === "mcq"
              ? {
                  body: a.body.trim(),
                  type: "mcq",
                  options: a.options,
                  correctOption: a.correctOption,
                  solution: a.solution.trim(),
                  difficulty: a.difficulty,
                }
              : {
                  body: a.body.trim(),
                  type: "integer",
                  correctAnswer: a.correctAnswer,
                  solution: a.solution.trim(),
                  difficulty: a.difficulty,
                },
          ),
        },
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="clay p-6 text-sm text-foreground/70">{loadError}</p>
      </div>
    );
  }
  if (!assignment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-foreground/50">Loading…</p>
      </div>
    );
  }
  if (assignment.status !== "open" || done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="clay max-w-sm p-6 text-center">
          <h1 className="font-display text-xl font-bold text-foreground">Thanks, {assignment.candidateName}!</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Your sample questions have been submitted. Edurack will review them and get back to you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="clay mb-6 p-5 sm:p-6">
          <h1 className="font-display text-xl font-bold text-foreground">Edurack Question-Writing Sample Task</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Hi {assignment.candidateName}, welcome — here's your sample task. This is the exact same editor Edurack
            interns use for real question ingestion, so it's a fair preview of the actual work.
          </p>
          <p className="mt-3 text-sm font-semibold text-foreground">{assignment.subjectLabel}</p>
          <p className="mt-1 text-sm text-foreground/70">{assignment.instructions}</p>
          {assignment.referenceMaterialUrl && (
            <a
              href={assignment.referenceMaterialUrl}
              target="_blank"
              rel="noreferrer"
              className="clay-inset mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--sky-deep)] transition-colors hover:bg-foreground/5"
            >
              <FileText className="h-4 w-4 shrink-0" />
              Open reference material — the source questions for this task
            </a>
          )}
          <p className="mt-2 text-xs text-foreground/50">
            Write {assignment.sampleCount} sample question{assignment.sampleCount > 1 ? "s" : ""} in the same format
            Edurack uses — this is purely for evaluation, not a real bundle or test. Paste an image or click the
            small image icon in any text box to insert a diagram; LaTeX ($…$/$$…$$) is supported everywhere too.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {answers.map((a, i) => (
            <div key={i} className="clay space-y-3 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Question {i + 1}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateAnswer(i, { type: "mcq" })}
                  className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                    a.type === "mcq" ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  MCQ
                </button>
                <button
                  type="button"
                  onClick={() => updateAnswer(i, { type: "integer" })}
                  className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                    a.type === "integer" ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  Integer
                </button>
              </div>

              <ImageInsertField
                value={a.body}
                onChange={(v: string) => updateAnswer(i, { body: v })}
                rows={3}
                className={textareaClass}
                placeholder="Question body — text, LaTeX $…$/$$…$$, or insert an image"
              />

              {a.type === "mcq" ? (
                <div className="space-y-2">
                  {(["A", "B", "C", "D"] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateAnswer(i, { correctOption: k })}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                          a.correctOption === k ? "clay-btn text-white" : "clay-btn-ghost text-foreground/50"
                        }`}
                      >
                        {a.correctOption === k ? <CheckCircle2 className="h-4 w-4" /> : k}
                      </button>
                      <ImageInsertField
                        value={a.options?.[k] ?? ""}
                        onChange={(v: string) => updateAnswer(i, { options: { ...a.options!, [k]: v } })}
                        placeholder={`Option ${k}`}
                        className={inputClass}
                        compact
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <input
                  value={a.correctAnswer ?? ""}
                  onChange={(e) => updateAnswer(i, { correctAnswer: Number(e.target.value) })}
                  inputMode="decimal"
                  placeholder="Correct numerical answer"
                  className={inputClass}
                />
              )}

              <ImageInsertField
                value={a.solution}
                onChange={(v: string) => updateAnswer(i, { solution: v })}
                rows={3}
                className={textareaClass}
                placeholder="Step-by-step solution"
              />

              {/* ── Live preview — same idea as the real intern workspace:
                   images and LaTeX rendered, so mistakes get caught here
                   instead of after submitting. ────────────────────────── */}
              <div className="clay-inset rounded-2xl p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  Preview — this is how it'll look to the reviewer
                </p>
                <QuestionContentRenderer content={a.body} />
                {a.type === "mcq" ? (
                  <ul className="mt-3 space-y-1.5">
                    {(["A", "B", "C", "D"] as const).map((k) => (
                      <li
                        key={k}
                        className={`flex gap-2 ${a.correctOption === k ? "text-emerald-600" : "text-foreground/70"}`}
                      >
                        <span className="shrink-0 font-semibold">{k}.</span>
                        <QuestionContentRenderer content={a.options?.[k] ?? ""} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  a.correctAnswer !== undefined && (
                    <p className="mt-3 text-sm text-foreground/70">Answer: {a.correctAnswer}</p>
                  )
                )}
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">Solution</p>
                <QuestionContentRenderer content={a.solution} className="text-foreground/70" />
              </div>
            </div>
          ))}

          {submitError && <p className="text-xs font-medium text-rose-600">{submitError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="clay-btn w-full rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-70"
          >
            {submitting ? "Submitting…" : "Submit sample task"}
          </button>
        </form>
      </div>
    </div>
  );
}
