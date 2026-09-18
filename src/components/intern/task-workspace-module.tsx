import { useEffect, useState, type FormEvent } from "react";
import {
  IconLoader2 as Loader2,
  IconCircleCheck as CheckCircle2,
  IconTrash as Trash2,
  IconPencil as Pencil,
  IconFileText as FileText,
  IconHelpCircle as HelpCircle,
} from "@tabler/icons-react";
import { Circle } from "lucide-react";
import {
  getTaskDrafts,
  createDraft,
  updateDraft,
  deleteDraft,
  submitDrafts,
  getTaskProgress,
} from "@/server-functions/intern-portal";
import { ImageInsertField } from "@/components/admin/image-insert-field";
import { QuestionContentRenderer } from "@/components/shared/question-content-renderer";
import { useTour, OnboardingTour, type TourStep } from "./onboarding-tour";

type OptionKey = "A" | "B" | "C" | "D";
type QuestionType = "mcq" | "integer";
type Task = {
  id: string;
  subject: string;
  targetCount: number;
  instructions: string;
  referencePdfUrl: string | null;
};

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";
const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

const emptyForm = {
  body: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A" as OptionKey,
  integerAnswer: "",
  solution: "",
  difficulty: "Medium" as "Easy" | "Medium" | "Hard",
  isPYQ: false,
  pyqYear: "",
  questionType: "mcq" as QuestionType,
};

const WORKSPACE_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="reference-doc"]',
    title: "Reference material",
    description:
      "If your admin attached a document, it has the exact questions or source material to work from — open it before you start writing.",
  },
  {
    selector: '[data-tour="question-form"]',
    title: "Add a question",
    description:
      "Write the question, tap a letter to mark the correct option, and fill in a full step-by-step solution. The little image icon in each text box lets you insert diagrams or photos of the original question.",
  },
  {
    selector: '[data-tour="preview"]',
    title: "Check before you add it",
    description:
      "This box shows exactly how your question will look once reviewed — images and LaTeX rendered, not raw code. Always check here before hitting \"Add to drafts\".",
  },
  {
    selector: '[data-tour="ready-to-submit"]',
    title: "Submit for review",
    description:
      "Questions you add sit here until you select them and hit Submit — that's what sends them to Edurack's admin for approval. Anything not yet submitted you can keep editing freely.",
  },
];

