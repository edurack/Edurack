// "Where your time went": the per-question timing analysis for a Quick Mock or a test (lib/time-analysis.ts).
// Edurack Pro students get the full breakdown; everyone else gets a one-line teaser that says there is something to learn
// and links to the Pro plans. The server decides which one to send, so the detail never reaches a student who hasn't got it.
import { Link } from "@tanstack/react-router";
import { Clock, Lock } from "lucide-react";
import { formatDuration, type TimeAnalysis, type TimeTeaser } from "@/lib/time-analysis";
import { track } from "@/lib/analytics";

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
      <dt className="min-w-0 text-sm text-foreground/75">
        {label}
        {hint && <span className="block text-xs text-foreground/50">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-sm font-bold text-foreground">{value}</dd>
    </div>
  );
}

export function TimeAnalysisCard({ analysis, teaser, source }: { analysis: TimeAnalysis | null; teaser: TimeTeaser | null; source: "drill" | "test" }) {
  if (!analysis && !teaser) return null;

  if (!analysis && teaser) {
    return (
      <div className="clay p-5 sm:p-6" data-testid="time-analysis-teaser">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
            <Lock className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Where your time and marks went</h2>
            <p className="mt-0.5 text-sm text-foreground/70">
              You spent {formatDuration(teaser.totalSec)} on {teaser.timedCount} questions.
              {teaser.flagged > 0
                ? ` ${teaser.flagged} of your answers were rushed guesses or long struggles. Edurack Pro shows you which ones, and what they cost you.`
                : " Edurack Pro shows you which answers were rushed and where you lose time."}
            </p>
            <Link
              to="/pro"
              onClick={() => track("time_analysis_upgrade_clicked", { source })}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-bold text-foreground hover:bg-foreground/5"
            >
              See Edurack Pro
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const a = analysis!;
  return (
    <div className="clay p-5 sm:p-6" data-testid="time-analysis-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
          <Clock className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Where your time and marks went</h2>
          <p className="mt-0.5 text-xs text-foreground/60">
            {formatDuration(a.totalSec)} across {a.timedCount} questions. Typical question: {formatDuration(a.medianSec)}.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {a.takeaways.map((t) => (
          <li key={t} className="rounded-xl bg-[var(--sky-soft)] px-3.5 py-3 text-sm font-medium text-foreground/85">
            {t}
          </li>
        ))}
      </ul>

      <dl className="mt-4">
        {a.avgCorrectSec !== null && <Row label="Average on right answers" value={formatDuration(a.avgCorrectSec)} />}
        {a.avgWrongSec !== null && <Row label="Average on wrong answers" value={formatDuration(a.avgWrongSec)} />}
        <Row label="Wrong in under 20 seconds" value={`${a.quickWrong.count}`} hint={a.quickWrong.marksLost > 0 ? `Cost ${a.quickWrong.marksLost} marks` : undefined} />
        <Row label="Wrong after a long struggle" value={`${a.slowWrong.count}`} hint={a.slowWrong.count > 0 ? `${formatDuration(a.slowWrong.sec)} for no marks` : undefined} />
        <Row label="Left blank after a long look" value={`${a.slowSkipped.count}`} hint={a.slowSkipped.count > 0 ? formatDuration(a.slowSkipped.sec) : undefined} />
        <Row label="Right but slow" value={`${a.slowCorrect.count}`} hint={a.slowCorrect.count > 0 ? `${formatDuration(a.slowCorrect.sec)} in total` : undefined} />
      </dl>

      {a.subjects.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Avg per question</th>
                <th className="py-2">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {a.subjects.map((s) => (
                <tr key={s.subject} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold text-foreground">{s.subject}</td>
                  <td className="py-2 pr-3 text-foreground/80">{formatDuration(s.avgSec)}</td>
                  <td className="py-2 text-foreground/80">{s.accuracyPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
