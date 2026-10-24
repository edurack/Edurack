// "Your performance": practice numbers (NEET and JEE kept apart) plus mock-test scores, from ONE source
// (getPracticeStats + the test-series summary), with real empty states instead of zeros or negative scores.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { defaultExamTab, EMPTY_EXAM_STATS, summariseTests, type BatchPerf, type PracticeStats } from "@/lib/practice-stats";

type Tab = "neet" | "jee";
const TABS: { key: Tab; label: string }[] = [
  { key: "neet", label: "NEET" },
  { key: "jee", label: "JEE" },
];

function Cell({ label, value, hint, to, search, tone }: { label: string; value: string; hint?: string; to?: "/pyq"; search?: Record<string, unknown>; tone?: "attention" }) {
  const body = (
    <>
      <p className={cn("font-display text-2xl font-extrabold leading-none tracking-tight tabular-nums sm:text-3xl", value === "—" && "text-muted-foreground/60", tone === "attention" && "text-amber-600 dark:text-amber-400")}>{value}</p>
      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
    </>
  );
  const cls = "min-w-0 rounded-2xl bg-secondary/60 p-3.5";
  return to ? (
    <Link to={to} search={search} className={cn(cls, "transition-colors hover:bg-secondary")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function PracticePerformanceCard({
  stats,
  failed,
  onRetry,
  targetExam,
  tests,
  className,
}: {
  stats: PracticeStats | null;
  failed: boolean;
  onRetry: () => void;
  targetExam: string | null | undefined;
  /** Test-series performance (already floored at 0%); null while loading. */
  tests: BatchPerf[] | null;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab | null>(null);
  // Open on the exam they actually practise most (or their target exam), once the numbers are in; never override a manual pick.
  useEffect(() => {
    if (stats && tab === null) setTab(defaultExamTab(stats, targetExam));
  }, [stats, targetExam, tab]);

  const shell = cn("min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-6", className);

  if (!stats && !failed) {
    return (
      <section aria-label="Your performance" className={shell}>
        <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />)}</div>
      </section>
    );
  }
  if (!stats) {
    return (
      <section aria-label="Your performance" className={shell}>
        <h2 className="font-display text-base font-extrabold tracking-tight">Your performance</h2>
        <p className="mt-2 text-sm text-muted-foreground">We couldn't load your numbers just now. <button type="button" onClick={onRetry} className="font-bold text-primary hover:underline">Try again</button></p>
      </section>
    );
  }

  const exam: Tab = tab ?? "neet";
  const label = exam === "jee" ? "JEE" : "NEET";
  const s = stats.byExam[exam] ?? EMPTY_EXAM_STATS;
  const hasPractice = s.solved > 0;
  const mock = summariseTests(tests, exam);
  const dash = "—";
  const approx = stats.approximate && hasPractice;

  return (
    <section aria-label="Your performance" className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-extrabold tracking-tight">Your performance</h2>
        <div role="tablist" aria-label="Exam" className="inline-flex rounded-full border border-border p-0.5">
          {TABS.map((t) => (
            <button key={t.key} role="tab" type="button" aria-selected={exam === t.key} onClick={() => setTab(t.key)} className={cn("min-h-9 rounded-full px-4 text-xs font-bold transition-colors", exam === t.key ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cell label="Questions solved" value={hasPractice ? s.solved.toLocaleString("en-IN") : dash} />
        <Cell label="Accuracy" value={s.accuracy === null ? dash : `${s.accuracy}%`} hint={hasPractice ? `${s.correct} of ${s.solved} right` : undefined} />
        <Cell label="This week" value={hasPractice ? s.weekAnswered.toLocaleString("en-IN") : dash} hint={approx ? "estimate" : "last 7 days"} />
        <Cell
          label="Mistakes to revise"
          value={hasPractice || s.due > 0 ? String(s.due) : dash}
          hint={s.due > 0 ? "due now · tap to revise" : hasPractice ? "all clear" : undefined}
          tone={s.due > 0 ? "attention" : undefined}
          to={s.due > 0 ? "/pyq" : undefined}
          search={s.due > 0 ? { practice: true, session: "due" } : undefined}
        />
        <div className="col-span-2 sm:col-span-1">
          <Cell label="Practice days" value={hasPractice ? String(s.distinctDays) : dash} hint={approx ? "estimate" : undefined} />
        </div>
      </div>

      {!hasPractice && (
        <p className="mt-3 text-sm text-muted-foreground">
          {stats.questionsAnswered > 0 ? `No ${label} practice yet. Switch the tab above to see your other exam.` : `Solve your first ${label} question and your numbers show up here.`}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3 text-sm">
        {mock ? (
          <p className="text-muted-foreground">
            <span className="font-bold text-foreground">{label} mock tests</span> · average <b className="text-foreground">{mock.average}%</b> · best <b className="text-foreground">{mock.best}%</b> · {mock.attempts} attempt{mock.attempts === 1 ? "" : "s"} across {mock.tests} test{mock.tests === 1 ? "" : "s"}
          </p>
        ) : (
          <p className="text-muted-foreground">{tests === null ? "Checking your mock tests…" : `No ${label} mock tests attempted yet.`}</p>
        )}
      </div>
    </section>
  );
}
