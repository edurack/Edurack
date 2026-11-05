// Step 4 of the NCERT Line by Line admin screen: look through what has been uploaded for the open chapter, fix a
// question in place, and delete questions: ticked one by one, or every question of a topic at once.
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Trash2 } from "lucide-react";
import { deleteNcertQuestions, listNcertQuestions, updateNcertQuestion, type NcertAdminQuestion } from "@/server-functions/ncert-line-admin";
import { cn } from "@/lib/utils";

type AdminUser = { getIdToken: () => Promise<string> };
type Difficulty = "Easy" | "Medium" | "Hard";
const OPTION_KEYS = ["A", "B", "C", "D"] as const;
const field = "clay-inset w-full rounded-xl px-3 py-2 text-sm";
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const DIFFICULTY_STYLE: Record<Difficulty, string> = { Easy: "bg-emerald-500/15 text-emerald-700", Medium: "bg-amber-500/15 text-amber-700", Hard: "bg-rose-500/15 text-rose-700" };

export function NcertQuestionManager({
  adminUser,
  subject,
  chapter,
  topics,
  counts,
  reloadSignal,
  onChanged,
}: {
  adminUser: AdminUser;
  subject: string;
  chapter: string;
  /** Every topic of this chapter (canonical spelling), for the filter and the editor's topic list. */
  topics: string[];
  counts: { topic: string; count: number }[];
  /** Changes when something was uploaded elsewhere on the screen, so this list reloads. */
  reloadSignal: number;
  /** Called after an edit or delete so the topic counts above refresh. */
  onChanged: () => void | Promise<void>;
}) {
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<NcertAdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const fail = (err: unknown, fallback: string) => setMsg({ kind: "error", text: err instanceof Error ? err.message : fallback });

  // Loads the first page (or the next one) for the current chapter and topic filter.
  const load = useCallback(
    async (more: boolean, skip: number) => {
      setLoading(true);
      try {
        const token = await adminUser.getIdToken();
        const res = await listNcertQuestions({ data: { token, subject, chapter, topic: topic || undefined, skip } });
        setItems((cur) => (more ? [...cur, ...res.questions.filter((q) => !cur.some((c) => c.id === q.id))] : res.questions));
        setTotal(res.total);
      } catch (err) {
        fail(err, "Could not load the questions.");
      } finally {
        setLoading(false);
      }
    },
    [adminUser, subject, chapter, topic],
  );

  // A new chapter, topic filter or upload starts the list over.
  useEffect(() => {
    setSelected(new Set());
    setEditing(null);
    void load(false, 0);
  }, [load, reloadSignal]);
  useEffect(() => {
    setTopic("");
    setMsg(null);
  }, [subject, chapter]);

  const countOf = (t: string) => counts.find((c) => c.topic.toLowerCase() === t.toLowerCase())?.count ?? 0;
  const allLoadedSelected = items.length > 0 && items.every((q) => selected.has(q.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function afterDelete(deleted: number) {
    setMsg({ kind: "ok", text: `Deleted ${deleted} question${deleted === 1 ? "" : "s"}.` });
    setSelected(new Set());
    setEditing(null);
    await Promise.all([load(false, 0), onChanged()]);
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected question${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await deleteNcertQuestions({ data: { token: await adminUser.getIdToken(), ids } });
      await afterDelete(res.deleted);
    } catch (err) {
      fail(err, "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTopic() {
    if (!topic || total === 0) return;
    if (!confirm(`Delete ALL ${total} question${total === 1 ? "" : "s"} in "${topic}"? This can't be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await deleteNcertQuestions({ data: { token: await adminUser.getIdToken(), topic: { subject, chapter, topic, expectedCount: total } } });
      await afterDelete(res.deleted);
    } catch (err) {
      fail(err, "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string, question: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await updateNcertQuestion({ data: { token: await adminUser.getIdToken(), id, question } });
      setEditing(null);
      setMsg({ kind: "ok", text: "Question saved." });
      // A question moved to another topic leaves a filtered list; otherwise just show the saved version.
      if (topic && res.question.topic.toLowerCase() !== topic.toLowerCase()) await load(false, 0);
      else setItems((cur) => cur.map((q) => (q.id === id ? res.question : q)));
      await onChanged();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not save.";
    }
  }

  return (
    <div className="clay p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Manage uploaded questions</h2>
      <p className="mt-1 text-xs text-foreground/50">
        Tick questions to delete them, press the pencil to edit one, or pick a topic and delete all of its questions at once. Deleting also clears students' progress on those questions.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Show questions from</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={field}>
            <option value="">All topics in this chapter</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t} ({countOf(t)})
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs font-semibold text-foreground/60">{loading && items.length === 0 ? "Loading…" : `${total} question${total === 1 ? "" : "s"}`}</span>
      </div>

      {msg && (
        <p role="status" className={cn("mt-3 flex items-start gap-1.5 rounded-2xl px-4 py-2 text-xs font-medium", msg.kind === "ok" ? "bg-emerald-500/10 text-emerald-800" : "bg-[var(--coral-soft)]/50 text-foreground")}>
          {msg.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />} {msg.text}
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold">
          <label className="inline-flex cursor-pointer items-center gap-2 text-foreground/70">
            <input type="checkbox" checked={allLoadedSelected} onChange={() => setSelected(allLoadedSelected ? new Set() : new Set(items.map((q) => q.id)))} />
            Select all shown ({items.length})
          </label>
          <button type="button" onClick={deleteSelected} disabled={busy || selected.size === 0} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete selected ({selected.size})
          </button>
          {topic && total > 0 && (
            <button type="button" onClick={deleteTopic} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 px-4 py-1.5 text-rose-700 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> Delete all {total} in this topic
            </button>
          )}
        </div>
      )}

      {items.length === 0 && !loading ? (
        <p className="clay-inset mt-3 rounded-2xl px-4 py-5 text-center text-xs text-foreground/50">No questions uploaded here yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((q) => (
            <li key={q.id} className={cn("clay-inset rounded-2xl p-3", selected.has(q.id) && "ring-2 ring-rose-400/70")}>
              {editing === q.id ? (
                <QuestionEditor q={q} topics={topics} onSave={(question) => save(q.id, question)} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Select question ${q.topicQuestionNo} of ${q.topic}`} className="mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-foreground/60">
                      <span>
                        {q.topic} #{q.topicQuestionNo}
                      </span>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5">{q.type === "mcq" ? `MCQ · ${q.correctOption}` : `Integer · ${q.correctAnswer}`}</span>
                      <span className={cn("rounded-full px-2 py-0.5", DIFFICULTY_STYLE[q.difficulty])}>{q.difficulty}</span>
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-foreground">{plain(q.body)}</p>
                  </div>
                  <button type="button" onClick={() => setEditing(q.id)} aria-label={`Edit question ${q.topicQuestionNo} of ${q.topic}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-foreground/10 hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length < total && (
        <button type="button" onClick={() => void load(true, items.length)} disabled={loading} className="clay-chip mx-auto mt-3 flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold text-foreground/70 disabled:opacity-60">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show more ({total - items.length} left)
        </button>
      )}
    </div>
  );
}

function QuestionEditor({ q, topics, onSave, onCancel }: { q: NcertAdminQuestion; topics: string[]; onSave: (question: Record<string, unknown>) => Promise<string | null>; onCancel: () => void }) {
  const [topic, setTopic] = useState(q.topic);
  const [type, setType] = useState<"mcq" | "integer">(q.type);
  const [body, setBody] = useState(q.body);
  const [options, setOptions] = useState<Record<(typeof OPTION_KEYS)[number], string>>({ A: q.options?.A ?? "", B: q.options?.B ?? "", C: q.options?.C ?? "", D: q.options?.D ?? "" });
  const [correctOption, setCorrectOption] = useState<(typeof OPTION_KEYS)[number]>(q.correctOption ?? "A");
  const [correctAnswer, setCorrectAnswer] = useState(q.correctAnswer !== undefined ? String(q.correctAnswer) : "");
  const [difficulty, setDifficulty] = useState<Difficulty>(q.difficulty);
  const [solution, setSolution] = useState(q.solution);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicChoices = topics.includes(q.topic) ? topics : [q.topic, ...topics];

  async function submit() {
    setSaving(true);
    setError(null);
    const err = await onSave({ topic, type, body, difficulty, solution, ...(type === "mcq" ? { options, correctOption } : { correctAnswer }) });
    if (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-foreground/60 sm:col-span-1">
          Topic
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={cn(field, "mt-1")}>
            {topicChoices.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-foreground/60">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as "mcq" | "integer")} className={cn(field, "mt-1")}>
            <option value="mcq">MCQ</option>
            <option value="integer">Integer</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-foreground/60">
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={cn(field, "mt-1")}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </label>
      </div>

      <label className="block text-xs font-semibold text-foreground/60">
        Question
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={cn(field, "mt-1")} />
      </label>

      {type === "mcq" ? (
        <div className="space-y-2">
          {OPTION_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold text-foreground/70">
                <input type="radio" name={`correct-${q.id}`} checked={correctOption === k} onChange={() => setCorrectOption(k)} aria-label={`Option ${k} is correct`} /> {k}
              </label>
              <input value={options[k]} onChange={(e) => setOptions((o) => ({ ...o, [k]: e.target.value }))} aria-label={`Option ${k}`} className={field} />
            </div>
          ))}
          <p className="text-[11px] text-foreground/50">The selected circle marks the correct option.</p>
        </div>
      ) : (
        <label className="block text-xs font-semibold text-foreground/60">
          Correct answer (a number)
          <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} inputMode="decimal" className={cn(field, "mt-1 sm:max-w-xs")} />
        </label>
      )}

      <label className="block text-xs font-semibold text-foreground/60">
        Solution
        <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={4} className={cn(field, "mt-1")} />
      </label>

      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void submit()} disabled={saving} className="clay-btn inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save changes
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="text-xs font-semibold text-foreground/60 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
