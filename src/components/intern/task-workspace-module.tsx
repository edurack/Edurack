import { useEffect, useState, type FormEvent } from "react";
import {
  IconLoader2 as Loader2,
  IconCircleCheck as CheckCircle2,
  IconTrash as Trash2,
  IconPencil as Pencil,
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

type OptionKey = "A" | "B" | "C" | "D";
type QuestionType = "mcq" | "integer";
type Task = { id: string; subject: string; targetCount: number; instructions: string };

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

export function TaskWorkspaceModule({ token, task }: { token: string; task: Task }) {
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof getTaskDrafts>>["drafts"] | null>(null);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getTaskProgress>>["progress"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">{task.subject}</h2>
        {task.instructions && <p className="mt-2 text-sm text-foreground/70">{task.instructions}</p>}
        {progress && (
          <p className="mt-3 text-xs text-foreground/50">
            Target: {task.targetCount} · Approved: {progress.approvedCount} · Awaiting review: {progress.submittedCount} ·
            Drafts ready to submit: {progress.draftCount}
          </p>
        )}
      </div>

      {/* ── Form: add / edit a question ─────────────────────────────── */}
      <form onSubmit={handleSave} className="clay space-y-4 p-5 sm:p-6">
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

        <textarea
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={4}
          placeholder="Question body (text, LaTeX $…$/$$…$$, or describe the diagram)"
          className={textareaClass}
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
                  <input
                    value={form[opt.field]}
                    onChange={(e) => setForm((f) => ({ ...f, [opt.field]: e.target.value }))}
                    placeholder={`Option ${opt.key}`}
                    className={inputClass + " flex-1"}
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

        <textarea
          value={form.solution}
          onChange={(e) => setForm((f) => ({ ...f, solution: e.target.value }))}
          rows={4}
          placeholder="Step-by-step solution (LaTeX enabled)"
          className={textareaClass}
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
      <div className="clay p-5 sm:p-6">
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
                <p className="text-sm text-foreground line-clamp-2">{d.body}</p>
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
                <p className="text-sm text-foreground line-clamp-2">{d.body}</p>
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
              <div key={d.id} className="clay-inset flex items-center gap-2 rounded-2xl p-4">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <p className="text-sm text-foreground line-clamp-2">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