export function TaskWorkspaceModule({ token, task }: { token: string; task: Task }) {
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof getTaskDrafts>>["drafts"] | null>(null);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getTaskProgress>>["progress"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tour = useTour("internTourWorkspaceSeen");

  async function refresh() {
    const [d, p] = await Promise.all([
      getTaskDrafts({ data: { token, taskId: task.id } }),
      getTaskProgress({ data: { token, taskId: task.id } }),
    ]);
    setDrafts(d.drafts);
    setProgress(p.progress);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function startEdit(d: NonNullable<typeof drafts>[number]) {
    setEditingId(d.id);
    setForm({
      body: d.body,
      optionA: d.options?.A ?? "",
      optionB: d.options?.B ?? "",
      optionC: d.options?.C ?? "",
      optionD: d.options?.D ?? "",
      correctOption: (d.correctOption as OptionKey) ?? "A",
      integerAnswer: d.correctAnswer !== undefined ? String(d.correctAnswer) : "",
      solution: d.solution,
      difficulty: d.difficulty,
      isPYQ: d.isPYQ,
      pyqYear: d.pyqYear ?? "",
      questionType: d.type,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const draftInput =
      form.questionType === "mcq"
        ? {
            body: form.body.trim(),
            type: "mcq" as const,
            options: { A: form.optionA.trim(), B: form.optionB.trim(), C: form.optionC.trim(), D: form.optionD.trim() },
            correctOption: form.correctOption,
            solution: form.solution.trim(),
            difficulty: form.difficulty,
            isPYQ: form.isPYQ,
            pyqYear: form.isPYQ ? form.pyqYear.trim() : undefined,
          }
        : {
            body: form.body.trim(),
            type: "integer" as const,
            correctAnswer: Number(form.integerAnswer),
            solution: form.solution.trim(),
            difficulty: form.difficulty,
            isPYQ: form.isPYQ,
            pyqYear: form.isPYQ ? form.pyqYear.trim() : undefined,
          };

    setSaving(true);
    try {
      if (editingId) {
        await updateDraft({ data: { token, draftId: editingId, draft: draftInput } });
      } else {
        await createDraft({ data: { token, taskId: task.id, draft: draftInput } });
      }
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this question.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteDraft({ data: { token, draftId: id } });
    if (editingId === id) resetForm();
    await refresh();
  }

  async function handleSubmitSelected() {
    if (selected.size === 0) return;
    await submitDrafts({ data: { token, draftIds: [...selected] } });
    setSelected(new Set());
    await refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const editable = drafts?.filter((d) => d.status === "draft" || d.status === "rejected") ?? [];
  const submitted = drafts?.filter((d) => d.status === "submitted") ?? [];
  const approved = drafts?.filter((d) => d.status === "approved") ?? [];

  return (
    <div className="space-y-6">
      <div className="clay p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">{task.subject}</h2>
            {task.instructions ? (
              <p className="mt-2 text-sm text-foreground/70">{task.instructions}</p>
            ) : (
              <p className="mt-2 text-sm text-foreground/40 italic">
                No extra instructions from your admin — follow the standard steps below.
              </p>
            )}
          </div>
          <button
            onClick={tour.start}
            className="clay-btn-ghost flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Help
          </button>
        </div>

        {task.referencePdfUrl ? (
          <a
            data-tour="reference-doc"
            href={task.referencePdfUrl}
            target="_blank"
            rel="noreferrer"
            className="clay-inset mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--sky-deep)] transition-colors hover:bg-foreground/5"
          >
            <FileText className="h-4 w-4 shrink-0" />
            Open reference document — the source material for these questions
          </a>
        ) : (
          <p data-tour="reference-doc" className="clay-inset mt-4 rounded-2xl px-4 py-3 text-xs text-foreground/40">
            No reference document was attached to this task — write questions per the subject and instructions
            above, in your own words.
          </p>
        )}

        {progress && (
          <p className="mt-3 text-xs text-foreground/50">
            Target: {task.targetCount} · Approved: {progress.approvedCount} · Awaiting review: {progress.submittedCount} ·
            Drafts ready to submit: {progress.draftCount}
          </p>
        )}
      </div>

      {/* ── Persistent step-by-step guide — always visible, unlike the
           dismissible tour, so "how do I do this" is never more than a
           scroll away. ────────────────────────────────────────────── */}
      <div className="clay-inset rounded-2xl p-4 sm:p-5">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">How this works</p>
        <ol className="space-y-1.5 text-sm text-foreground/70">
          <li>
            <strong className="text-foreground">1.</strong> Open the reference document above (if there is one) —
            it has the exact source material to work from.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Fill in the form below: question, options (or the
            numeric answer), and a full solution. Paste an image or click the small image icon to insert a
            diagram — it uploads automatically.
          </li>
          <li>
            <strong className="text-foreground">3.</strong> Check the Preview panel — it shows exactly what your
            reviewer will see, images and equations rendered.
          </li>
          <li>
            <strong className="text-foreground">4.</strong> Click "Add to drafts". Repeat until you've got a
            batch ready, then select them and hit "Submit for review".
          </li>
          <li>
            <strong className="text-foreground">5.</strong> You'll get an email the moment it's approved or sent
            back with feedback — check your <span className="font-semibold text-foreground">Profile</span> tab any
            time to see your accuracy and progress.
          </li>
        </ol>
      </div>

      {/* ── Form: add / edit a question ─────────────────────────────── */}
      <form onSubmit={handleSave} data-tour="question-form" className="clay space-y-4 p-5 sm:p-6">

        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          {editingId ? "Edit question" : "Add a question"}
        </h3>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, questionType: "mcq" }))}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              form.questionType === "mcq" ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            MCQ
          </button>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, questionType: "integer" }))}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              form.questionType === "integer" ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            Integer / Numerical
          </button>
        </div>

        <ImageInsertField
          value={form.body}
          onChange={(v: string) => setForm((f) => ({ ...f, body: v }))}
          rows={4}
          className={textareaClass}
          placeholder="Question body — text, LaTeX $…$/$$…$$, or insert an image of the original question"
        />

        {form.questionType === "mcq" ? (
          <div className="space-y-2">
            {(
              [
                { key: "A" as OptionKey, field: "optionA" as const },
                { key: "B" as OptionKey, field: "optionB" as const },
                { key: "C" as OptionKey, field: "optionC" as const },
                { key: "D" as OptionKey, field: "optionD" as const },
              ] as const
            ).map((opt) => {
              const isCorrect = form.correctOption === opt.key;
              return (
                <div key={opt.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, correctOption: opt.key }))}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                      isCorrect ? "clay-btn text-white" : "clay-btn-ghost text-foreground/50"
                    }`}
                  >
                    {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : opt.key}
                  </button>
                  <ImageInsertField
                    value={form[opt.field]}
                    onChange={(v: string) => setForm((f) => ({ ...f, [opt.field]: v }))}
                    placeholder={`Option ${opt.key}`}
                    className={inputClass}
                    compact
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <input
            value={form.integerAnswer}
            onChange={(e) => setForm((f) => ({ ...f, integerAnswer: e.target.value }))}
            inputMode="decimal"
            placeholder="Correct numerical answer, e.g. 5 or 12.5"
            className={inputClass}
          />
        )}

        <ImageInsertField
          value={form.solution}
          onChange={(v: string) => setForm((f) => ({ ...f, solution: v }))}
          rows={4}
          className={textareaClass}
          placeholder="Step-by-step solution (LaTeX enabled, images allowed)"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <select
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as "Easy" | "Medium" | "Hard" }))}
            className={inputClass + " appearance-none"}
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <label className="clay-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5">
            <input
              type="checkbox"
              checked={form.isPYQ}
              onChange={(e) =>
                setForm((f) => ({ ...f, isPYQ: e.target.checked, pyqYear: e.target.checked ? f.pyqYear : "" }))
              }
              className="h-4 w-4"
            />
            <span className="text-sm text-foreground">Previous Year Question</span>
          </label>
        </div>

        {form.isPYQ && (
          <input
            value={form.pyqYear}
            onChange={(e) => setForm((f) => ({ ...f, pyqYear: e.target.value }))}
            placeholder="PYQ year, e.g. 2023"
            className={inputClass}
          />
        )}

        {/* ── Live preview — exactly what admin will see when they review
             this, rendered images and LaTeX included, so mistakes get
             caught here instead of after submitting. ────────────────── */}
        <div data-tour="preview" className="clay-inset rounded-2xl p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Preview — this is how it'll look to the reviewer
          </p>
          <QuestionContentRenderer content={form.body} />
          {form.questionType === "mcq" ? (
            <ul className="mt-3 space-y-1.5">
              {(
                [
                  { key: "A" as OptionKey, value: form.optionA },
                  { key: "B" as OptionKey, value: form.optionB },
                  { key: "C" as OptionKey, value: form.optionC },
                  { key: "D" as OptionKey, value: form.optionD },
                ] as const
              ).map((opt) => (
                <li
                  key={opt.key}
                  className={`flex gap-2 ${form.correctOption === opt.key ? "text-emerald-600" : "text-foreground/70"}`}
                >
                  <span className="shrink-0 font-semibold">{opt.key}.</span>
                  <QuestionContentRenderer content={opt.value} />
                </li>
              ))}
            </ul>
          ) : (
            form.integerAnswer && (
              <p className="mt-3 text-sm text-foreground/70">Answer: {form.integerAnswer}</p>
            )
          )}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">Solution</p>
          <QuestionContentRenderer content={form.solution} className="text-foreground/70" />
        </div>

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="clay-btn flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Save changes" : "Add to drafts"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="clay-chip rounded-full px-6 py-2.5 text-sm font-semibold text-foreground/70"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ── Editable drafts (draft / rejected) ──────────────────────── */}
      <div data-tour="ready-to-submit" className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Ready to submit ({editable.length})
          </h3>
          <button
            onClick={handleSubmitSelected}
            disabled={selected.size === 0}
            className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            Submit {selected.size > 0 ? `(${selected.size})` : "selected"} for review
          </button>
        </div>
        <div className="space-y-2">
          {editable.length === 0 && <p className="text-sm text-foreground/40">No drafts yet — add one above.</p>}
          {editable.map((d) => (
            <div key={d.id} className="clay-inset flex items-start gap-3 rounded-2xl p-4">
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} className="mt-1 h-4 w-4" />
              <div className="flex-1">
                <div className="max-h-20 overflow-hidden">
                  <QuestionContentRenderer content={d.body} />
                </div>
                {d.status === "rejected" && d.adminFeedback && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <Circle className="h-3 w-3" /> Rejected: {d.adminFeedback}
                  </p>
                )}
              </div>
              <button onClick={() => startEdit(d)} className="clay-btn-ghost rounded-xl p-2 text-foreground/50">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(d.id)} className="clay-btn-ghost rounded-xl p-2 text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Submitted (awaiting admin) ──────────────────────────────── */}
      {submitted.length > 0 && (
        <div className="clay p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Awaiting admin review ({submitted.length})
          </h3>
          <div className="space-y-2">
            {submitted.map((d) => (
              <div key={d.id} className="clay-inset rounded-2xl p-4">
                <div className="max-h-20 overflow-hidden">
                  <QuestionContentRenderer content={d.body} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Approved ─────────────────────────────────────────────────── */}
      {approved.length > 0 && (
        <div className="clay p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Approved & live ({approved.length})
          </h3>
          <div className="space-y-2">
            {approved.map((d) => (
              <div key={d.id} className="clay-inset flex items-start gap-2 rounded-2xl p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="max-h-20 flex-1 overflow-hidden">
                  <QuestionContentRenderer content={d.body} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tour.active && <OnboardingTour steps={WORKSPACE_TOUR_STEPS} onFinish={tour.finish} />}
    </div>
  );
}