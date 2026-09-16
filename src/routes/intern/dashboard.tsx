import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getInternSession } from "@/server-functions/intern-auth";
import { getMyTasks, getTaskProgress } from "@/server-functions/intern-portal";
import { TaskWorkspaceModule } from "@/components/intern/task-workspace-module";

export const Route = createFileRoute("/intern/dashboard")({
  component: InternDashboardPage,
});

type TaskRow = Awaited<ReturnType<typeof getMyTasks>>["tasks"][number];
type ProgressRow = Awaited<ReturnType<typeof getTaskProgress>>["progress"];

function InternDashboardPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [internName, setInternName] = useState("");
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [progressByTask, setProgressByTask] = useState<Record<string, ProgressRow>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("internToken");
    if (!t) {
      navigate({ to: "/intern/auth" });
      return;
    }
    (async () => {
      try {
        const session = await getInternSession({ data: { token: t } });
        setInternName(session.intern.name);
        setToken(t);
      } catch {
        localStorage.removeItem("internToken");
        navigate({ to: "/intern/auth" });
      }
    })();
  }, [navigate]);

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

  function handleSignOut() {
    localStorage.removeItem("internToken");
    navigate({ to: "/intern/auth" });
  }

  if (!token) return null;

  const activeTask = tasks?.find((t) => t.id === activeTaskId) ?? null;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Hey, {internName}</h1>
            <p className="mt-1 text-sm text-foreground/60">Your assigned question-ingestion tasks.</p>
          </div>
          <button onClick={handleSignOut} className="clay-chip rounded-2xl px-4 py-2 text-xs font-semibold text-foreground/70">
            Sign out
          </button>
        </div>

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
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {tasks === null && <p className="text-sm text-foreground/50">Loading your tasks…</p>}
            {tasks?.length === 0 && <p className="text-sm text-foreground/50">No tasks assigned yet — check back soon.</p>}
            {tasks?.map((t) => {
              const progress = progressByTask[t.id];
              const pct = progress ? Math.min(100, Math.round((progress.approvedCount / t.targetCount) * 100)) : 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTaskId(t.id)}
                  className="clay p-5 text-left transition-transform hover:-translate-y-0.5"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    {t.bundleTitle} · {t.testName}
                  </p>
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
      </div>
    </div>
  );
}
