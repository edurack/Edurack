import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { Bookmark, BookMarked, CheckCircle2, ChevronRight, RotateCcw, XCircle } from "lucide-react";
import { noindexHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { getNotebookSummary } from "@/server-functions/practice-extras";
import type { NotebookSummary, SessionKind } from "@/lib/pyq-types";
import { REVIEW_INTERVAL_DAYS } from "@/lib/practice-schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notebook")({
  head: () => noindexHead("My notebook"),
  component: NotebookPage,
});

function NotebookPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<NotebookSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await getNotebookSummary({ data: { token } });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your notebook.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">My notebook</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Questions you got wrong come back after {REVIEW_INTERVAL_DAYS.join(", ")} days, so they actually stick.
        </p>

        {error ? (
          <div className="clay mx-auto mt-6 max-w-md p-8 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-foreground/60">{error}</p>
          </div>
        ) : data === null ? (
          <div className="mt-6 space-y-3" aria-live="polite">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="clay-inset h-24 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : (
          <div className="mt-6 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
            <Tile
              kind="due"
              icon={RotateCcw}
              title="Revision due"
              count={data.due}
              emptyText={
                data.nextDueAt
                  ? `All caught up. Next revision: ${new Date(data.nextDueAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}.`
                  : "All caught up. Mistakes you make will show up here."
              }
              action="Revise now"
              highlight
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Tile kind="wrong" icon={XCircle} title="Your mistakes" count={data.wrong} emptyText="No mistakes to fix." action="Practise them" />
              <Tile kind="bookmarked" icon={Bookmark} title="Bookmarks" count={data.bookmarked} emptyText="Tap the bookmark icon on any question to save it." action="Open bookmarks" />
            </div>

            <div className="clay-inset mt-3 flex items-center gap-3 rounded-2xl px-4 py-3.5">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm text-foreground/70">
                <span className="font-bold text-foreground">{data.mastered}</span> question{data.mastered === 1 ? "" : "s"} mastered — you got{" "}
                {data.mastered === 1 ? "it" : "them"} right on every revision.
              </p>
            </div>

            <Link to="/pyq" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--sky-deep)]">
              <BookMarked className="h-4 w-4" aria-hidden />
              Browse all PYQs
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function Tile({
  kind,
  icon: Icon,
  title,
  count,
  emptyText,
  action,
  highlight,
}: {
  kind: SessionKind;
  icon: typeof Bookmark;
  title: string;
  count: number;
  emptyText: string;
  action: string;
  highlight?: boolean;
}) {
  const has = count > 0;
  return (
    <section className={cn("clay p-5", highlight && has && "ring-2 ring-[var(--sky-deep)]")}>
      <div className="flex items-start gap-3">
        <div className="clay-inset grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
          <Icon className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{title}</p>
          <p className="font-display text-3xl font-bold leading-tight text-foreground">{count}</p>
        </div>
      </div>
      {has ? (
        <Link
          to="/pyq"
          search={{ practice: true, session: kind }}
          className="clay-btn mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold text-white"
        >
          {action}
        </Link>
      ) : (
        <p className="mt-3 text-sm text-foreground/60">{emptyText}</p>
      )}
    </section>
  );
}
