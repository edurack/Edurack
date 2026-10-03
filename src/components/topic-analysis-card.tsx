import { useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { AlertTriangle, ChevronDown, Lightbulb, Sparkles, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getTopicAnalysis } from "@/server-functions/test-results";
import type { ChapterStat, Priority, TopicAnalysis } from "@/lib/topic-analysis";
import { cn } from "@/lib/utils";

const PRIORITY: Record<Priority, { label: string; dot: string; bar: string; text: string }> = {
  high: { label: "Needs work", dot: "bg-destructive", bar: "bg-destructive", text: "text-destructive" },
  medium: { label: "Improve", dot: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  strong: { label: "Strong", dot: "bg-emerald-500", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

const SCROLL_ROW =
  "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

type Phase = "idle" | "loading" | "error" | "ready";

export function TopicAnalysisCard({ attemptId }: { attemptId: string }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TopicAnalysis | null>(null);

  async function run() {
    if (!user) return;
    setPhase("loading");
    setError(null);
    try {
      const token = await user.getIdToken();
      setData(await getTopicAnalysis({ data: { token, attemptId } }));
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse this attempt.");
      setPhase("error");
    }
  }

  return (
    <section className="clay mb-6 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="clay-inset grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
          <Target className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-foreground">Topic-wise analysis</p>
          <p className="mt-0.5 text-sm text-foreground/60">
            See exactly which chapters and topics cost you marks, and what to study first.
          </p>
        </div>
      </div>

      {phase === "idle" && (
        <button
          onClick={run}
          className="clay-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white sm:w-auto"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Analyse my topics
        </button>
      )}

      {phase === "loading" && (
        <div className="mt-4 space-y-2.5" aria-live="polite">
          <p className="inline-flex items-center gap-2 text-sm text-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking every question's chapter and topic…
          </p>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="clay-inset h-16 animate-pulse rounded-2xl bg-foreground/5" />
          ))}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm">
          <p className="text-foreground/80">{error}</p>
          <button onClick={run} className="mt-2 text-xs font-bold text-[var(--sky-deep)]">
            Try again
          </button>
        </div>
      )}

      {phase === "ready" && data && <AnalysisBody data={data} onHide={() => setPhase("idle")} />}
    </section>
  );
}

function AnalysisBody({ data, onHide }: { data: TopicAnalysis; onHide: () => void }) {
  const [subject, setSubject] = useState(data.subjects[0]?.subject ?? "");
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const current = data.subjects.find((s) => s.subject === subject);

  // Nothing is tagged yet (older tests) — say so instead of showing an empty chart.
  if (data.taggedCount === 0) {
    return (
      <div className="clay-inset mt-4 rounded-2xl px-4 py-5 text-sm text-foreground/70">
        <p className="font-semibold text-foreground">Topics aren't tagged on this test yet.</p>
        <p className="mt-1">
          The questions in this test don't have chapter/topic tags, so there's nothing to group by. Subject-wise
          results above are still accurate.
        </p>
        <button onClick={onHide} className="mt-3 text-xs font-bold text-[var(--sky-deep)]">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      <p className="text-xs text-foreground/50">
        Based on {data.taggedCount} of {data.totalCounted} counted questions
        {data.untaggedCount > 0 && ` (${data.untaggedCount} have no topic tag yet)`}.
      </p>

      {/* Focus first */}
      {data.focus.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">Focus on these first</p>
          <ol className="space-y-2.5">
            {data.focus.map((f, i) => (
              <li key={`${f.subject}-${f.chapter}`} className="clay-inset rounded-2xl p-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-bold text-foreground/70">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-foreground">{f.chapter}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-foreground/50">
                      {f.subject} · <span className="text-destructive">−{f.lostMarks} marks</span> · {f.scorePercent}% scored
                    </p>
                    {f.weakTopics.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.weakTopics.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-[var(--coral-soft)]/60 px-2.5 py-1 text-[11px] font-semibold text-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="clay-inset mt-4 rounded-2xl px-4 py-4 text-sm text-foreground/70">
          <p className="font-semibold text-foreground">No weak chapters in this attempt.</p>
          <p className="mt-0.5">Every tagged chapter is scoring 70% or more. Keep practising to stay sharp.</p>
        </div>
      )}

      {/* Easy-question slips */}
      {data.easyMissed.missed > 0 && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-3.5 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground/80">
            You missed <span className="font-bold">{data.easyMissed.missed}</span> of{" "}
            <span className="font-bold">{data.easyMissed.totalEasy}</span> Easy questions. These are usually careless
            slips, so slow down and re-read before you lock an answer.
          </p>
        </div>
      )}

      {/* Every chapter, by subject */}
      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">All chapters</p>
        <div className={SCROLL_ROW}>
          {data.subjects.map((s) => (
            <button
              key={s.subject}
              onClick={() => {
                setSubject(s.subject);
                setOpenChapter(null);
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200",
                subject === s.subject ? "clay-btn text-white" : "clay-chip text-foreground/70",
              )}
            >
              {s.subject}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {current?.chapters.map((c) => (
            <ChapterRow
              key={c.chapter}
              c={c}
              open={openChapter === c.chapter}
              onToggle={() => setOpenChapter(openChapter === c.chapter ? null : c.chapter)}
            />
          ))}
          {current && current.untaggedCount > 0 && (
            <p className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-foreground/40">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {current.untaggedCount} {subject} question{current.untaggedCount === 1 ? "" : "s"} not tagged with a chapter.
            </p>
          )}
        </div>
      </div>

      {/* Doing well */}
      {data.strong.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">You're doing well in</p>
          <div className="flex flex-wrap gap-2">
            {data.strong.map((s) => (
              <span
                key={`${s.subject}-${s.chapter}`}
                className="rounded-full bg-[var(--mint-soft)]/60 px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                {s.chapter} · {s.scorePercent}%
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onHide}
        className="mt-6 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/50 hover:bg-foreground/5"
      >
        Hide analysis
      </button>
    </div>
  );
}

function ChapterRow({ c, open, onToggle }: { c: ChapterStat; open: boolean; onToggle: () => void }) {
  const p = PRIORITY[c.priority];
  return (
    <div className="clay-inset rounded-2xl">
      <button onClick={onToggle} aria-expanded={open} className="w-full px-3.5 py-3 text-left">
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", p.dot)} aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-bold leading-snug text-foreground">{c.chapter}</p>
          <span className={cn("shrink-0 text-xs font-bold", p.text)}>{c.scorePercent}%</span>
          <ChevronDown
            className={cn("mt-0.5 h-4 w-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </div>
        <Bar percent={c.scorePercent} className={p.bar} />
        <p className="mt-1.5 text-[11px] text-foreground/50">
          {c.correct} of {c.total} correct
          {c.lostMarks > 0 && <> · lost {c.lostMarks} marks</>}
          <span className={cn("ml-1.5 font-semibold", p.text)}>· {p.label}</span>
        </p>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3.5 pb-3.5 pt-3">
          {c.topics.map((t) => {
            const tp = PRIORITY[t.scorePercent < 40 ? "high" : t.scorePercent < 70 ? "medium" : "strong"];
            return (
              <div key={t.topic}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-xs font-semibold text-foreground/80">{t.topic}</p>
                  <p className="shrink-0 text-[11px] text-foreground/50">
                    {t.correct}/{t.total}
                  </p>
                </div>
                <Bar percent={t.scorePercent} className={tp.bar} thin />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bar({ percent, className, thin }: { percent: number; className: string; thin?: boolean }) {
  return (
    <div className={cn("mt-2 overflow-hidden rounded-full bg-foreground/10", thin ? "h-1.5" : "h-2")}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", className)}
        style={{ width: `${Math.max(3, Math.min(100, percent))}%` }}
      />
    </div>
  );
}