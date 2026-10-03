import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { noindexHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { PyqBrowser, type PyqNav } from "@/components/pyq/pyq-browser";
import { PyqPractice } from "@/components/pyq/pyq-practice";
import { getPyqTree } from "@/server-functions/pyq-practice";
import type { PyqTree } from "@/lib/pyq-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

// Everything lives in the URL (?subject=&chapter=&topic=&practice=true) so the
// phone's back button walks up one level — Practice → Topics → Chapters →
// Subjects — instead of leaving the page.
// `weakAttempt` = "Practice my weak topics" for that test attempt (set by the result page).
type PyqSearch = { exam?: string; subject?: string; chapter?: string; topic?: string; practice?: boolean; weakAttempt?: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export const Route = createFileRoute("/pyq")({
  validateSearch: (search: Record<string, unknown>): PyqSearch => ({
    exam: EXAM_KEYS.find((k) => k === search.exam),
    subject: str(search.subject),
    chapter: str(search.chapter),
    topic: str(search.topic),
    weakAttempt: str(search.weakAttempt),
    practice: search.practice === true || search.practice === "true" || search.practice === 1 || search.practice === "1" ? true : undefined,
  }),
  head: () => noindexHead("PYQ Practice"),
  component: PyqPage,
});

function PyqPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const [tree, setTree] = useState<PyqTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load on mount and again whenever practice mode flips, so the progress bars
  // reflect what the student just solved. The old tree stays on screen while
  // it refreshes (no skeleton flash).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const t = await getPyqTree({ data: { token, exam: search.exam } });
        if (!cancelled) {
          setTree(t);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load PYQs.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, search.practice, search.exam]);

  function go(next: PyqNav) {
    navigate({ search: { exam: search.exam, subject: next.subject, chapter: next.chapter, topic: next.topic, practice: next.practice } });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const practising = Boolean(search.practice && ((search.subject && search.chapter) || search.weakAttempt));

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {!practising && (
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Exam">
            {EXAM_KEYS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={(tree?.exam ?? search.exam) === k}
                // Switching exam resets subject/chapter/topic — they belong to the old exam.
                onClick={() => {
                  setTree(null);
                  navigate({ search: { exam: k } });
                }}
                className={cn("clay-chip px-4 py-1.5 text-xs font-bold", (tree?.exam ?? search.exam) === k && "ring-2 ring-[var(--sky-deep)]")}
              >
                {EXAM_LABELS[k]}
              </button>
            ))}
          </div>
          )}
        {error && !tree ? (
          <div className="clay mx-auto max-w-md p-8 text-center sm:p-10">
            <div className="clay-inset mx-auto grid h-16 w-16 place-items-center rounded-2xl">
              <AlertCircle className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="font-display mt-5 text-lg font-bold text-foreground">Can't load PYQs</p>
            <p className="mt-2 text-sm text-foreground/60">{error}</p>
          </div>
        ) : practising ? (
          <PyqPractice
            // Re-mount (fresh filters/answers) when the student picks a different chapter or topic.
            key={`${search.weakAttempt ?? ""}|${search.subject}|${search.chapter}|${search.topic ?? ""}`}
            subject={search.subject}
            chapter={search.chapter}
            topic={search.topic}
            weakAttemptId={search.weakAttempt}
            exam={tree?.exam ?? search.exam}
            // A weak-topics session started from a result page returns to that result page.
            onExit={() =>
              search.weakAttempt
                ? navigate({ to: "/test-result/$attemptId", params: { attemptId: search.weakAttempt } })
                : go({ subject: search.subject, chapter: search.chapter })
            }
          />
        ) : tree === null ? (
          <div className="space-y-3" aria-live="polite">
            <div className="h-8 w-48 animate-pulse rounded-full bg-foreground/10" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="clay-inset h-24 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          </div>
        ) : (
          <PyqBrowser tree={tree} subject={search.subject} chapter={search.chapter} onNavigate={go} />
        )}
      </main>
    </div>
  );
}
