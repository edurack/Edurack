// src/components/admin/question-reports-module.tsx
//
// The "Question reports" tab in admin.dashboard.tsx. Students flag a PYQ they
// think is wrong; this is the queue admins work through, most-reported first.
// Own file per project convention; wired into ModuleRouter like BlogHubModule.
import { useCallback, useEffect, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { SmartContent } from "@/lib/smart-content";
import { listQuestionReports, resolveQuestionReports } from "@/server-functions/question-reports";
import { REPORT_REASON_LABELS, type QuestionReportGroup, type ReportStatus } from "@/lib/pyq-types";

type Filter = ReportStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "fixed", label: "Fixed" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

export function QuestionReportsModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [groups, setGroups] = useState<QuestionReportGroup[] | null>(null);
  const [openTotal, setOpenTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await adminUser.getIdToken();
      const res = await listQuestionReports({ data: { token, status: filter } });
      setGroups(res.groups);
      setOpenTotal(res.openTotal);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports.");
    }
  }, [adminUser, filter]);

  useEffect(() => {
    setGroups(null);
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight">Question reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Students flag PYQs they think are wrong. A question reported by several students is the most likely to have a bad answer key.
          <b className="ml-1 text-foreground">{openTotal}</b> open report{openTotal === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : groups === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {filter === "open" ? "No open reports. 🎉" : "Nothing here."}
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => (
            <GroupCard key={g.questionId} g={g} adminUser={adminUser} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupCard({ g, adminUser, onChanged }: { g: QuestionReportGroup; adminUser: { getIdToken: () => Promise<string> }; onChanged: () => void }) {
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const q = g.question;

  async function act(status: ReportStatus) {
    setBusy(true);
    try {
      const token = await adminUser.getIdToken();
      await resolveQuestionReports({ data: { token, questionId: g.questionId, status, adminNote } });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="min-w-0 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-bold text-destructive">
          {g.openCount > 0 ? `${g.openCount} open` : "Closed"} · {g.totalCount} total
        </span>
        {Object.entries(g.reasons).map(([r, n]) => (
          <span key={r} className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
            {REPORT_REASON_LABELS[r as keyof typeof REPORT_REASON_LABELS]} ×{n}
          </span>
        ))}
      </div>

      {q ? (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">
            {q.where || "—"} · {q.subject} · {q.chapter || "untagged"}
            {q.topic ? ` · ${q.topic}` : ""} · {q.difficulty}
          </p>
          <SmartContent value={q.body} className="mt-2 text-sm leading-relaxed" />
          {q.type === "mcq" && q.options && (
            <ol className="mt-3 space-y-1.5 text-sm">
              {(["A", "B", "C", "D"] as const).map((o) => (
                <li key={o} className={`flex gap-2 rounded-xl px-3 py-2 ${q.correctOption === o ? "bg-emerald-500/10 font-semibold" : "bg-secondary/50"}`}>
                  <span className="shrink-0 font-bold">{o}.</span>
                  <SmartContent value={q.options![o]} className="min-w-0" />
                  {q.correctOption === o && <span className="ml-auto shrink-0 text-xs font-bold text-emerald-600">KEY</span>}
                </li>
              ))}
            </ol>
          )}
          {q.type === "integer" && (
            <p className="mt-3 text-sm">
              Answer key: <b className="text-emerald-600">{q.correctAnswer}</b>
            </p>
          )}
          {q.solution && (
            <div className="mt-3">
              <button onClick={() => setShowSolution((v) => !v)} className="text-xs font-bold text-primary hover:underline">
                {showSolution ? "Hide solution" : "Show solution"}
              </button>
              {showSolution && <SmartContent value={q.solution} className="mt-2 border-l-2 border-primary pl-3 text-sm text-muted-foreground" />}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This question no longer exists — safe to dismiss.</p>
      )}

      {g.notes.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">What students said</p>
          {g.notes.map((n, i) => (
            <p key={i} className="rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              “{n.note}”
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        {g.openCount > 0 ? (
          <>
            <input
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              maxLength={500}
              placeholder="Optional note (e.g. “Key corrected to C”)"
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button onClick={() => act("fixed")} disabled={busy} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              Mark fixed
            </button>
            <button onClick={() => act("dismissed")} disabled={busy} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary disabled:opacity-50">
              Dismiss
            </button>
          </>
        ) : (
          <button onClick={() => act("open")} disabled={busy} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary disabled:opacity-50">
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}
