import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { PyqBrowser, type PyqNav } from "@/components/pyq/pyq-browser";
import { PyqPractice } from "@/components/pyq/pyq-practice";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getGuestPyqTree } from "@/server-functions/pyq-guest";
import type { PyqTree } from "@/lib/pyq-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { BookMarked, Timer } from "lucide-react";
import type { SessionKind } from "@/lib/pyq-types";

// Everything lives in the URL (?subject=&chapter=&topic=&practice=true) so the
// phone's back button walks up one level — Practice → Topics → Chapters →
// Subjects — instead of leaving the page.
// `weakAttempt` = "Practice my weak topics" for that test attempt (set by the result page).
// `session` = a ready-made session: today's PYQ, revision due, mistakes, or bookmarks.
type PyqSearch = { exam?: string; subject?: string; chapter?: string; topic?: string; practice?: boolean; weakAttempt?: string; session?: SessionKind };

const SESSIONS: SessionKind[] = ["daily", "due", "wrong", "bookmarked"];

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export const Route = createFileRoute("/pyq")({
  validateSearch: (search: Record<string, unknown>): PyqSearch => ({
    exam: EXAM_KEYS.find((k) => k === search.exam),
    subject: str(search.subject),
    chapter: str(search.chapter),
    topic: str(search.topic),
    weakAttempt: str(search.weakAttempt),
    session: SESSIONS.find((k) => k === search.session),
    practice: search.practice === true || search.practice === "true" || search.practice === 1 || search.practice === "1" ? true : undefined,
  }),
  // Public now: logged-out visitors can browse and try a few questions.
  head: () =>
    pageHead({
      title: "NEET PYQ Practice 2020-2026, Chapter-wise",
      path: "/pyq",
      description:
        "Practise NEET previous year questions chapter-wise and topic-wise with detailed solutions. Try your first 5 questions without logging in. Free.",
    }),
  component: PyqPage,
});

function PyqPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const [tree, setTree] = useState<PyqTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Logged out is fine: guests get the browse tree and a few free questions.
  const guest = !loading && !user;
  // Sessions and weak-topic runs belong to an account; send a guest who lands on one of those links to log in.
  const needsAccount = Boolean(search.session || search.weakAttempt);
  useEffect(() => {
    if (guest && needsAccount) navigate({ to: "/auth", search: { tab: "signin" } });
  }, [guest, needsAccount, navigate]);

  // Load on mount and again whenever practice mode flips, so the progress bars
  // reflect what the student just solved. The old tree stays on screen while
  // it refreshes (no skeleton flash).
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const t = user
          ? await getPyqTree({ data: { token: await user.getIdToken(), exam: search.exam } })
          : await getGuestPyqTree({ data: { exam: search.exam } });
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
  }, [user, loading, search.practice, search.exam]);

  function go(next: PyqNav) {
    navigate({ search: { exam: search.exam, subject: next.subject, chapter: next.chapter, topic: next.topic, practice: next.practice } });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading || (guest && needsAccount)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const practising = Boolean(
    search.practice && ((search.subject && search.chapter) || (!guest && (search.weakAttempt || search.session))),
  );

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
            key={`${search.session ?? ""}|${search.weakAttempt ?? ""}|${search.subject}|${search.chapter}|${search.topic ?? ""}`}
            subject={search.subject}
            chapter={search.chapter}
            topic={search.topic}
            weakAttemptId={search.weakAttempt}
            session={search.session}
            exam={tree?.exam ?? search.exam}
            guest={guest}
            // A weak-topics session started from a result page returns to that result page.
            // Sessions go back to where they started: the daily question to the dashboard,
            // the other sessions to the notebook.
            onExit={() =>
              search.session
                ? navigate({ to: search.session === "daily" ? "/dashboard" : "/notebook" })
                : search.weakAttempt
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
          <>
            {guest && !search.subject && (
              <div className="clay-inset mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-foreground/70">
                  <span className="font-bold text-foreground">Try before you sign up.</span> Pick a chapter and practise your first 5 questions free. A free account unlocks everything and saves your progress.
                </p>
                <div className="flex shrink-0 gap-2">
                  <Link to="/auth" search={{ tab: "signup" }} className="clay-btn inline-flex h-10 items-center rounded-full px-4 text-xs font-bold text-white">
                    Create free account
                  </Link>
                  <Link to="/auth" search={{ tab: "signin" }} className="clay-chip inline-flex h-10 items-center rounded-full px-4 text-xs font-bold text-foreground/80">
                    Log in
                  </Link>
                </div>
              </div>
            )}
            {!guest && !search.subject && (
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                <Link to="/pyq-drill" search={{ exam: tree.exam ?? undefined }} className="clay-inset flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left">
                  <Timer className="h-4 w-4 shrink-0 text-[var(--sky-deep)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">Timed drill</span>
                    <span className="block truncate text-[11px] text-foreground/50">20 questions · 30 min</span>
                  </span>
                </Link>
                <Link to="/notebook" className="clay-inset flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left">
                  <BookMarked className="h-4 w-4 shrink-0 text-[var(--sky-deep)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">My notebook</span>
                    <span className="block truncate text-[11px] text-foreground/50">Revise · mistakes · bookmarks</span>
                  </span>
                </Link>
              </div>
            )}
            <PyqBrowser tree={tree} subject={search.subject} chapter={search.chapter} onNavigate={go} />
          </>
        )}
      </main>
    </div>
  );
}
