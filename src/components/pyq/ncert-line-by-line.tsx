// NCERT Line by Line: browse Subject → Chapter → Topic, then practise with
// instant feedback. A trimmed-down sibling of PyqBrowser + PyqPractice for
// the NEW, separate NCERT question bank (no sessions, no weak-topics mix, no
// guest preview — this section is for signed-in students only, and only
// once the admin has made it visible to them; see ncert-line-practice.ts).
import { useEffect, useMemo, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { ChevronDown, ChevronLeft, ChevronRight, Lightbulb, Play } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SmartContent } from "@/lib/smart-content";
import { getNcertTree, listNcertQuestions, submitNcertAnswer } from "@/server-functions/ncert-line-practice";
import type { NcertCheckResult, NcertQuestion, NcertStatus, NcertTree } from "@/lib/ncert-line-types";
import { cn } from "@/lib/utils";

type Nav = { subject?: string; chapter?: string; topic?: string; practice?: boolean };
const OPTIONS = ["A", "B", "C", "D"] as const;

export function NcertLineByLine({ onExit }: { onExit: () => void }) {
  const { user } = useAuth();
  const [tree, setTree] = useState<NcertTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({});

  const load = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      setTree(await getNcertTree({ data: { token } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load NCERT Line by Line.");
    }
  };
  useEffect(() => { void load(); }, [user]);

  if (error) {
    return (
      <div className="clay p-6 text-center text-sm text-foreground/70">
        <p>{error}</p>
        <button onClick={onExit} className="mt-3 text-xs font-bold text-[var(--sky-deep)]">Go back</button>
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="h-8 w-48 animate-pulse rounded-full bg-foreground/10" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="clay-inset h-24 animate-pulse rounded-2xl bg-foreground/5" />)}
        </div>
      </div>
    );
  }

  if (nav.practice && nav.subject && nav.chapter) {
    return (
      <NcertPractice
        subject={nav.subject}
        chapter={nav.chapter}
        topic={nav.topic}
        onExit={() => {
          setNav({ subject: nav.subject, chapter: nav.chapter });
          void load();
        }}
      />
    );
  }

  return <Browser tree={tree} nav={nav} onNavigate={setNav} onBack={onExit} />;
}

