import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { getTrialAssignmentByCode, submitTrialAssignment } from "@/server-functions/intern-trial";
import {
  IconFileText as FileText,
  IconCircleCheck as CheckCircle2,
  IconListCheck as ListCheck,
  IconInfoCircle as InfoCircle,
  IconPhoto as Photo,
  IconTarget as Target,
  IconBulb as Bulb,
  IconChevronDown as ChevronDown,
} from "@tabler/icons-react";
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

        <TaskToolkit />

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

// ─── Toolkit: a collapsible guide explaining exactly what a good
// submission looks like, since this is often the candidate's first time
// using this editor and the only thing standing between them and the
// admin's review queue. Defaults open — this is the most important thing
// on the page the first time someone lands here. ─────────────────────────
function TaskToolkit() {
  const [open, setOpen] = useState(true);

  return (
    <div className="clay mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-6"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent">
            <ListCheck className="h-4.5 w-4.5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-foreground sm:text-base">
              Toolkit — how to ace this task
            </h2>
            <p className="text-xs text-foreground/50">Read this before you start writing.</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-5 pt-5 sm:p-6 sm:pt-5">
          <ToolkitItem icon={Target} title="Question types">
            <p>
              <strong className="text-foreground">MCQ</strong> — one correct option out of four (A–D). Write three
              genuinely plausible wrong options, not obvious throwaways — a reviewer can tell the difference.
              <br />
              <strong className="text-foreground">Integer</strong> — a numerical answer with no options, for
              questions where the answer is a number (e.g. calculation-based Physics/Chemistry problems).
            </p>
          </ToolkitItem>

          <ToolkitItem icon={Photo} title="Formatting: LaTeX & images">
            <p>
              Wrap math in <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-xs">$…$</code> for
              inline (e.g. <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-xs">$x^2 + 2x$</code>)
              or <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-xs">$$…$$</code> for a
              standalone equation on its own line. For diagrams or graphs, paste an image directly into any text
              box, or click the small image icon — it uploads and inserts automatically. Every text box has a live
              preview right below it, so check that before moving on.
            </p>
          </ToolkitItem>

          <ToolkitItem icon={Bulb} title="Difficulty — pick honestly">
            <p>
              <strong className="text-foreground">Easy</strong> — direct application of a single concept, minimal
              calculation.
              <br />
              <strong className="text-foreground">Medium</strong> — needs 2+ steps or combines two concepts.
              <br />
              <strong className="text-foreground">Hard</strong> — multi-step, easy to make a silly mistake, or
              tests an edge case. Don't default everything to Medium — reviewers use this to gauge your judgment,
              not just your writing.
            </p>
          </ToolkitItem>

          <ToolkitItem icon={InfoCircle} title="What a good solution looks like">
            <p>
              Show the working, not just the final answer — every step a student would need to follow, in order.
              A solution that's just "Answer: C" or a bare number will be rejected even if the question itself is
              fine.
            </p>
          </ToolkitItem>

          <div className="clay-inset rounded-2xl p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Before you submit, check that every question has:
            </p>
            <ul className="space-y-1.5 text-sm text-foreground/70">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />A clearly worded body with
                no typos or ambiguity
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                For MCQs: four distinct, plausible options with exactly one marked correct
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />A full step-by-step
                solution, not just the final answer
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />An honest difficulty
                rating
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Checked in the live preview below the editor — LaTeX and images render correctly
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolkitItem({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-foreground/5">
        <Icon className="h-4 w-4 text-foreground/60" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-foreground/70">{children}</div>
      </div>
    </div>
  );
}