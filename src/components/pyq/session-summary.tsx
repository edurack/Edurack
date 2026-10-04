import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookMarked, Flame, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MentorRecommendations } from "@/components/subject-performance";
import { getWeakUpsell } from "@/server-functions/practice-extras";
import type { WeakUpsell } from "@/lib/pyq-types";

export type SessionStats = { answered: number; correct: number; wrong: number; peeked: number };

/**
 * Shown when a practice session ends. For a weak-topics session it also offers
 * (never forces) the next step: paid test series that really cover those
 * chapters, plus the existing mentor recommendations.
 */
export function SessionSummary({
  title,
  stats,
  streak,
  weakAttemptId,
  onDone,
}: {
  title: string;
  stats: SessionStats;
  streak: number | null;
  weakAttemptId?: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [upsell, setUpsell] = useState<WeakUpsell | null>(null);

  useEffect(() => {
    if (!user || !weakAttemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await getWeakUpsell({ data: { token, attemptId: weakAttemptId } });
        if (!cancelled) setUpsell(res);
      } catch {
        // The upsell is a bonus — a failure here must never get in the way of the summary.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, weakAttemptId]);

  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const toRevise = stats.wrong + stats.peeked;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <div className="clay p-6 text-center sm:p-8">
        <Trophy className="mx-auto h-9 w-9 text-[var(--sky-deep)]" aria-hidden />
        <p className="font-display mt-3 text-xl font-bold text-foreground">{title} complete</p>
        {stats.answered > 0 ? (
          <p className="mt-1 text-sm text-foreground/60">
            You answered <span className="font-bold text-foreground">{stats.answered}</span> — <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats.correct} correct</span> ({accuracy}%)
          </p>
        ) : (
          <p className="mt-1 text-sm text-foreground/60">No answers this time — that's fine, come back anytime.</p>
        )}

        <div className="mt-5 space-y-2.5 text-left">
          {streak !== null && streak > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-amber-500/10 px-3.5 py-3 text-sm">
              <Flame className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span className="font-semibold text-foreground">{streak}-day streak</span>
              <span className="text-foreground/60">— practise again tomorrow to keep it.</span>
            </div>
          )}
          {toRevise > 0 && (
            <Link to="/notebook" className="flex items-center gap-2.5 rounded-2xl bg-[var(--sky-soft)]/50 px-3.5 py-3 text-sm">
              <BookMarked className="h-4 w-4 shrink-0 text-[var(--sky-deep)]" aria-hidden />
              <span className="text-foreground/80">
                <span className="font-bold">{toRevise}</span> saved to your notebook — we'll remind you to revise {toRevise === 1 ? "it" : "them"} in 2 days.
              </span>
            </Link>
          )}
        </div>

        <button onClick={onDone} className="clay-btn mt-6 rounded-full px-8 py-3 text-sm font-bold text-white">
          Done
        </button>
      </div>

      {weakAttemptId && upsell && upsell.bundles.length > 0 && (
        <div className="clay mt-4 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Want more practice on these chapters?</p>
          <div className="mt-3 space-y-3">
            {upsell.bundles.map((b) => (
              <Link
                key={b.id}
                to="/course/$kind/$id"
                params={{ kind: "bundle", id: b.id }}
                className="clay-inset flex items-center justify-between gap-3 rounded-2xl p-4 transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{b.title}</p>
                  <p className="mt-0.5 text-xs text-foreground/60">
                    {b.matchingQuestions} question{b.matchingQuestions === 1 ? "" : "s"} on {b.chapters.join(", ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-foreground">₹{b.sellingPrice.toLocaleString("en-IN")}</p>
                  {b.crossedPrice > b.sellingPrice && (
                    <p className="text-[11px] text-foreground/40 line-through">₹{b.crossedPrice.toLocaleString("en-IN")}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-foreground/40">PYQ practice stays free. These are optional full-length test series.</p>
        </div>
      )}

      {weakAttemptId && upsell && upsell.weakSubjects.length > 0 && (
        <div className="mt-4">
          <MentorRecommendations subjects={upsell.weakSubjects} />
        </div>
      )}
    </div>
  );
}
