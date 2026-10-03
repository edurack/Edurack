import { useState } from "react";
import { IconCircleCheck as CheckCircle2, IconCircleX as XCircle } from "@tabler/icons-react";
import { ChevronDown, Lightbulb, MinusCircle } from "lucide-react";
import { SmartContent } from "@/lib/smart-content";
import { cn } from "@/lib/utils";

export type OptionKey = "A" | "B" | "C" | "D";
export type QuestionType = "mcq" | "integer";

export type ReviewQuestion = {
  questionNo: number;
  subject: string;
  type: QuestionType;
  body: string;
  options?: Record<OptionKey, string>;
  solution: string;
  selectedOption: OptionKey | null;
  correctOption?: OptionKey;
  selectedAnswer: number | null;
  correctAnswer?: number;
  isCorrect: boolean;
  marksAwarded: number;
  /** Answered, but past the "attempt any N" limit — not graded. */
  ignored?: boolean;
  /** Unattempted question from an optional "any N of M" group — never part of the score. */
  optionalSkipped?: boolean;
};

type Status = "correct" | "incorrect" | "skipped" | "ignored" | "optional";
type StatusFilter = "all" | "incorrect" | "skipped" | "correct" | "optional";

function getStatus(q: ReviewQuestion): Status {
  if (q.optionalSkipped) return "optional";
  if (q.ignored) return "ignored";
  if (q.isCorrect) return "correct";
  const hasAnswer = q.type === "mcq" ? Boolean(q.selectedOption) : q.selectedAnswer !== null;
  return hasAnswer ? "incorrect" : "skipped";
}

const STATUS_META: Record<
  Status,
  { label: string; Icon: typeof CheckCircle2; iconClass: string; paletteClass: string }
> = {
  correct: {
    label: "Correct",
    Icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    paletteClass: "border-emerald-500/50 bg-[var(--mint-soft)] text-foreground",
  },
  incorrect: {
    label: "Incorrect",
    Icon: XCircle,
    iconClass: "text-destructive",
    paletteClass: "border-destructive/50 bg-[var(--coral-soft)] text-foreground",
  },
  skipped: {
    label: "Skipped",
    Icon: MinusCircle,
    iconClass: "text-foreground/40",
    paletteClass: "border-border bg-transparent text-foreground/60",
  },
  ignored: {
    label: "Over the limit · not counted",
    Icon: MinusCircle,
    iconClass: "text-foreground/40",
    paletteClass: "border-dashed border-border bg-transparent text-foreground/40",
  },
  optional: {
    label: "Optional · not counted",
    Icon: MinusCircle,
    iconClass: "text-foreground/30",
    paletteClass: "border-dashed border-border bg-transparent text-foreground/30",
  },
};

const keyOf = (q: ReviewQuestion) => `${q.subject}-${q.questionNo}`;
const domIdOf = (q: ReviewQuestion) => `review-q-${keyOf(q).replace(/[^a-zA-Z0-9]+/g, "-")}`;

