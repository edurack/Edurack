import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  IconCalendar as Calendar,
  IconTargetArrow as Target,
  IconCircleCheck as CheckCircle2,
  IconAlertTriangle as AlertTriangle,
  IconChartBar as ChartBar,
  IconListCheck as ListCheck,
} from "@tabler/icons-react";
import { getMyProfileReport } from "@/server-functions/intern-portal";
import { useInternSession } from "@/components/intern/use-intern-session";
import { InternShell } from "@/components/intern/intern-shell";

export const Route = createFileRoute("/intern/profile")({
  component: InternProfilePage,
});

type Report = Awaited<ReturnType<typeof getMyProfileReport>>["report"];

function formatDate(iso: string | null) {
  if (!iso) return "Not set yet";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  accent: "sky" | "mint" | "coral" | "lemon";
}) {
  const bg = {
    sky: "var(--sky-soft)",
    mint: "var(--mint-soft)",
    coral: "var(--coral-soft)",
    lemon: "var(--lemon-soft)",
  }[accent];
  return (
    <div className="clay p-5">
      <div className="clay-inset mb-3 flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: bg }}>
        <Icon className="h-5 w-5 text-foreground/60" />
      </div>
      <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs font-medium text-foreground/60">{label}</p>
    </div>
  );
}

function InternProfilePage() {
  const { token, internName, signOut } = useInternSession();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await getMyProfileReport({ data: { token } });
      setReport(res.report);
    })();
  }, [token]);

  if (!token) return null;

  return (
    <InternShell internName={internName} activeTab="profile" onSignOut={signOut}>
      {report === null ? (
        <p className="text-sm text-foreground/50">Loading your profile…</p>
      ) : (
        <div className="space-y-6">
          {/* ── Identity + internship dates ───────────────────────────── */}
          <div className="clay p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-bold text-foreground">{report.profile.name}</p>
                <p className="text-sm text-foreground/50">
                  @{report.profile.username} · {report.profile.email}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <div className="clay-inset rounded-2xl px-4 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/40">Start date</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-foreground/40" />
                    {formatDate(report.profile.internshipStartDate)}
                  </p>
                </div>
                <div className="clay-inset rounded-2xl px-4 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/40">End date</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-foreground/40" />
                    {formatDate(report.profile.internshipEndDate)}
                  </p>
                </div>
              </div>
            </div>
            {!report.profile.internshipStartDate && (
              <p className="mt-3 text-xs text-foreground/40">
                Your admin hasn't confirmed your internship dates yet — you'll get an email the moment they do.
              </p>
            )}
          </div>

          {/* ── Stats ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={Target} label="Tasks assigned" value={String(report.stats.tasksAssigned)} accent="sky" />
            <StatCard icon={CheckCircle2} label="Tasks completed" value={String(report.stats.tasksCompleted)} accent="mint" />
            <StatCard icon={ListCheck} label="Questions approved" value={String(report.stats.totalApproved)} accent="sky" />
            <StatCard icon={AlertTriangle} label="Mistakes made" value={String(report.stats.totalMistakes)} accent="coral" />
            <StatCard
              icon={ChartBar}
              label="Accuracy"
              value={report.stats.accuracyPercent === null ? "—" : `${report.stats.accuracyPercent}%`}
              accent="lemon"
            />
          </div>

          {/* ── Per-task breakdown ─────────────────────────────────────── */}
          <div className="clay p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Task-by-task report
            </h2>
            {report.taskBreakdown.length === 0 ? (
              <p className="text-sm text-foreground/50">No tasks assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {report.taskBreakdown.map((t) => (
                  <div key={t.taskId} className="clay-inset rounded-2xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                          {t.bundleTitle} · {t.testName}
                        </p>
                        <p className="text-sm font-bold text-foreground">{t.subject}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                          t.completed ? "bg-[var(--mint-soft)] text-foreground" : "bg-[var(--sky-soft)] text-foreground"
                        }`}
                      >
                        {t.completed ? "Completed" : "In progress"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-foreground/60">
                      <span>
                        Approved: <strong className="text-foreground">{t.approvedCount}</strong> / {t.targetCount}
                      </span>
                      <span>
                        Mistakes: <strong className="text-foreground">{t.rejectionCount}</strong>
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--sky-soft)]">
                      <div
                        className="h-full rounded-full bg-[var(--sky-deep)]"
                        style={{ width: `${Math.min(100, Math.round((t.approvedCount / t.targetCount) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </InternShell>
  );
}
