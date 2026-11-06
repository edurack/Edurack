import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { PyqBrowser, type PyqNav } from "@/components/pyq/pyq-browser";
import { PyqPractice } from "@/components/pyq/pyq-practice";
import { NcertLineByLine } from "@/components/pyq/ncert-line-by-line";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getGuestPyqTree } from "@/server-functions/pyq-guest";
import { getNcertAccess } from "@/server-functions/ncert-line-practice";
import type { PyqTree } from "@/lib/pyq-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { BookMarked, BookOpen, Sparkles, Timer } from "lucide-react";
import { getDrillAccess } from "@/server-functions/pro";
import { quickMockName } from "@/lib/quick-mock";
import { trackQuickMockClick } from "@/lib/quick-mock-analytics";
import { QuickMockStrip } from "@/components/quick-mock/quick-mock-strip";
import { PRO_FEATURES, PRO_FEATURE_KEYS, type DrillAccess } from "@/lib/pro";
import type { SessionKind } from "@/lib/pyq-types";

// Everything lives in the URL (?subject=&chapter=&topic=&practice=true) so the
// phone's back button walks up one level — Practice → Topics → Chapters →
// Subjects — instead of leaving the page.
// `weakAttempt` = "Practice my weak topics" for that test attempt (set by the result page).
// `session` = a ready-made session: today's PYQ, revision due, mistakes, or bookmarks.
// `first5` = the new-student start from the dashboard: practise just the first 5 questions of this chapter, then go back to the dashboard.
type PyqSearch = { exam?: string; subject?: string; chapter?: string; topic?: string; practice?: boolean; weakAttempt?: string; session?: SessionKind; first5?: boolean; fresh?: boolean; ncert?: boolean };

