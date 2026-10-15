// The three interactive calculators. All maths is client-side (lib/neet-rank-data.ts); nothing is sent anywhere.
import { useMemo, useState } from "react";
import {
  MAX_MARKS, QUALIFYING_2025, RANK_YEARS, TOTAL_QUESTIONS, YEAR_INFO, attemptPlans, estimateAll, formatRank, marksForRank, percentileFor, subjectSplit, type RankYear,
} from "@/lib/neet-rank-data";
import { Field, PracticeCta, ShareButton, inputCls } from "@/components/tools/tool-shell";
import { cn } from "@/lib/utils";

const Disclaimer = () => (
  <p className="mt-4 text-xs leading-relaxed text-foreground/50">
    Estimates only. They come from the marks-vs-rank bands published after NEET UG 2023, 2024 and 2025, with ranks interpolated between published points. Your real rank depends on how hard that year's paper is
    and how everyone scores, and category ranks differ from AIR.
  </p>
);

function clampMarks(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(-180, Math.min(MAX_MARKS, Math.round(n)));
}

function edgeNote(edge: "above" | "below" | null, year: RankYear) {
  if (edge === "above") return `Higher than the ${year} topper (${YEAR_INFO[year].topMarks}), so rank 1`;
  if (edge === "below") return `Below the lowest published ${year} band`;
  return null;
}

// ── Rank predictor ───────────────────────────────────────────────────────
export function RankPredictor() {
  const [raw, setRaw] = useState("600");
  const marks = clampMarks(raw);
  const est = useMemo(() => (marks === null ? null : estimateAll(marks)), [marks]);
  const ranks = est?.map((e) => e.rank) ?? [];
  const lo = ranks.length ? Math.min(...ranks) : 0;
  const hi = ranks.length ? Math.max(...ranks) : 0;

  return (
    <div>
      <div className="clay rounded-3xl p-5 sm:p-6">
        <Field label="Your NEET marks (out of 720)" hint="Use your expected score from a mock test, or your actual NEET marks.">
          <input inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} className={inputCls} placeholder="e.g. 600" />
        </Field>
        <input type="range" min={100} max={720} value={marks ?? 100} onChange={(e) => setRaw(e.target.value)} className="mt-4 w-full accent-[var(--primary)]" aria-label="Marks slider" />
      </div>

      {est && marks !== null && (
        <div className="mt-5" aria-live="polite">
          <div className="ink-section rounded-3xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Expected AIR for {marks} marks</p>
            <p className="font-display mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
              {lo === hi ? formatRank(lo) : `${formatRank(lo)} – ${formatRank(hi)}`}
            </p>
            <p className="mt-2 text-sm text-white/65">The range across the last three NEET papers. The most recent paper (2025) puts you near AIR {formatRank(est[0].rank)}.</p>
            <ShareButton className="mt-4 !border-white/25 !text-white" text={`I'm checking my NEET rank on Edurack: ${marks} marks ≈ AIR ${formatRank(lo)} to ${formatRank(hi)}.`} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {est.map((e) => (
              <div key={e.year} className="clay-inset rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">If it were like NEET {e.year}</p>
                <p className="font-display mt-1 text-2xl font-bold">AIR {formatRank(e.rank)}</p>
                <p className="text-xs text-foreground/60">{e.percentile}th percentile</p>
                <p className="mt-2 text-[11px] leading-snug text-foreground/50">{edgeNote(e.edge, e.year) ?? YEAR_INFO[e.year].note}</p>
              </div>
            ))}
          </div>
          <Disclaimer />
          <PracticeCta line={marks >= 600 ? "Protect your score with daily PYQs" : `Add ${Math.min(60, Math.max(20, 650 - marks))} marks with chapter-wise PYQs`} />
        </div>
      )}
    </div>
  );
}

