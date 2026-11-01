// /challenge/CODE: a friend's Quick Mock challenge. Public to open (it shows who challenged you and their score), but taking it
// needs an account. Not indexed: it is a personal link, not a page for search.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Swords, Trophy } from "lucide-react";
import { noindexHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth-context";
import { getChallenge, joinChallenge } from "@/server-functions/challenges";
import { compareLine, rankEntries, type ChallengeView } from "@/lib/challenge";
import { captureReferralFromUrl } from "@/lib/referral-client";
import { track } from "@/lib/analytics";
import { formatDuration } from "@/lib/time-analysis";

export const Route = createFileRoute("/challenge/$code")({
  head: () => noindexHead("Quick Mock challenge"),
  component: ChallengePage,
});

function ChallengePage() {
  const { code } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ChallengeView | null | undefined>(undefined); // undefined = loading, null = not found
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureReferralFromUrl(); // the sharer's ?ref= code, kept until this friend signs up
  }, []);

  const load = useCallback(async () => {
    try {
      const token = user ? await user.getIdToken() : null;
      setView(await getChallenge({ data: { token, code } }));
    } catch {
      setView(null);
    }
  }, [user, code]);

  useEffect(() => {
    if (loading) return;
    void load();
  }, [loading, load]);

  async function start() {
    if (!user) return;
    setStarting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const { drillId } = await joinChallenge({ data: { token, code } });
      track("challenge_joined", { resumed: view?.you.status === "running" });
      navigate({ to: "/pyq-drill", search: { drillId, exam: view?.exam ?? undefined } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the challenge. Try again.");
      setStarting(false);
    }
  }

  const redirect = `/challenge/${code}`;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="font-display text-lg font-extrabold text-foreground">
          Edurack
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 sm:px-6">
        {view === undefined || loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
          </div>
        ) : view === null ? (
          <div className="clay p-8 text-center">
            <p className="font-display text-xl font-bold text-foreground">Challenge not found</p>
            <p className="mt-2 text-sm text-foreground/60">Check the link, or ask your friend to send it again.</p>
            <Link to="/" className="clay-btn mt-5 inline-flex rounded-full px-6 py-2.5 text-sm font-bold text-white">
              Go to Edurack
            </Link>
          </div>
        ) : (
          <Body view={view} signedIn={Boolean(user)} starting={starting} error={error} onStart={start} redirect={redirect} />
        )}
      </main>
    </div>
  );
}

function Body({ view, signedIn, starting, error, onStart, redirect }: { view: ChallengeView; signedIn: boolean; starting: boolean; error: string | null; onStart: () => void; redirect: string }) {
  const creator = view.entries.find((e) => e.isCreator) ?? null;
  const you = view.entries.find((e) => e.isYou) ?? null;
  const board = rankEntries(view.entries);
  return (
    <div className="space-y-5">
      <div className="clay p-6 text-center sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--sky-soft)]">
          <Swords className="h-6 w-6 text-[var(--sky-deep)]" aria-hidden />
        </span>
        <h1 className="font-display mt-3 text-2xl font-bold text-foreground sm:text-3xl">{view.creatorName} challenged you</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {view.questionCount} previous year questions · {view.durationMin} minutes{view.exam ? ` · ${view.exam.toUpperCase()}` : ""}
        </p>
        {view.creator && (
          <p className="font-display mt-4 text-4xl font-bold text-foreground">
            {view.creator.score}
            <span className="text-lg font-semibold text-foreground/40"> / {view.creator.maxScore}</span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-foreground/50">{view.creatorName}'s score</span>
          </p>
        )}

        {view.expired ? (
          <p className="mt-5 text-sm font-semibold text-foreground/70">This challenge has expired.</p>
        ) : view.you.status === "done" ? null : !signedIn ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/auth" search={{ tab: "signup", redirect }} className="clay-btn inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-bold text-white">
              Sign up and take the challenge
            </Link>
            <Link to="/auth" search={{ tab: "signin", redirect }} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-bold text-foreground hover:bg-foreground/5">
              I have an account
            </Link>
          </div>
        ) : view.full && view.you.status === "none" ? (
          <p className="mt-5 text-sm font-semibold text-foreground/70">This challenge is full.</p>
        ) : (
          <button type="button" onClick={onStart} disabled={starting} className="clay-btn mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-8 text-sm font-bold text-white disabled:opacity-60">
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {view.you.status === "running" ? "Continue your attempt" : "Start the challenge"}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>

      {view.you.status === "done" && (
        <div className="clay p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--sky-deep)]" aria-hidden />
            <h2 className="text-sm font-bold text-foreground">Scoreboard</h2>
          </div>
          {you && creator && !you.isCreator && <p className="mb-3 text-sm font-semibold text-foreground">{compareLine(you, creator)}</p>}
          <ol className="divide-y divide-border">
            {board.map((e, i) => (
              <li key={`${e.name}-${i}`} className={`flex items-center gap-3 py-2.5 ${e.isYou ? "font-bold" : ""}`}>
                <span className="w-5 text-sm text-foreground/50">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {e.isYou ? "You" : e.name}
                  {e.isCreator ? " (challenger)" : ""}
                </span>
                <span className="text-xs text-foreground/50">{formatDuration(e.timeTakenSec)}</span>
                <span className="w-16 text-right text-sm font-bold text-foreground">
                  {e.score}/{e.maxScore}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-foreground/50">Only first names are shown, and only to students who took part.</p>
        </div>
      )}
    </div>
  );
}
