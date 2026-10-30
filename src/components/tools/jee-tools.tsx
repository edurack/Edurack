// JEE Main percentile <-> rank calculator. All maths is client-side (lib/jee-main-percentile.ts); nothing is sent anywhere.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { JEE_MAIN_2026_APPEARED, MARKS_BANDS, percentileFromRank, rankFromPercentile } from "@/lib/jee-main-percentile";
import { formatRank } from "@/lib/neet-rank-data";
import { Field, ShareButton, inputCls } from "@/components/tools/tool-shell";
import { cn } from "@/lib/utils";

type Mode = "percentile" | "rank";

export function JeePercentileCalculator() {
  const [mode, setMode] = useState<Mode>("percentile");
  const [raw, setRaw] = useState("99");
  const [candidatesRaw, setCandidatesRaw] = useState(String(JEE_MAIN_2026_APPEARED));

  const candidates = Number(candidatesRaw.replace(/,/g, ""));
  const candidatesOk = Number.isFinite(candidates) && candidates >= 1000 && candidates <= 5_000_000;
  const n = Number(raw.replace(/,/g, ""));
  const valid = raw.trim() !== "" && Number.isFinite(n) && candidatesOk && (mode === "percentile" ? n > 0 && n <= 100 : n >= 1 && n <= candidates);

  const result = useMemo(() => {
    if (!valid) return null;
    if (mode === "percentile") return { percentile: n, rank: rankFromPercentile(n, candidates) };
    const rank = Math.round(n);
    return { percentile: percentileFromRank(rank, candidates), rank };
  }, [valid, mode, n, candidates]);

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setRaw(m === "percentile" ? "99" : "15000");
      }}
      className={cn("min-h-10 rounded-full px-4 text-sm font-bold", mode === m ? "bg-foreground text-background" : "text-foreground/70")}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="clay rounded-3xl p-5 sm:p-6">
        <div className="inline-flex rounded-full border border-border p-1">
          {tab("percentile", "I know my percentile")}
          {tab("rank", "I know my rank")}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={mode === "percentile" ? "NTA percentile (0 to 100)" : "All-India rank (AIR)"}>
            <input inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Candidates who appeared" hint="JEE Main 2026 default: 15,38,474 unique candidates across both sessions.">
            <input inputMode="numeric" value={candidatesRaw} onChange={(e) => setCandidatesRaw(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>

      {result && (
        <div className="mt-5" aria-live="polite">
          <div className="ink-section rounded-3xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">{mode === "percentile" ? "Your expected JEE Main rank" : "Your JEE Main percentile"}</p>
            {mode === "percentile" ? (
              <p className="font-display mt-2 text-5xl font-extrabold">AIR ~{formatRank(result.rank)}</p>
            ) : (
              <p className="font-display mt-2 text-5xl font-extrabold">{result.percentile}<span className="text-2xl text-white/60">%ile</span></p>
            )}
            <p className="mt-2 text-sm text-white/65">
              {mode === "percentile"
                ? `A ${result.percentile} percentile means about ${formatRank(Math.max(0, candidates - result.rank))} of ${formatRank(candidates)} candidates scored at or below you.`
                : `AIR ${formatRank(result.rank)} out of ${formatRank(candidates)} candidates works out to about the ${result.percentile} percentile.`}
            </p>
            <ShareButton
              className="mt-4 !border-white/25 !text-white"
              text={mode === "percentile" ? `My JEE Main estimate on Edurack: ${result.percentile} percentile is about AIR ${formatRank(result.rank)}.` : `My JEE Main estimate on Edurack: AIR ${formatRank(result.rank)} is about the ${result.percentile} percentile.`}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-foreground/50">
            Rank is roughly (100 − percentile) × candidates ÷ 100. NTA builds the final list from your better score across both sessions and applies tie-breaking, so your real rank can differ a little. Category ranks are different from AIR.
          </p>
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-foreground">Marks, percentile and rank at a glance</h2>
        <p className="mt-1 text-sm text-foreground/65">NTA does not publish marks versus percentile, because percentile is normalised shift by shift. These raw-mark ranges are what each percentile took across the April 2026 shifts.</p>
        <div className="clay-inset mt-3 overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">
                <th className="px-4 py-3">Percentile</th>
                <th className="px-4 py-3">Raw marks (out of 300)</th>
                <th className="px-4 py-3">About AIR</th>
              </tr>
            </thead>
            <tbody>
              {MARKS_BANDS.map((b) => (
                <tr key={b.percentile} className="border-t border-border">
                  <td className="px-4 py-3 font-bold text-foreground">{b.percentile}</td>
                  <td className="px-4 py-3 text-foreground/80">{b.marks}</td>
                  <td className="px-4 py-3 text-foreground/80">{formatRank(rankFromPercentile(b.percentile, JEE_MAIN_2026_APPEARED))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-foreground/50">
          Compiled from shift-wise reports published by Careers360, Vedantu and Cracku after the April 2026 session. Tougher shifts need fewer raw marks. Ranks use 15,38,474 candidates.
        </p>
      </section>

      <div className="ink-section mt-8 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-extrabold">Move your percentile up with daily JEE PYQs</p>
          <p className="mt-1 text-sm text-white/65">Free JEE previous year questions with solutions, chapter by chapter.</p>
        </div>
        <Link to="/pyq" search={{ exam: "jee" } as never} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#ffffff] px-6 text-sm font-extrabold text-[#141b2b]">
          Practise JEE PYQs
        </Link>
      </div>
    </div>
  );
}
