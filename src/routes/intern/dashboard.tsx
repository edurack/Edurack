import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconHelpCircle as HelpCircle, IconFileText as FileText, IconInbox as Inbox } from "@tabler/icons-react";
import { getMyTasks, getTaskProgress } from "@/server-functions/intern-portal";
import { TaskWorkspaceModule } from "@/components/intern/task-workspace-module";
import { useTour, OnboardingTour, type TourStep } from "@/components/intern/onboarding-tour";
import { useInternSession } from "@/components/intern/use-intern-session";
import { InternShell } from "@/components/intern/intern-shell";

export const Route = createFileRoute("/intern/dashboard")({
  component: InternDashboardPage,
});

type TaskRow = Awaited<ReturnType<typeof getMyTasks>>["tasks"][number];
type ProgressRow = Awaited<ReturnType<typeof getTaskProgress>>["progress"];

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="task-grid"]',
    title: "Your tasks",
    description:
      "Each card is a question-writing task your admin assigned — the bundle, test, and subject it belongs to, plus how many questions you've gotten approved so far. Tap a card to open it.",
  },
  {
    selector: '[data-tour="nav-profile"]',
    title: "Your profile & report",
    description:
      "Your internship dates, how many questions you've gotten approved, your accuracy, and your offer letter and certificate all live here.",
  },
];

function InternDashboardPage() {
  const { token, internName, signOut } = useInternSession();
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [progressByTask, setProgressByTask] = useState<Record<string, ProgressRow>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const tour = useTour("internTourDashboardSeen");

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { tasks: rows } = await getMyTasks({ data: { token } });
      setTasks(rows);
      const entries = await Promise.all(
        rows.map(async (t) => [t.id, (await getTaskProgress({ data: { token, taskId: t.id } })).progress] as const),
      );
      setProgressByTask(Object.fromEntries(entries));
    })();
  }, [token]);

  if (!token) return null;

  const activeTask = tasks?.find((t) => t.id === activeTaskId) ?? null;

  return (
    <InternShell
      internName={internName}
      activeTab="dashboard"
      onSignOut={signOut}
      headerExtra={
        <button
          onClick={tour.start}
          className="clay-btn-ghost flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold text-foreground/60"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Help
        </button>
      }
    >
      {activeTask ? (
        <div>
          <button
            onClick={() => setActiveTaskId(null)}
            className="mb-4 text-xs font-semibold text-foreground/50 hover:text-foreground"
          >
            ← Back to all tasks
          </button>
          <TaskWorkspaceModule token={token} task={activeTask} />
        </div>
      ) : tasks === null ? (
        <p className="text-sm text-foreground/50">Loading your tasks…</p>
      ) : tasks.length === 0 ? (
        // ── Empty state ──────────────────────────────────────────────
        // Previously just a one-line "no tasks yet" — replaced with
        // something that actually orients a brand-new intern instead of
        // leaving the whole page looking broken/blank.
        <div className="clay flex flex-col items-center gap-3 p-10 text-center">
          <div className="clay-inset grid h-14 w-14 place-items-center rounded-2xl">
            <Inbox className="h-6 w-6 text-foreground/40" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">No tasks yet</h2>
          <p className="max-w-sm text-sm text-foreground/60">
            Your admin hasn't assigned you a question-writing task yet. The moment they do, it'll show up right
            here — and you'll get an email too, so there's nothing to keep refreshing for.
          </p>
          <p className="max-w-sm text-xs text-foreground/40">
            In the meantime, check your <span className="font-semibold text-foreground/60">Profile</span> tab
            above — your internship start and end dates will appear there once confirmed.
          </p>
        </div>
      ) : (
        <div data-tour="task-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tasks.map((t) => {
            const progress = progressByTask[t.id];
            const pct = progress ? Math.min(100, Math.round((progress.approvedCount / t.targetCount) * 100)) : 0;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTaskId(t.id)}
                className="clay p-5 text-left transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    {t.bundleTitle} · {t.testName}
                  </p>
                  {t.referencePdfUrl && <FileText className="h-3.5 w-3.5 shrink-0 text-foreground/40" />}
                </div>
                <h2 className="mt-1 text-lg font-bold text-foreground">{t.subject}</h2>
                {progress && (
                  <>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--sky-soft)]">
                      <div className="h-full rounded-full bg-[var(--sky-deep)]" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-foreground/60">
                      {progress.approvedCount} / {t.targetCount} approved
                      {progress.submittedCount > 0 ? ` · ${progress.submittedCount} awaiting review` : ""}
                    </p>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tour.active && <OnboardingTour steps={DASHBOARD_TOUR_STEPS} onFinish={tour.finish} />}
    </InternShell>
  );
}
