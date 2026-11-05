import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, BookOpen, Download, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { getAdminNeetQuestionAnalytics } from "@/server-functions/neet-analytics-admin";
import { NcertLineByLineModule } from "@/components/admin/ncert-line-by-line-module";
import { cn } from "@/lib/utils";

type AnalyticsRow = {
  subject: string;
  chapter: string;
  topic: string;
  year: string;
  difficulty: string;
  count: number;
};
type AnalyticsResult = {
  rows: AnalyticsRow[];
  totalQuestions: number;
  generatedAt: string;
};
type Props = { adminUser: { getIdToken: () => Promise<string> } };
type TopicRow = {
  subject: string;
  chapter: string;
  topic: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  unclassified: number;
};

const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const fileDate = () => new Date().toISOString().slice(0, 10);

export function NeetAnalyticsModule({ adminUser }: Props) {
  const [branch, setBranch] = useState<"analytics" | "ncertLineByLine">("analytics");
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [year, setYear] = useState("All years");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await adminUser.getIdToken();
      const data = await getAdminNeetQuestionAnalytics({ data: { token } });
      setResult(data as AnalyticsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load NEET question analytics.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [adminUser]);

  const years = useMemo(() => [...new Set((result?.rows ?? []).map((row) => row.year))]
    .sort((a, b) => a === "Unspecified year" ? 1 : b === "Unspecified year" ? -1 : b.localeCompare(a, undefined, { numeric: true })), [result]);

  const topicRows = useMemo(() => {
    const grouped = new Map<string, TopicRow>();
    for (const row of result?.rows ?? []) {
      if (subject !== "All subjects" && row.subject !== subject) continue;
      if (year !== "All years" && row.year !== year) continue;
      const key = `${row.subject}\u0000${row.chapter}\u0000${row.topic}`;
      let item = grouped.get(key);
      if (!item) {
        item = { subject: row.subject, chapter: row.chapter, topic: row.topic, total: 0, easy: 0, medium: 0, hard: 0, unclassified: 0 };
        grouped.set(key, item);
      }
      item.total += row.count;
      if (row.difficulty === "Easy") item.easy += row.count;
      else if (row.difficulty === "Medium") item.medium += row.count;
      else if (row.difficulty === "Hard") item.hard += row.count;
      else item.unclassified += row.count;
    }
    const term = search.trim().toLowerCase();
    return [...grouped.values()]
      .filter((item) => !term || `${item.subject} ${item.chapter} ${item.topic}`.toLowerCase().includes(term))
      .sort((a, b) => b.total - a.total || a.subject.localeCompare(b.subject) || a.chapter.localeCompare(b.chapter) || a.topic.localeCompare(b.topic));
  }, [result, subject, year, search]);

  const totals = useMemo(() => topicRows.reduce((acc, row) => ({
    total: acc.total + row.total,
    easy: acc.easy + row.easy,
    medium: acc.medium + row.medium,
    hard: acc.hard + row.hard,
    unclassified: acc.unclassified + row.unclassified,
  }), { total: 0, easy: 0, medium: 0, hard: 0, unclassified: 0 }), [topicRows]);

  const subjectOptions = useMemo(() => [...new Set((result?.rows ?? []).map((row) => row.subject))].sort(), [result]);
  const hasData = (result?.totalQuestions ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="NEET Question Analytics section">
        <button
          type="button"
          role="tab"
          aria-selected={branch === "analytics"}
          onClick={() => setBranch("analytics")}
          className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold", branch === "analytics" ? "clay-btn text-white" : "clay-chip text-foreground/70")}
        >
          <BarChart3 className="h-3.5 w-3.5" /> PYQ Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "ncertLineByLine"}
          onClick={() => setBranch("ncertLineByLine")}
          className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold", branch === "ncertLineByLine" ? "clay-btn text-white" : "clay-chip text-foreground/70")}
        >
          <BookOpen className="h-3.5 w-3.5" /> NCERT Line by Line
        </button>
      </div>

      {branch === "ncertLineByLine" ? (
        <NcertLineByLineModule adminUser={adminUser} />
      ) : (
      <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-bold tracking-tight">NEET Question Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-foreground/60">Live, read-only breakdown of NEET PYQs already stored in MongoDB.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadCsv(`neet-topic-summary-${fileDate()}.csv`,
              ["Subject", "Chapter", "Topic", "Total Questions", "Easy", "Medium", "Hard", "Unclassified"],
              topicRows.map((row) => [row.subject, row.chapter, row.topic, row.total, row.easy, row.medium, row.hard, row.unclassified]))}
            disabled={!result || topicRows.length === 0}
            className="clay-btn-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            title="Download the currently filtered topic summary"
          >
            <Download className="h-3.5 w-3.5" /> Download summary CSV
          </button>
          <button
            onClick={() => downloadCsv(`neet-analytics-breakdown-${fileDate()}.csv`,
              ["Subject", "Chapter", "Topic", "Year", "Difficulty", "Question Count"],
              (result?.rows ?? []).filter((row) =>
                (subject === "All subjects" || row.subject === subject) &&
                (year === "All years" || row.year === year) &&
                (!search.trim() || `${row.subject} ${row.chapter} ${row.topic}`.toLowerCase().includes(search.trim().toLowerCase()))
              ).map((row) => [row.subject, row.chapter, row.topic, row.year, row.difficulty, row.count]))}
            disabled={!result || result.rows.length === 0}
            className="clay-btn-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            title="Download all available year and difficulty breakdown rows for the selected filters"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Download detailed CSV
          </button>
          <button onClick={() => void load()} disabled={loading} className="clay-btn-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh data
          </button>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {loading && !result ? <div className="py-16 text-center text-sm text-foreground/50">Loading question analytics from the database…</div> : null}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="Questions in view" value={totals.total} />
            <Metric label="Easy" value={totals.easy} tone="green" />
            <Metric label="Medium" value={totals.medium} tone="amber" />
            <Metric label="Hard" value={totals.hard} tone="red" />
            <Metric label="Unclassified" value={totals.unclassified} tone="muted" />
          </div>

          <div className="clay-sm rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Topic-wise question counts</h2>
              <span className="text-xs text-foreground/50">{number(topicRows.length)} topics</span>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <select value={subject} onChange={(event) => setSubject(event.target.value)} className="clay-inset min-w-0 rounded-xl px-3 py-2 text-sm">
                <option>All subjects</option>
                {subjectOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select value={year} onChange={(event) => setYear(event.target.value)} className="clay-inset min-w-0 rounded-xl px-3 py-2 text-sm">
                <option>All years</option>
                {years.map((value) => <option key={value}>{value}</option>)}
              </select>
              <div className="clay-inset flex items-center gap-2 rounded-xl px-3">
                <Search className="h-4 w-4 shrink-0 text-foreground/40" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chapter or topic" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
              </div>
            </div>

            {!hasData ? (
              <div className="rounded-xl bg-foreground/[0.03] px-4 py-10 text-center text-sm text-foreground/55">No NEET PYQ questions were found in eligible bundles.</div>
            ) : topicRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-foreground/50">No topics match these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead><tr className="border-b border-border text-xs text-foreground/50">
                    <th className="px-3 py-3 font-semibold">Subject / Chapter / Topic</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                    <th className="px-3 py-3 text-right font-semibold">Easy</th>
                    <th className="px-3 py-3 text-right font-semibold">Medium</th>
                    <th className="px-3 py-3 text-right font-semibold">Hard</th>
                    <th className="px-3 py-3 text-right font-semibold">Unclassified</th>
                  </tr></thead>
                  <tbody>
                    {topicRows.map((row) => <tr key={`${row.subject}-${row.chapter}-${row.topic}`} className="border-b border-border/60 last:border-0 hover:bg-foreground/[0.02]">
                      <td className="px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{row.subject}</div>
                        <div className="mt-0.5 font-semibold">{row.chapter}</div>
                        <div className="mt-0.5 text-xs text-foreground/60">{row.topic}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">{number(row.total)}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-emerald-700">{number(row.easy)}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-amber-700">{number(row.medium)}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-red-700">{number(row.hard)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-foreground/50">{number(row.unclassified)}</td>
                    </tr>)}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-border font-bold"><td className="px-3 py-3">Filtered total</td><td className="px-3 py-3 text-right tabular-nums">{number(totals.total)}</td><td className="px-3 py-3 text-right tabular-nums">{number(totals.easy)}</td><td className="px-3 py-3 text-right tabular-nums">{number(totals.medium)}</td><td className="px-3 py-3 text-right tabular-nums">{number(totals.hard)}</td><td className="px-3 py-3 text-right tabular-nums">{number(totals.unclassified)}</td></tr></tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/45">
            <span>Source: questions collection · isPYQ = true · NEET-eligible bundles only</span>
            <span>Updated {new Date(result.generatedAt).toLocaleString("en-IN")}</span>
          </div>
          <p className="text-xs text-foreground/45">Unclassified includes questions whose difficulty is missing or does not match Easy, Medium or Hard. Counts reflect saved database tags; this module does not infer or change difficulty.</p>
        </>
      )}
      </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "amber" | "red" | "muted" }) {
  const toneClass = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "muted" ? "text-foreground/50" : "text-foreground";
  return <div className="clay-sm rounded-2xl p-4"><div className="text-xs text-foreground/55">{label}</div><div className={`mt-1 font-display text-2xl font-bold tabular-nums ${toneClass}`}>{number(value)}</div></div>;
}