// ── Percentile calculator ────────────────────────────────────────────────
export function PercentileCalculator() {
  const [mode, setMode] = useState<"marks" | "rank">("marks");
  const [raw, setRaw] = useState("550");
  const [year, setYear] = useState<RankYear>("2025");
  const n = Number(raw);
  const valid = raw.trim() !== "" && Number.isFinite(n) && n > 0;

  const result = useMemo(() => {
    if (!valid) return null;
    if (mode === "marks") {
      const e = estimateAll(Math.max(-180, Math.min(MAX_MARKS, Math.round(n)))).find((x) => x.year === year)!;
      return { rank: e.rank, percentile: e.percentile, appeared: YEAR_INFO[year].appeared, marks: Math.round(n) };
    }
    const rank = Math.max(1, Math.round(n));
    const appeared = YEAR_INFO[year].appeared;
    return { rank, percentile: percentileFor(rank, appeared), appeared, marks: marksForRank(year, rank) };
  }, [valid, mode, n, year]);

  const tab = (m: "marks" | "rank", label: string) => (
    <button type="button" onClick={() => { setMode(m); setRaw(m === "marks" ? "550" : "20000"); }} className={cn("min-h-10 rounded-full px-4 text-sm font-bold", mode === m ? "bg-foreground text-background" : "text-foreground/70")}>{label}</button>
  );

  return (
    <div>
      <div className="clay rounded-3xl p-5 sm:p-6">
        <div className="inline-flex rounded-full border border-border p-1">{tab("marks", "I know my marks")}{tab("rank", "I know my rank")}</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={mode === "marks" ? "Marks (out of 720)" : "All-India rank (AIR)"}>
            <input inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Use the pattern of" hint={`${formatRank(YEAR_INFO[year].appeared)} candidates appeared in ${year}.`}>
            <select value={year} onChange={(e) => setYear(e.target.value as RankYear)} className={inputCls}>
              {RANK_YEARS.map((y) => <option key={y} value={y}>NEET {y}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {result && (
        <div className="mt-5" aria-live="polite">
          <div className="ink-section rounded-3xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Your NEET percentile</p>
            <p className="font-display mt-2 text-5xl font-extrabold">{result.percentile}<span className="text-2xl text-white/60">%ile</span></p>
            <p className="mt-2 text-sm text-white/65">
              About {mode === "marks" ? `${result.marks} marks` : `AIR ${formatRank(result.rank)}`} means you scored better than roughly {result.percentile}% of the {formatRank(result.appeared)} candidates who appeared.
            </p>
            <ShareButton className="mt-4 !border-white/25 !text-white" text={`My NEET percentile estimate on Edurack: ${result.percentile}%ile.`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="clay-inset rounded-2xl p-4"><p className="text-[11px] font-bold uppercase text-foreground/50">Marks</p><p className="font-display text-2xl font-bold">{result.marks}</p></div>
            <div className="clay-inset rounded-2xl p-4"><p className="text-[11px] font-bold uppercase text-foreground/50">Rank (AIR)</p><p className="font-display text-2xl font-bold">{formatRank(result.rank)}</p></div>
            <div className="clay-inset rounded-2xl p-4"><p className="text-[11px] font-bold uppercase text-foreground/50">2025 qualifying cut-off</p><p className="font-display text-2xl font-bold">{QUALIFYING_2025.generalMarks}</p><p className="text-[11px] text-foreground/50">General, 50th percentile</p></div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-foreground/50">
            Percentile = (candidates who appeared − rank + 1) ÷ candidates who appeared × 100. NTA's official percentile is per exam day and shift, so yours may differ slightly. Marks and rank here are estimates; see the notes on the rank predictor.
          </p>
          <PracticeCta line="Move your percentile up with daily PYQs" />
        </div>
      )}
    </div>
  );
}

// ── Target score planner ─────────────────────────────────────────────────
export function TargetPlanner() {
  const [target, setTarget] = useState("620");
  const [days, setDays] = useState("120");
  const [goal, setGoal] = useState("3000");
  const t = Math.max(0, Math.min(MAX_MARKS, Math.round(Number(target)) || 0));
  const d = Math.max(1, Math.round(Number(days)) || 1);
  const g = Math.max(0, Math.round(Number(goal)) || 0);

  const plans = useMemo(() => attemptPlans(t), [t]);
  const split = useMemo(() => subjectSplit(t), [t]);
  const est = useMemo(() => estimateAll(t), [t]);
  const perDay = Math.ceil(g / d);
  const perWeek = perDay * 7;

  return (
    <div>
      <div className="clay rounded-3xl p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Target marks"><input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} /></Field>
          <Field label="Days left for NEET"><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} /></Field>
          <Field label="PYQs you want to solve" hint="3,000 is a solid goal."><input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} className={inputCls} /></Field>
        </div>
      </div>

      {t > 0 && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div className="ink-section rounded-3xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Your plan for {t} marks</p>
            <p className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">{perDay} PYQs a day</p>
            <p className="mt-2 text-sm text-white/65">That's {perWeek} a week for {d} days to reach {g.toLocaleString("en-IN")} questions. {t >= 3 && `It's an expected AIR of about ${formatRank(est[0].rank)} on the 2025 pattern.`}</p>
            <ShareButton className="mt-4 !border-white/25 !text-white" text={`My NEET plan on Edurack: ${t} marks target, ${perDay} PYQs a day.`} />
          </div>

          <div className="clay rounded-3xl p-5">
            <h2 className="font-display text-lg font-bold">How many do you need to get right?</h2>
            <p className="mt-1 text-sm text-foreground/60">NEET gives +4 for a correct answer and −1 for a wrong one, out of {TOTAL_QUESTIONS} questions.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead><tr className="text-[11px] uppercase tracking-wide text-foreground/45"><th className="py-2 pr-3">Attempt</th><th className="py-2 pr-3">Correct</th><th className="py-2 pr-3">Wrong</th><th className="py-2">Accuracy needed</th></tr></thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.attempted} className="border-t border-border">
                      <td className="py-2.5 pr-3 font-semibold">{p.attempted}</td>
                      <td className="py-2.5 pr-3">{p.correct}</td>
                      <td className="py-2.5 pr-3">{p.wrong}</td>
                      <td className="py-2.5 font-bold">{p.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plans.length === 0 && <p className="text-sm text-foreground/60">That target needs more questions than the paper has. Try a lower score.</p>}
          </div>

          <div className="clay rounded-3xl p-5">
            <h2 className="font-display text-lg font-bold">Where the marks come from</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {split.map((s) => (
                <div key={s.subject} className="clay-inset rounded-2xl p-4">
                  <p className="text-xs font-bold text-foreground/55">{s.subject}</p>
                  <p className="font-display mt-1 text-2xl font-bold">{s.target}<span className="text-sm text-foreground/50"> / {s.max}</span></p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-foreground/50">A balanced split in proportion to the paper. In practice most students score highest in Biology, so shift marks there if Physics is your weak spot.</p>
          </div>
          <PracticeCta line={`Start your ${perDay}-a-day plan today`} />
        </div>
      )}
    </div>
  );
}