// Horizontal single-row scroller used for filter chips so they never wrap
// into 3-4 rows on a narrow phone.
const SCROLL_ROW =
  "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function QuestionReview({
  review,
  subjects,
  countedQuestions,
}: {
  review: ReviewQuestion[] | null;
  subjects: string[];
  /** How many questions the score is out of (excludes optional ones). */
  countedQuestions?: number;
}) {
  const [subjectFilter, setSubjectFilter] = useState("All");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Desktop keeps the original "everything open" behaviour; phones start
  // collapsed so a 90-question test isn't a 40-screen scroll. This component
  // only mounts after the result has loaded on the client, so reading
  // matchMedia in the initialiser can't cause a hydration mismatch.
  const [defaultOpen, setDefaultOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Optional questions (never attempted, or answered past the limit) aren't in
  // the score, but their solutions are still worth reading — so they are
  // listed like any other question, just labelled "not counted".
  const isNotCounted = (q: ReviewQuestion) => getStatus(q) === "optional" || getStatus(q) === "ignored";
  const bySubject = (review ?? []).filter((q) => subjectFilter === "All" || q.subject === subjectFilter);
  const counts = {
    all: bySubject.length,
    optional: bySubject.filter(isNotCounted).length,
    incorrect: bySubject.filter((q) => getStatus(q) === "incorrect").length,
    skipped: bySubject.filter((q) => getStatus(q) === "skipped").length,
    correct: bySubject.filter((q) => getStatus(q) === "correct").length,
  };
  const visible = bySubject.filter((q) =>
    statusFilter === "all" ? true : statusFilter === "optional" ? isNotCounted(q) : getStatus(q) === statusFilter,
  );

  const isOpen = (q: ReviewQuestion) => overrides[keyOf(q)] ?? defaultOpen;
  const allOpen = visible.length > 0 && visible.every(isOpen);

  function toggle(q: ReviewQuestion) {
    setOverrides((prev) => ({ ...prev, [keyOf(q)]: !isOpen(q) }));
  }

  function setAll(open: boolean) {
    setDefaultOpen(open);
    setOverrides({});
  }

  function jumpTo(q: ReviewQuestion) {
    setOverrides((prev) => ({ ...prev, [keyOf(q)]: true }));
    requestAnimationFrame(() => {
      document.getElementById(domIdOf(q))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const statusChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "incorrect", label: "Wrong", count: counts.incorrect },
    { id: "skipped", label: "Skipped", count: counts.skipped },
    { id: "correct", label: "Right", count: counts.correct },
    ...(counts.optional > 0 ? [{ id: "optional" as const, label: "Optional", count: counts.optional }] : []),
  ];

  return (
    // Card chrome only from sm up. On a phone the extra border + padding of an
    // outer card just steals width from the question text.
    <section id="question-review" className="scroll-mt-20 sm:clay sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Question review</p>
      {countedQuestions !== undefined && (
        <p className="mb-3 mt-0.5 text-xs text-foreground/40">
          {countedQuestions} questions counted in your score
          {counts.optional > 0 && ` · ${counts.optional} optional shown for practice`}
        </p>
      )}
      {countedQuestions === undefined && <div className="mb-3" />}

      {/* Filters */}
      <div className="space-y-2">
        {subjects.length > 0 && (
          <div className={SCROLL_ROW}>
            {["All", ...subjects].map((s) => (
              <Chip key={s} active={subjectFilter === s} onClick={() => setSubjectFilter(s)}>
                {s}
              </Chip>
            ))}
          </div>
        )}
        <div className={SCROLL_ROW}>
          {statusChips.map((c) => (
            <Chip key={c.id} active={statusFilter === c.id} onClick={() => setStatusFilter(c.id)}>
              {c.label} <span className="opacity-70">({c.count})</span>
            </Chip>
          ))}
        </div>
      </div>

      {review === null ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="clay-inset h-16 animate-pulse rounded-2xl bg-foreground/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="clay-inset mt-4 rounded-2xl px-4 py-8 text-center text-sm text-foreground/50">
          No questions match these filters.
        </div>
      ) : (
        <>
          {/* Question palette — tap a number to jump straight to it. */}
          <div className="clay-inset mt-4 rounded-2xl p-3">
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {visible.map((q) => (
                <button
                  key={keyOf(q)}
                  onClick={() => jumpTo(q)}
                  aria-label={`Question ${q.questionNo}, ${STATUS_META[getStatus(q)].label}`}
                  className={cn(
                    "aspect-square rounded-lg border text-xs font-bold transition-transform active:scale-95",
                    STATUS_META[getStatus(q)].paletteClass,
                  )}
                >
                  {q.questionNo}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-foreground/50">
              <Legend className="bg-[var(--mint-soft)] border-emerald-500/50" label="Correct" />
              <Legend className="bg-[var(--coral-soft)] border-destructive/50" label="Incorrect" />
              <Legend className="border-border" label="Skipped" />
              {counts.optional > 0 && <Legend className="border-dashed border-border" label="Optional (not counted)" />}
            </div>
          </div>

          <div className="mb-2 mt-4 flex items-center justify-between">
            <span className="text-xs text-foreground/50">
              Showing {visible.length} of {review.length}
            </span>
            <button
              onClick={() => setAll(!allOpen)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:bg-foreground/5"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <div className="space-y-2.5">
            {visible.map((q) => (
              <ReviewItem key={keyOf(q)} q={q} open={isOpen(q)} onToggle={() => toggle(q)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ReviewItem({ q, open, onToggle }: { q: ReviewQuestion; open: boolean; onToggle: () => void }) {
  const [solutionOpen, setSolutionOpen] = useState(true);
  const status = getStatus(q);
  const { Icon, iconClass, label } = STATUS_META[status];
  const notCounted = q.ignored || q.optionalSkipped;
  const marksText = notCounted ? "—" : `${q.marksAwarded > 0 ? "+" : ""}${q.marksAwarded}`;

  return (
    <div id={domIdOf(q)} className="clay-inset scroll-mt-20 rounded-2xl">
      {/* Header — the whole row is the tap target (≥44px tall). */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-3 text-left sm:px-4"
      >
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-foreground">
            Q{q.questionNo}
            <span className="truncate text-xs font-semibold text-foreground/50">{q.subject}</span>
          </p>
          <p className={cn("text-[11px] font-semibold", iconClass)}>{label}</p>
          {!open && (
            <div className="mt-1 line-clamp-2 text-xs text-foreground/60 [&_img]:hidden">
              <SmartContent value={q.body} />
            </div>
          )}
        </div>
        <span className="mt-0.5 shrink-0 text-sm font-bold text-foreground/70">{marksText}</span>
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4">
          {notCounted && (
            <p className="mb-3 rounded-lg bg-foreground/5 px-3 py-2 text-xs text-foreground/60">
              {q.optionalSkipped
                ? "Optional question — you didn't need to attempt it, so it isn't counted in your score. Its solution is here to learn from."
                : "Not counted — you answered more questions in this group than the attempt limit allows."}
            </p>
          )}

          <SmartContent value={q.body} className="mb-3 text-sm leading-relaxed text-foreground" />

          {q.type === "mcq" ? (
            <div className="space-y-2">
              {(["A", "B", "C", "D"] as const).map((opt) => {
                const isSelected = q.selectedOption === opt;
                const isCorrectOpt = q.correctOption === opt;
                const tag = isCorrectOpt
                  ? isSelected
                    ? "Your answer · Correct"
                    : "Correct answer"
                  : isSelected
                    ? "Your answer"
                    : null;
                return (
                  <div
                    key={opt}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border px-2.5 py-2 text-sm",
                      isCorrectOpt
                        ? "border-emerald-500/40 bg-[var(--mint-soft)]/50"
                        : isSelected
                          ? "border-destructive/40 bg-[var(--coral-soft)]/50"
                          : "border-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                        isCorrectOpt
                          ? "bg-emerald-600 text-white"
                          : isSelected
                            ? "bg-destructive text-white"
                            : "bg-foreground/10 text-foreground/60",
                      )}
                    >
                      {opt}
                    </span>
                    {/* min-w-0 is load-bearing: without it a wide diagram or
                        long unbroken string pushes the row wider than the card. */}
                    <div className="min-w-0 flex-1">
                      <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                      {tag && (
                        <p
                          className={cn(
                            "mt-1 text-[11px] font-bold",
                            isCorrectOpt ? "text-emerald-700 dark:text-emerald-300" : "text-destructive",
                          )}
                        >
                          {tag}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  q.selectedAnswer === null
                    ? "border-border"
                    : q.isCorrect
                      ? "border-emerald-500/40 bg-[var(--mint-soft)]/50"
                      : "border-destructive/40 bg-[var(--coral-soft)]/50",
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/50">Your answer</p>
                <p className="text-base font-bold text-foreground">{q.selectedAnswer ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-[var(--mint-soft)]/50 px-3 py-2 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/50">Correct answer</p>
                <p className="text-base font-bold text-foreground">{q.correctAnswer}</p>
              </div>
            </div>
          )}

          {q.solution && (
            <div className="mt-3">
              <button
                onClick={() => setSolutionOpen((o) => !o)}
                aria-expanded={solutionOpen}
                className="flex w-full items-center justify-between rounded-xl bg-[var(--sky-soft)]/60 px-3 py-2.5 text-left"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground/70">
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                  Solution
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-foreground/50 transition-transform", solutionOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {solutionOpen && (
                <div className="mt-2 border-l-2 border-[var(--sky-deep)] pl-3">
                  <SmartContent value={q.solution} className="text-sm leading-relaxed text-foreground/80" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200",
        active ? "clay-btn text-white" : "clay-chip text-foreground/70",
      )}
    >
      {children}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2.5 w-2.5 rounded-sm border", className)} />
      {label}
    </span>
  );
}

export type RecurringMistakeData = {
  questionNo: number;
  subject: string;
  body: string;
  type: QuestionType;
  correctOption?: OptionKey;
  correctAnswer?: number;
  solution: string;
  wrongCount: number;
  totalSeen: number;
};

// Same collapsible pattern as ReviewItem, for the analysis page's
// "Questions you keep getting wrong" list.
export function RecurringMistakeCard({ q }: { q: RecurringMistakeData }) {
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );
  const [solutionOpen, setSolutionOpen] = useState(true);
  const missRate = Math.round((q.wrongCount / Math.max(1, q.totalSeen)) * 100);
  const correct = q.type === "mcq" ? q.correctOption : q.correctAnswer;

  return (
    <div className="clay-inset rounded-2xl">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-3 text-left sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-foreground">
            Q{q.questionNo}
            <span className="truncate text-xs font-semibold text-foreground/50">{q.subject}</span>
          </p>
          <p className="text-[11px] font-semibold text-destructive">
            Wrong {q.wrongCount} of {q.totalSeen} · {missRate}%
          </p>
          {!open && (
            <div className="mt-1 line-clamp-2 text-xs text-foreground/60 [&_img]:hidden">
              <SmartContent value={q.body} />
            </div>
          )}
        </div>
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4">
          <SmartContent value={q.body} className="mb-3 text-sm leading-relaxed text-foreground" />

          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-[var(--mint-soft)]/50 px-3 py-2 text-sm">
            <span className="text-[10px] font-bold uppercase tracking-wide text-foreground/50">Correct answer</span>
            <span className="text-base font-bold text-foreground">{correct}</span>
          </div>

          {q.solution && (
            <div className="mt-3">
              <button
                onClick={() => setSolutionOpen((o) => !o)}
                aria-expanded={solutionOpen}
                className="flex w-full items-center justify-between rounded-xl bg-[var(--sky-soft)]/60 px-3 py-2.5 text-left"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground/70">
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                  Solution
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-foreground/50 transition-transform", solutionOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {solutionOpen && (
                <div className="mt-2 border-l-2 border-[var(--sky-deep)] pl-3">
                  <SmartContent value={q.solution} className="text-sm leading-relaxed text-foreground/80" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}