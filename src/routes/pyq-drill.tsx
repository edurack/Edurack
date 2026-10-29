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
import { track, trackOnce } from "@/lib/analytics";
import { practiceProps } from "@/lib/practice-events";
import { cleanQuickMockSource, type QuickMockSource } from "@/lib/quick-mock";

// ?drillId= makes the drill refresh-safe: reloading resumes the same drill with
// the server's clock, and a finished drill reopens its result.
// ?src= says which entry point sent the student here (homepage, dashboard, sidebar, ...) so Quick Mock analytics can
// tell the placements apart. It is only ever used as an analytics label.
// ?chapter= (+ ?subject=) is a weak chapter sent from a test result: the launcher offers a timed drill on it.
type DrillSearch = { exam?: string; drillId?: string; src?: QuickMockSource; chapter?: string; subject?: string };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export const Route = createFileRoute("/pyq-drill")({
  validateSearch: (search: Record<string, unknown>): DrillSearch => ({ exam: str(search.exam), drillId: str(search.drillId), src: cleanQuickMockSource(search.src), chapter: str(search.chapter), subject: str(search.subject) }),
  head: () => noindexHead("Quick Mock"),
  component: DrillPage,
});

function DrillPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const { exam, drillId, src, chapter, subject } = Route.useSearch();

  const [state, setState] = useState<DrillState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Problems starting a drill (like "today's free drills are used up") are shown on the start screen, not as a dead end.
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    // Not signed in: sign in (or up), then come straight back here with the same ?src=, ?exam= and chapter.
    if (!loading && !user) {
      const qs = new URLSearchParams({ ...(exam ? { exam } : {}), ...(src ? { src } : {}), ...(chapter ? { chapter } : {}), ...(subject ? { subject } : {}) }).toString();
      navigate({ to: "/auth", search: { tab: "signin", redirect: `/pyq-drill${qs ? `?${qs}` : ""}` } });
    }
  }, [loading, user, navigate, src, exam, chapter, subject]);

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
      // startPyqDrill hands back an unfinished mock when there is one, so a refresh or a second tap never starts (or counts)
      // another. Only a NEWLY created mock is a start.
      if (!set.resumed) {
      // Same event names as ordinary PYQ practice, told apart by practice_type = "timed_drill". The older drill_started /
      // drill_submitted events are kept so existing PostHog insights keep working.
      track("drill_started", { exam, subject: opts.subject ?? null, custom: Boolean(opts.custom) });
      trackOnce(`drill-start:${set.drillId}`, "practice_started", { ...practiceProps({ mode: "timed_drill", exam, subject: opts.subject }), custom: Boolean(opts.custom), question_count: set.questions.length });
      trackOnce(`qm-start:${set.drillId}`, "quick_mock_started", { source: src ?? "direct", custom: Boolean(opts.custom), question_count: set.questions.length, duration_min: Math.round(set.durationSec / 60) });
      }
      navigate({ search: { exam, drillId: set.drillId, src }, replace: true });
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
      // submit() can run twice (the auto-submit at 0:00 racing the button); the key makes it count once.
      if (trackOnce(`drill-done:${drillId}`, "drill_submitted")) {
        track("practice_completed", {
          ...practiceProps({ mode: "timed_drill", exam }),
          answered: result.correct + result.wrong,
          correct: result.correct,
          wrong: result.wrong,
          skipped: result.skipped,
          accuracy: result.correct + result.wrong > 0 ? Math.round((result.correct / (result.correct + result.wrong)) * 100) : null,
          time_taken_sec: result.timeTakenSec,
        });
        track("quick_mock_completed", {
          source: src ?? "direct",
          score: result.score,
          max_score: result.maxScore,
          correct: result.correct,
          wrong: result.wrong,
          skipped: result.skipped,
          time_taken_sec: result.timeTakenSec,
          question_count: result.items.length,
        });
      }
      try {
        sessionStorage.removeItem(`edurack:drill:${drillId}`);
      } catch {
        // ignore
      }
      window.scrollTo({ top: 0 });
    },
    [user, drillId, exam, src],
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
            <DrillLauncher user={user} exam={exam} source={src} preset={chapter ? { chapter, subject } : undefined} starting={starting} error={startError} onStart={start} />
          </div>
        )}
      </main>
    </div>
  );
}
