import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { ChevronLeft } from "lucide-react";
import { noindexHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { DrillResultView, DrillRunner } from "@/components/pyq/pyq-drill";
import { DrillLauncher, type StartOptions } from "@/components/pyq/drill-launcher";
import { getPyqDrill, startPyqDrill, submitPyqDrill } from "@/server-functions/practice-extras";
import type { DrillState } from "@/lib/pyq-types";
import type { DrillAnswer } from "@/lib/practice-schedule";
import { track } from "@/lib/analytics";

// ?drillId= makes the drill refresh-safe: reloading resumes the same drill with
// the server's clock, and a finished drill reopens its result.
type DrillSearch = { exam?: string; drillId?: string };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export const Route = createFileRoute("/pyq-drill")({
  validateSearch: (search: Record<string, unknown>): DrillSearch => ({ exam: str(search.exam), drillId: str(search.drillId) }),
  head: () => noindexHead("Timed PYQ drill"),
  component: DrillPage,
});

function DrillPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const { exam, drillId } = Route.useSearch();

  const [state, setState] = useState<DrillState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Problems starting a drill (like "today's free drills are used up") are shown on the start screen, not as a dead end.
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load (or resume) the drill named in the URL.
  useEffect(() => {
    if (!user || !drillId) {
      setState(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const s = await getPyqDrill({ data: { token, drillId } });
        if (!cancelled) setState(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this drill.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, drillId]);

  async function start(opts: StartOptions = {}) {
    if (!user || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const token = await user.getIdToken();
      const set = await startPyqDrill({ data: { token, exam, subject: opts.subject, custom: opts.custom } });
      setState({ status: "running", set });
      track("drill_started", { exam, subject: opts.subject ?? null, custom: Boolean(opts.custom) });
      navigate({ search: { exam, drillId: set.drillId }, replace: true });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start the drill.");
    } finally {
      setStarting(false);
    }
  }

  const submit = useCallback(
    async (answers: Record<string, DrillAnswer>) => {
      if (!user || !drillId) return;
      const token = await user.getIdToken();
      const result = await submitPyqDrill({ data: { token, drillId, answers } });
      setState({ status: "done", result });
      track("drill_submitted");
      try {
        sessionStorage.removeItem(`edurack:drill:${drillId}`);
      } catch {
        // ignore
      }
      window.scrollTo({ top: 0 });
    },
    [user, drillId],
  );

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {error && !state ? (
          <div className="clay mx-auto max-w-md p-8 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-foreground/70">{error}</p>
            <button onClick={() => navigate({ search: { exam }, replace: true })} className="clay-btn mt-5 rounded-full px-5 py-2.5 text-sm font-bold text-white">
              Back
            </button>
          </div>
        ) : drillId && state === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
          </div>
        ) : state?.status === "running" ? (
          <DrillRunner key={state.set.drillId} set={state.set} onSubmit={submit} />
        ) : state?.status === "done" ? (
          <DrillResultView result={state.result} onBack={() => navigate({ to: "/pyq", search: { exam } })} />
        ) : (
          <div className="mx-auto max-w-lg animate-in fade-in duration-300 motion-reduce:animate-none">
            <button onClick={() => navigate({ to: "/pyq", search: { exam } })} className="mb-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-foreground/5">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              PYQs
            </button>
            <DrillLauncher user={user} exam={exam} starting={starting} error={startError} onStart={start} />
          </div>
        )}
      </main>
    </div>
  );
}
