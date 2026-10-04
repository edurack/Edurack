import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { ChevronDown, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { SmartContent } from "@/lib/smart-content";
import type { DrillResult, DrillSet, OptionKey, PyqQuestion } from "@/lib/pyq-types";
import type { DrillAnswer } from "@/lib/practice-schedule";
import { cn } from "@/lib/utils";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

export const formatClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const isAnswered = (q: PyqQuestion, a: DrillAnswer) =>
  q.type === "mcq" ? Boolean(a?.option) : typeof a?.value === "number" && Number.isFinite(a.value);

// Answers survive an accidental refresh / the phone reclaiming the tab. The
// timer can't be cheated this way: the server clock is the only one that counts.
const storeKey = (drillId: string) => `edurack:drill:${drillId}`;
function loadAnswers(drillId: string): Record<string, DrillAnswer> {
  try {
    return JSON.parse(sessionStorage.getItem(storeKey(drillId)) ?? "{}") as Record<string, DrillAnswer>;
  } catch {
    return {};
  }
}
function saveAnswers(drillId: string, a: Record<string, DrillAnswer>) {
  try {
    sessionStorage.setItem(storeKey(drillId), JSON.stringify(a));
  } catch {
    // storage unavailable (private mode) — answers just won't survive a reload
  }
}

export function DrillRunner({
  set,
  onSubmit,
}: {
  set: DrillSet;
  onSubmit: (answers: Record<string, DrillAnswer>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, DrillAnswer>>(() => loadAnswers(set.drillId));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(set.remainingSec);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  // Count down against a fixed deadline so a throttled background tab doesn't lose time.
  const deadline = useRef(Date.now() + set.remainingSec * 1000);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(answersRef.current);
    } catch (e) {
      submitted.current = false; // let them retry
      setError(e instanceof Error ? e.message : "Couldn't submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit]);

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        void submit();
      }
    }, 500);
    return () => clearInterval(t);
  }, [submit]);

  const q = set.questions[idx];
  const answeredCount = useMemo(() => set.questions.filter((x) => isAnswered(x, answers[x.id])).length, [set.questions, answers]);
  const low = left <= 300;

  function setAnswer(id: string, a: DrillAnswer) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (a) next[id] = a;
      else delete next[id];
      saveAnswers(set.drillId, next);
      return next;
    });
  }

  return (
    <div>
      {/* Sticky clock + progress */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold" role="timer" aria-live="off" aria-label={`Time left ${formatClock(left)}`}>
            <Timer className={cn("h-4 w-4", low ? "text-destructive" : "text-[var(--sky-deep)]")} aria-hidden />
            <span className={cn("tabular-nums", low && "text-destructive")}>{formatClock(left)}</span>
          </p>
          <p className="text-xs text-foreground/60">
            <span className="font-bold text-foreground">{answeredCount}</span> / {set.questions.length} answered
          </p>
          <button
            onClick={() => setConfirming(true)}
            disabled={submitting}
            className="clay-btn rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>

      {/* Palette */}
      <div className="clay-inset mb-4 rounded-2xl p-3">
        <div className="grid grid-cols-10 gap-1.5">
          {set.questions.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setIdx(i)}
              aria-label={`Question ${i + 1}${isAnswered(x, answers[x.id]) ? ", answered" : ""}`}
              aria-current={i === idx}
              className={cn(
                "aspect-square rounded-lg border text-[11px] font-bold transition-colors",
                i === idx && "ring-2 ring-[var(--sky-deep)]",
                isAnswered(x, answers[x.id]) ? "border-[var(--sky-deep)] bg-[var(--sky-soft)] text-foreground" : "border-border text-foreground/60",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <article key={q.id} className="clay p-4 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">
          Question {idx + 1} of {set.questions.length} · {q.subject}
        </p>
        <SmartContent value={q.body} className="mt-3 text-[15px] leading-relaxed text-foreground" />

        {q.type === "mcq" ? (
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
            {OPTIONS.map((opt) => {
              const chosen = answers[q.id]?.option === opt;
              return (
                <button
                  key={opt}
                  role="radio"
                  aria-checked={chosen}
                  // Tap the chosen option again to clear it (+ lets you un-answer a guess: wrong MCQs cost −1).
                  onClick={() => setAnswer(q.id, chosen ? null : { option: opt })}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-colors",
                    chosen ? "border-[var(--sky-deep)] bg-[var(--sky-soft)]/50" : "border-transparent bg-foreground/[0.04] hover:bg-foreground/[0.07]",
                  )}
                >
                  <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", chosen ? "bg-[var(--sky-deep)] text-white" : "bg-foreground/10 text-foreground/60")}>{opt}</span>
                  <div className="min-w-0 flex-1">
                    <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <label htmlFor={`d-${q.id}`} className="mb-1.5 block text-xs font-semibold text-foreground/60">
              Your answer (numerical)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Toggle negative sign"
                onClick={() => {
                  const v = typed[q.id] ?? "";
                  const nv = v.startsWith("-") ? v.slice(1) : `-${v}`;
                  setTyped((t) => ({ ...t, [q.id]: nv }));
                  const n = Number(nv);
                  setAnswer(q.id, nv.trim() !== "" && Number.isFinite(n) ? { value: n } : null);
                }}
                className="clay-chip w-12 shrink-0 rounded-2xl text-lg font-bold text-foreground/70"
              >
                ±
              </button>
              <input
                id={`d-${q.id}`}
                inputMode="decimal"
                autoComplete="off"
                value={typed[q.id] ?? (typeof answers[q.id]?.value === "number" ? String(answers[q.id]!.value) : "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!/^-?\d*\.?\d*$/.test(v)) return;
                  setTyped((t) => ({ ...t, [q.id]: v }));
                  const n = Number(v);
                  setAnswer(q.id, v.trim() !== "" && v !== "-" && v !== "." && Number.isFinite(n) ? { value: n } : null);
                }}
                placeholder="e.g. 12 or -3.5"
                className="clay-inset min-w-0 flex-1 rounded-2xl border border-transparent px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-[var(--sky-deep)]"
              />
            </div>
          </div>
        )}
      </article>

      <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-2 rounded-full bg-background/80 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="Previous question"
          className="clay-chip grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="flex-1 text-center text-xs font-semibold text-foreground/50">
          {idx + 1} / {set.questions.length}
        </p>
        <button
          onClick={() => setIdx((i) => Math.min(set.questions.length - 1, i + 1))}
          disabled={idx >= set.questions.length - 1}
          aria-label="Next question"
          className="clay-btn grid h-11 w-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {error && (
        <p className="mt-3 text-center text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      {(confirming || submitting) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => !submitting && setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-label="Submit drill" onClick={(e) => e.stopPropagation()} className="clay w-full max-w-sm rounded-b-none p-6 text-center sm:rounded-b-3xl">
            <p className="font-display text-lg font-bold text-foreground">{submitting ? "Submitting…" : "Submit your drill?"}</p>
            {!submitting && (
              <p className="mt-2 text-sm text-foreground/60">
                You've answered <span className="font-bold text-foreground">{answeredCount}</span> of {set.questions.length}.
                {answeredCount < set.questions.length && ` ${set.questions.length - answeredCount} unanswered won't be scored (no penalty).`}
              </p>
            )}
            {submitting ? (
              <Loader2 className="mx-auto mt-4 h-6 w-6 animate-spin text-foreground/40" />
            ) : (
              <div className="mt-5 flex gap-2">
                <button onClick={() => setConfirming(false)} className="clay-chip flex-1 rounded-full py-3 text-sm font-bold text-foreground/70">
                  Keep going
                </button>
                <button onClick={() => void submit()} className="clay-btn flex-1 rounded-full py-3 text-sm font-bold text-white">
                  Submit
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DrillResultView({ result, onBack }: { result: DrillResult; onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = new Map(result.review.map((r) => [r.id, r]));
  const itemById = new Map(result.items.map((i) => [i.id, i]));
  const pct = result.maxScore > 0 ? Math.round((Math.max(0, result.score) / result.maxScore) * 100) : 0;
  const minutes = Math.floor(result.timeTakenSec / 60);
  const seconds = result.timeTakenSec % 60;
  const needRevision = result.wrong;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <div className="clay p-6 text-center sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Timed drill result</p>
        <p className="font-display mt-2 text-5xl font-bold text-foreground">
          {result.score}
          <span className="text-xl font-semibold text-foreground/40"> / {result.maxScore}</span>
        </p>
        <p className="mt-1 text-sm text-foreground/60">
          {pct}% · {minutes}m {String(seconds).padStart(2, "0")}s
        </p>
        <div className="mx-auto mt-5 grid max-w-xs grid-cols-3 gap-2 text-center">
          <Stat label="Correct" value={result.correct} cls="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Wrong" value={result.wrong} cls="text-destructive" />
          <Stat label="Skipped" value={result.skipped} cls="text-foreground/50" />
        </div>
        {needRevision > 0 && (
          <p className="mx-auto mt-4 max-w-sm text-xs text-foreground/60">
            Your {needRevision} wrong answer{needRevision === 1 ? " is" : "s are"} saved in your notebook — we'll bring {needRevision === 1 ? "it" : "them"} back in 2 days.
          </p>
        )}
      </div>

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-foreground/50">Review</p>
      <div className="space-y-2">
        {result.questions.map((q, i) => {
          const item = itemById.get(q.id);
          const key = byId.get(q.id);
          const open = openId === q.id;
          const tone = item?.outcome === "correct" ? "text-emerald-600 dark:text-emerald-400" : item?.outcome === "wrong" ? "text-destructive" : "text-foreground/40";
          return (
            <div key={q.id} className="clay-inset rounded-2xl">
              <button onClick={() => setOpenId(open ? null : q.id)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                <span className="w-6 shrink-0 text-sm font-bold text-foreground/60">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground/50">{q.subject} · {q.source.label}</span>
                  <span className={cn("block text-xs font-bold capitalize", tone)}>{item?.outcome ?? "skipped"}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-foreground/70">{item && item.outcome !== "skipped" ? (item.marks > 0 ? `+${item.marks}` : item.marks) : "—"}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              {open && key && (
                <div className="space-y-3 border-t border-border px-3.5 pb-3.5 pt-3">
                  <SmartContent value={q.body} className="text-sm leading-relaxed text-foreground" />
                  <p className="text-xs font-semibold text-foreground/60">
                    Correct answer: <span className="text-emerald-700 dark:text-emerald-300">{key.correctOption ?? key.correctAnswer}</span>
                  </p>
                  {key.solution && (
                    <div className="border-l-2 border-[var(--sky-deep)] pl-3">
                      <SmartContent value={key.solution} className="text-sm leading-relaxed text-foreground/80" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onBack} className="clay-btn mt-6 w-full rounded-full px-6 py-3 text-sm font-bold text-white sm:w-auto">
        Back to PYQs
      </button>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="clay-inset rounded-2xl px-2 py-3">
      <p className={cn("text-xl font-bold", cls)}>{value}</p>
      <p className="text-[11px] text-foreground/50">{label}</p>
    </div>
  );
}