const FIRST_N = 5;

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
    fresh: search.fresh === true || search.fresh === "true" || search.fresh === 1 || search.fresh === "1" ? true : undefined,
    first5: search.first5 === true || search.first5 === "true" || search.first5 === 1 || search.first5 === "1" ? true : undefined,
    ncert: search.ncert === true || search.ncert === "true" || search.ncert === 1 || search.ncert === "1" ? true : undefined,
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
  // Edurack Pro status, for the banner under the drill/notebook tiles. Failing quietly is fine: the banner just doesn't show.
  const [proAccess, setProAccess] = useState<DrillAccess | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await getDrillAccess({ data: { token: await user.getIdToken() } });
        if (!cancelled) setProAccess(a);
      } catch {
        /* leave the banner out */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Whether THIS student can open NCERT Line by Line yet (Coming soon vs. live). Guests always see it as coming soon.
  const [ncertAccess, setNcertAccess] = useState<{ enabled: boolean; mode: "beta" | "live" } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await getNcertAccess({ data: { token: await user.getIdToken() } });
        if (!cancelled) setNcertAccess(a);
      } catch {
        /* treat as not yet available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);
  const ncertEnabled = Boolean(ncertAccess?.enabled);

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
    navigate({ search: { exam: search.exam, subject: next.subject, chapter: next.chapter, topic: next.topic, practice: next.practice, fresh: next.fresh } });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading || (guest && needsAccount)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (search.ncert && ncertEnabled) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <AppHeader user={user} />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <NcertLineByLine onExit={() => navigate({ search: { exam: search.exam } })} />
        </main>
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
                className={cn("inline-flex min-h-10 items-center rounded-full px-5 text-[13px] font-bold transition-colors motion-reduce:transition-none", (tree?.exam ?? search.exam) === k ? "bg-foreground text-background shadow-sm" : "bg-foreground/[0.07] text-foreground/75 hover:bg-foreground/10")}
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
            key={`${search.session ?? ""}|${search.weakAttempt ?? ""}|${search.subject}|${search.chapter}|${search.topic ?? ""}|${search.first5 ? "f5" : ""}|${search.fresh ? "fr" : ""}`}
            subject={search.subject}
            chapter={search.chapter}
            topic={search.topic}
            weakAttemptId={search.weakAttempt}
            session={search.session}
            exam={tree?.exam ?? search.exam}
            guest={guest}
            limit={search.first5 && !guest ? FIRST_N : undefined}
            startFresh={Boolean(search.fresh || (search.first5 && !guest))}
            source={search.first5 ? "first_five" : undefined}
            // A weak-topics session started from a result page returns to that result page.
            // Sessions go back to where they started: the daily question to the dashboard,
            // the other sessions to the notebook.
            onExit={() =>
              search.first5 && !guest
                ? navigate({ to: "/dashboard" })
                : search.session
                ? navigate({ to: search.session === "daily" ? "/dashboard" : "/notebook" })
                : search.weakAttempt
                  ? navigate({ to: "/test-result/$attemptId", params: { attemptId: search.weakAttempt } })
                  : go({ subject: search.subject, chapter: search.chapter })
            }
          />
        ) : tree === null ? (
          <div className="space-y-4" aria-live="polite" aria-busy="true">
            <div className="h-44 animate-pulse rounded-3xl bg-foreground/10" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-3xl bg-foreground/5" />
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
            <PyqBrowser
              tree={tree}
              subject={search.subject}
              chapter={search.chapter}
              onNavigate={go}
              landingExtras={
                !guest && !search.subject ? (
                  <>
            {!guest && !search.subject && (
              <div className="grid grid-cols-2 gap-3">
                <Link to="/pyq-drill" search={{ exam: tree.exam ?? undefined, src: "pyq_browse" }} onClick={() => trackQuickMockClick("pyq_browse")} className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform active:scale-[0.99]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]"><Timer className="h-[18px] w-[18px] text-[var(--sky-deep)]" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{quickMockName(tree.exam)}</span>
                    <span className="block truncate text-xs text-foreground/70">20 PYQs · 30 min</span>
                  </span>
                </Link>
                <Link to="/notebook" className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform active:scale-[0.99]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]"><BookMarked className="h-[18px] w-[18px] text-[var(--sky-deep)]" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">My notebook</span>
                    <span className="block truncate text-xs text-foreground/70">Revise · mistakes · bookmarks</span>
                  </span>
                </Link>
              </div>
            )}
            {!guest && !search.subject && (
              <button
                type="button"
                onClick={() => ncertEnabled && navigate({ search: { exam: search.exam, ncert: true } })}
                disabled={!ncertEnabled}
                aria-disabled={!ncertEnabled}
                className={cn(
                  "clay-inset flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left transition-opacity",
                  !ncertEnabled && "cursor-default opacity-80",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]"><BookOpen className="h-[18px] w-[18px] text-[var(--sky-deep)]" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">NCERT Line by Line</span>
                  <span className="block truncate text-xs text-foreground/70">Topic-by-topic questions, straight from NCERT</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", ncertEnabled ? "bg-emerald-100 text-emerald-800" : "bg-foreground/10 text-foreground/50")}>
                  {ncertEnabled ? (ncertAccess?.mode === "beta" ? "Beta access" : "Live") : "Coming soon"}
                </span>
              </button>
            )}
            {!guest && !search.subject && proAccess && (() => {
              // Dark banner when there's something to buy; a quiet card otherwise (Pro active, or Pro not on sale yet).
              const dark = proAccess.gatingOn && !proAccess.isPro;
              const unlocks = PRO_FEATURE_KEYS.filter((k) => proAccess.proOnly[k]).map((k) => PRO_FEATURES[k].label.toLowerCase()).join(" + ");
              const title = proAccess.isPro ? "Edurack Pro is active" : proAccess.gatingOn ? "Go Pro" : "Build your own drill";
              const sub = proAccess.isPro
                ? `Active until ${new Date(proAccess.proUntil ?? Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
                : proAccess.gatingOn
                  ? `Unlock ${unlocks || "more practice tools"}.`
                  : "Pick chapter or topic, difficulty, paper years and length for your own mock.";
              return (
                <Link
                  to="/pyq-drill"
                  search={{ exam: tree.exam ?? undefined, src: "pyq_browse" }}
                  className={cn("flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors", dark ? "ink-section hover:bg-[#1b2438]" : "clay hover:border-[var(--sky-deep)]/50")}
                >
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", dark ? "bg-white/10" : "bg-[var(--sky-soft)]")}>
                    <Sparkles className={cn("h-5 w-5", dark ? "text-sky-300" : "text-[var(--sky-deep)]")} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-bold", dark ? "text-white" : "text-foreground")}>{title}</span>
                    <span className={cn("block text-xs", dark ? "text-white/65" : "text-foreground/60")}>{sub}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold", dark ? "bg-white text-[#141b2b]" : proAccess.isPro ? "bg-emerald-100 text-emerald-800" : "bg-primary text-primary-foreground")}>
                    {proAccess.isPro ? "Open" : proAccess.gatingOn ? "See plans" : "Try it"}
                  </span>
                </Link>
              );
            })()}
                  </>
                ) : undefined
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