function Browser({ tree, nav, onNavigate, onBack }: { tree: NcertTree; nav: Nav; onNavigate: (n: Nav) => void; onBack: () => void }) {
  const subjectNode = tree.subjects.find((s) => s.subject === nav.subject);
  const chapterNode = subjectNode?.chapters.find((c) => c.chapter === nav.chapter);

  const crumbs = [
    { label: "NCERT Line by Line", nav: {} as Nav },
    ...(subjectNode ? [{ label: subjectNode.subject, nav: { subject: subjectNode.subject } as Nav }] : []),
    ...(chapterNode ? [{ label: chapterNode.chapter, nav: { subject: nav.subject, chapter: chapterNode.chapter } as Nav }] : []),
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <nav aria-label="Breadcrumb" className="-mx-1 mb-4 flex items-center gap-1 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={onBack} className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 font-semibold text-foreground/50 hover:bg-foreground/5 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> PYQ Practice
        </button>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${i}-${c.label}`} className="inline-flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 text-foreground/30" aria-hidden />
              <button onClick={() => !last && onNavigate(c.nav)} disabled={last} className={cn("max-w-[11rem] truncate rounded-full px-2.5 py-1.5 font-semibold", last ? "bg-foreground/5 text-foreground" : "text-foreground/50 hover:bg-foreground/5 hover:text-foreground")}>
                {c.label}
              </button>
            </span>
          );
        })}
      </nav>

      {!subjectNode && (
        <>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">NCERT Line by Line</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {tree.totalQuestions > 0 ? <>{tree.totalQuestions} questions, straight from NCERT · <span className="font-semibold text-foreground">{tree.totalCorrect}</span> solved</> : "Topic-by-topic questions, straight from NCERT."}
          </p>
          {tree.subjects.length === 0 ? (
            <div className="clay mt-4 p-8 text-center text-sm text-foreground/60">Nothing uploaded yet — check back soon.</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {tree.subjects.map((s) => (
                <Row key={s.subject} big title={s.subject} meta={`${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"} · ${s.count} questions`} count={s.count} correct={s.correct} onClick={() => onNavigate({ subject: s.subject })} />
              ))}
            </div>
          )}
        </>
      )}

      {subjectNode && !chapterNode && (
        <>
          <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">{subjectNode.subject}</h1>
          <p className="mt-1 text-sm text-foreground/60">{subjectNode.chapters.length} chapters · {subjectNode.count} questions</p>
          <div className="mt-4 space-y-2.5">
            {subjectNode.chapters.map((c) => (
              <Row key={c.chapter} title={c.chapter} meta={`Class ${c.classLevel} · ${c.count} question${c.count === 1 ? "" : "s"} · ${c.topics.length} topics`} count={c.count} correct={c.correct} onClick={() => onNavigate({ subject: nav.subject, chapter: c.chapter })} />
            ))}
          </div>
        </>
      )}

      {subjectNode && chapterNode && (
        <>
          <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">{chapterNode.chapter}</h1>
          <p className="mt-1 text-sm text-foreground/60">{subjectNode.subject} · Class {chapterNode.classLevel} · {chapterNode.count} questions</p>
          <button onClick={() => onNavigate({ subject: nav.subject, chapter: nav.chapter, practice: true })} className="clay-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold text-white sm:w-auto">
            <Play className="h-4 w-4" aria-hidden /> Practice all {chapterNode.count} questions
          </button>
          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-foreground/50">Or pick a topic</p>
          <div className="space-y-2.5">
            {chapterNode.topics.map((t) => (
              <Row key={t.topic} title={t.topic} meta={`${t.count} question${t.count === 1 ? "" : "s"}`} count={t.count} correct={t.correct} onClick={() => onNavigate({ subject: nav.subject, chapter: nav.chapter, topic: t.topic, practice: true })} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ title, meta, count, correct, onClick, big }: { title: string; meta: string; count: number; correct: number; onClick: () => void; big?: boolean }) {
  const pct = count > 0 ? Math.round((correct / count) * 100) : 0;
  return (
    <button onClick={onClick} className={cn("clay-inset w-full rounded-2xl text-left transition-transform duration-150 active:scale-[0.99]", big ? "p-4 sm:p-5" : "px-4 py-3.5")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold leading-snug text-foreground", big ? "font-display text-lg" : "text-sm")}>{title}</p>
          <p className="mt-0.5 text-xs text-foreground/50">{meta}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-foreground/60">{pct}%</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" aria-hidden />
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${correct > 0 ? Math.max(3, pct) : 0}%` }} />
      </div>
    </button>
  );
}

// ─── Practice loop ──────────────────────────────────────────────────────────
type Local = NcertCheckResult & { chosenOption?: (typeof OPTIONS)[number]; chosenValue?: number };

function NcertPractice({ subject, chapter, topic, onExit }: { subject: string; chapter: string; topic?: string; onExit: () => void }) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<NcertQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<string, (typeof OPTIONS)[number] | undefined>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Local>>({});
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await listNcertQuestions({ data: { token, subject, chapter, topic } });
        if (!cancelled) setQuestions(res.questions);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load questions.");
      }
    })();
    return () => { cancelled = true; };
  }, [user, subject, chapter, topic]);

  const q = questions?.[idx];
  const result = q ? results[q.id] : undefined;
  const canCheck = useMemo(() => {
    if (!q || result) return false;
    if (q.type === "mcq") return Boolean(picked[q.id]);
    const n = Number(typed[q.id]);
    return (typed[q.id] ?? "").trim() !== "" && Number.isFinite(n);
  }, [q, result, picked, typed]);

  async function send(answer: { option?: (typeof OPTIONS)[number]; value?: number } | null) {
    if (!user || !q || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const token = await user.getIdToken();
      const res = await submitNcertAnswer({ data: { token, questionId: q.id, answer } });
      setResults((r) => ({ ...r, [q.id]: { ...res, chosenOption: answer?.option, chosenValue: answer?.value } }));
      setQuestions((qs) => qs?.map((x) => (x.id === q.id ? { ...x, status: res.status as NcertStatus } : x)) ?? qs);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function check() {
    if (!q) return;
    void send(q.type === "mcq" ? { option: picked[q.id] } : { value: Number(typed[q.id]) });
  }

  const atEnd = questions ? idx >= questions.length - 1 : true;
  function next() {
    if (atEnd) setFinished(true);
    else setIdx((i) => i + 1);
  }

  if (loadError) {
    return (
      <div className="clay p-6 text-center text-sm text-foreground/70">
        <p>{loadError}</p>
        <button onClick={onExit} className="mt-3 text-xs font-bold text-[var(--sky-deep)]">Go back</button>
      </div>
    );
  }

  if (finished) {
    const all = Object.values(results);
    const correct = all.filter((r) => !r.revealed && r.isCorrect).length;
    const answered = all.filter((r) => !r.revealed).length;
    return (
      <div className="clay animate-in fade-in p-6 text-center duration-300 motion-reduce:animate-none sm:p-8">
        <p className="font-display text-xl font-bold text-foreground sm:text-2xl">Nice work!</p>
        <p className="mt-2 text-sm font-semibold text-foreground/70">{answered > 0 ? `You got ${correct} of ${answered} right.` : "Session finished."}</p>
        <button onClick={onExit} className="clay-btn mt-6 inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-bold text-white">Back to topics</button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onExit} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-foreground/5 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{topic ? `${chapter} · ${topic}` : chapter}</p>
          <p className="truncate text-[11px] text-foreground/50">{subject} · NCERT Line by Line</p>
        </div>
      </div>

      {questions === null ? (
        <div className="clay h-72 animate-pulse bg-foreground/5" />
      ) : !q ? (
        <div className="clay p-8 text-center">
          <p className="font-semibold text-foreground">No questions here yet.</p>
          <button onClick={onExit} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white">Back</button>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-foreground/50">
              <span className="font-semibold text-foreground/70">Question {idx + 1} of {questions.length}</span>
              <span className={cn("font-bold", q.difficulty === "Easy" ? "text-emerald-600" : q.difficulty === "Hard" ? "text-destructive" : "text-amber-600")}>{q.difficulty}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full bg-[var(--sky-deep)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
            </div>
          </div>

          <article key={q.id} className="clay p-4 animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none sm:p-6">
            <p className="inline-flex max-w-full rounded-full bg-[var(--sky-soft)] px-3 py-1 text-[11px] font-bold uppercase leading-snug tracking-wide text-foreground">NCERT · {q.topic}</p>
            <SmartContent value={q.body} className="mt-4 text-[15px] leading-relaxed text-foreground" />

            {q.type === "mcq" ? (
              <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
                {OPTIONS.map((opt) => {
                  const chosen = result ? result.chosenOption === opt : picked[q.id] === opt;
                  const isCorrect = result?.correctOption === opt;
                  const isWrongChoice = Boolean(result) && chosen && !isCorrect;
                  return (
                    <button
                      key={opt}
                      role="radio"
                      aria-checked={chosen}
                      disabled={Boolean(result) || busy}
                      onClick={() => setPicked((p) => ({ ...p, [q.id]: opt }))}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-colors duration-150",
                        isCorrect ? "border-emerald-500/50 bg-[var(--mint-soft)]/60" : isWrongChoice ? "border-destructive/50 bg-[var(--coral-soft)]/60" : chosen ? "border-[var(--sky-deep)] bg-[var(--sky-soft)]/50" : "border-transparent bg-foreground/[0.04] hover:bg-foreground/[0.07]",
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", isCorrect ? "bg-emerald-600 text-white" : isWrongChoice ? "bg-destructive text-white" : chosen ? "bg-[var(--sky-deep)] text-white" : "bg-foreground/10 text-foreground/60")}>{opt}</span>
                      <div className="min-w-0 flex-1">
                        <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                        {isCorrect && <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Correct answer</p>}
                        {isWrongChoice && <p className="mt-1 text-[11px] font-bold text-destructive">Your answer</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4">
                <label htmlFor={`ncert-ans-${q.id}`} className="mb-1.5 block text-xs font-semibold text-foreground/60">Your answer (numerical)</label>
                <input
                  id={`ncert-ans-${q.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={Boolean(result)}
                  value={result ? String(result.chosenValue ?? "") : typed[q.id] ?? ""}
                  onChange={(e) => { const v = e.target.value; if (/^-?\d*\.?\d*$/.test(v)) setTyped((t) => ({ ...t, [q.id]: v })); }}
                  placeholder="e.g. 12 or -3.5"
                  className={cn("clay-inset min-w-0 w-full rounded-2xl border px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-[var(--sky-deep)]", result ? (result.isCorrect ? "border-emerald-500/50" : "border-destructive/50") : "border-transparent")}
                />
                {result && !result.isCorrect && <p className="mt-2 text-xs font-semibold text-foreground/60">Correct answer: <span className="text-emerald-700 dark:text-emerald-300">{result.correctAnswer}</span></p>}
              </div>
            )}

            {result && (
              <div className="mt-4 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
                {!result.revealed && (
                  <p className={cn("rounded-2xl px-3.5 py-2.5 text-sm font-bold", result.isCorrect ? "bg-[var(--mint-soft)]/60 text-emerald-800 dark:text-emerald-200" : "bg-[var(--coral-soft)]/60 text-destructive")} role="status">
                    {result.isCorrect ? "Correct! Nice work." : "Not quite — read the solution below."}
                  </p>
                )}
                {result.solution && <Solution text={result.solution} />}
              </div>
            )}

            {!result && (
              <button onClick={() => void send(null)} disabled={busy} className="mt-4 text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
                I give up — show the solution
              </button>
            )}
            {actionError && <p className="mt-3 text-xs font-semibold text-destructive">{actionError}</p>}
          </article>

          <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-2 rounded-full bg-background/80 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous question" className="clay-chip grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70 disabled:opacity-40">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            {result ? (
              <button onClick={next} className="clay-btn h-11 flex-1 rounded-full px-5 text-sm font-bold text-white">{atEnd ? "Finish" : "Next question"}</button>
            ) : (
              <button onClick={check} disabled={!canCheck || busy} className="clay-btn inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Check answer
              </button>
            )}
            {!result && (
              <button onClick={next} aria-label={atEnd ? "Finish without answering" : "Skip question"} className="clay-chip grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/70">
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Solution({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between rounded-xl bg-[var(--sky-soft)]/60 px-3 py-2.5 text-left">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground/70"><Lightbulb className="h-3.5 w-3.5" aria-hidden /> Solution</span>
        <ChevronDown className={cn("h-4 w-4 text-foreground/50 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="mt-2 border-l-2 border-[var(--sky-deep)] pl-3"><SmartContent value={text} className="text-sm leading-relaxed text-foreground/80" /></div>}
    </div>
  );
}
