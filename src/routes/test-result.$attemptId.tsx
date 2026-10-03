import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { useEffect, useState, type ComponentType } from "react";
import { IconLoader2 as Loader2, IconTrophy as Trophy, IconClock as Clock, IconCircleCheck as CheckCircle2, IconCircleX as XCircle, IconArrowLeft as ArrowLeft, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { MinusCircle, Medal, Info, ChevronDown } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { getTestAttempt, getLeaderboard } from "@/server-functions/test-results";
import { AppHeader } from "@/components/app-header";
import { SubjectBreakdownAccordion, MentorRecommendations } from "@/components/subject-performance";
import { QuestionReview, type ReviewQuestion } from "@/components/test-question-review";
import { TopicAnalysisCard } from "@/components/topic-analysis-card";

export const Route = createFileRoute("/test-result/$attemptId")({
  head: () => noindexHead("Test Result"),
  component: TestResultPage,
});

type SubjectBreakdown = { subject: string; correct: number; incorrect: number; unanswered: number; marks: number };

type Attempt = {
  id: string;
  testId: string;
  // Batch this test belongs to — powers "Back to batch" below.
  // Optional so the page still works if the backend hasn't sent it yet.
  bundleId?: string;
  testName: string;
  attemptNumber: number;
  score: number;
  totalMarks: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenMinutes: number;
  subjectBreakdown: SubjectBreakdown[];
  // Score is out of this many questions (optional "attempt any N" ones are
  // excluded), and this many optional questions were not counted.
  countedQuestions: number;
  optionalCount: number;
  submittedAt: string | null;
};

type LeaderboardEntry = {
  rank: number;
  uid: string;
  name: string;
  score: number;
  totalMarks: number;
  isYou: boolean;
};

function TestResultPage() {
  const { attemptId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [review, setReview] = useState<ReviewQuestion[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<{
    top: LeaderboardEntry[];
    yourRank: { rank: number; score: number; totalMarks: number } | null;
    totalParticipants: number;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const { attempt: a, review: r } = await getTestAttempt({ data: { token, attemptId } });
        setAttempt(a);
        setReview(r);
        const lb = await getLeaderboard({ data: { token, testId: a.testId } });
        setLeaderboard(lb);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this result.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attemptId]);

  function goToBatch() {
    if (attempt?.bundleId) {
      navigate({ to: "/course/$kind/$id", params: { kind: "bundle", id: attempt.bundleId } });
    } else {
      navigate({ to: "/dashboard" });
    }
  }

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

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <button
          onClick={goToBatch}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to batch
        </button>

        {attempt === null && !loadError ? (
          <TestResultSkeleton />
        ) : loadError || !attempt ? (
          <div className="clay mx-auto max-w-md p-8 text-center sm:p-10">
            <div className="clay-inset mx-auto grid h-16 w-16 place-items-center rounded-2xl">
              <AlertCircle className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="font-display mt-5 text-lg font-bold text-foreground">Can't show this result</p>
            <p className="mt-2 text-sm text-foreground/60">{loadError}</p>
          </div>
        ) : (
          <TestResultContent
            attempt={attempt}
            review={review}
            leaderboard={leaderboard}
          />
        )}
      </main>
    </div>
  );
}

function TestResultContent({
  attempt,
  review,
  leaderboard,
}: {
  attempt: Attempt;
  review: ReviewQuestion[] | null;
  leaderboard: {
    top: LeaderboardEntry[];
    yourRank: { rank: number; score: number; totalMarks: number } | null;
    totalParticipants: number;
  } | null;
}) {
  const percentage = attempt.totalMarks > 0 ? Math.round((attempt.score / attempt.totalMarks) * 100) : 0;
  const attempted = attempt.correctCount + attempt.incorrectCount;
  const accuracy = attempted > 0 ? Math.round((attempt.correctCount / attempted) * 100) : 0;

  const scoreTone = percentage >= 75 ? "positive" : percentage >= 40 ? "neutral" : "negative";
  const scoreColor =
    scoreTone === "positive"
      ? "text-[var(--sky-deep)]"
      : scoreTone === "negative"
        ? "text-destructive"
        : "text-amber-600 dark:text-amber-400";

  // Shared shape for both the accordion (needs correct/incorrect/unanswered
  // + a marks label) and the mentor recommendation lookup (needs just
  // subject + percent) — computed once here so the two stay in sync.
  const subjectPerformance = attempt.subjectBreakdown.map((s) => {
    const subjectTotal = (s.correct + s.incorrect + s.unanswered) * 4;
    const percent = subjectTotal > 0 ? Math.max(0, Math.round((s.marks / subjectTotal) * 100)) : 0;
    return {
      subject: s.subject,
      correct: s.correct,
      incorrect: s.incorrect,
      unanswered: s.unanswered,
      percent,
      marksLabel: `${s.marks} / ${subjectTotal} marks`,
    };
  });

  return (
    <>
      {/* Hero score card */}
      <div className="clay mb-4 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none sm:p-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-foreground/50">
          {attempt.testName}
          {attempt.attemptNumber > 1 && (
            <span className="ml-1.5 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
              Attempt {attempt.attemptNumber}
            </span>
          )}
        </p>

        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing percent={percentage} tone={scoreTone} score={attempt.score} total={attempt.totalMarks} />
            <div className="flex items-center gap-2">
              <span className={`rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold ${scoreColor}`}>{percentage}% score</span>
              {attempted > 0 && (
                <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-foreground/60">
                  {accuracy}% accuracy
                </span>
              )}
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
            <StatBox icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" value={attempt.correctCount} label="Correct" />
            <StatBox icon={XCircle} color="text-destructive" value={attempt.incorrectCount} label="Incorrect" />
            <StatBox icon={MinusCircle} color="text-foreground/40" value={attempt.unansweredCount} label="Skipped" />
            <StatBox icon={Clock} color="text-foreground/40" value={attempt.timeTakenMinutes} label="Minutes" />
          </div>
        </div>

        {attempt.optionalCount > 0 && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[var(--sky-soft)]/50 px-3.5 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sky-deep)]" aria-hidden />
            <p className="text-xs leading-relaxed text-foreground/70">
              Your score is out of <span className="font-bold text-foreground">{attempt.countedQuestions} questions</span>.{" "}
              {attempt.optionalCount} optional question{attempt.optionalCount === 1 ? "" : "s"} (the &ldquo;attempt any N&rdquo;
              groups) aren&rsquo;t counted.
            </p>
          </div>
        )}
      </div>

      {/* On-demand topic/chapter analysis */}
      <TopicAnalysisCard attemptId={attempt.id} />

      {/* Subject-wise breakdown — expandable per subject, with accuracy and
          an estimated percentile alongside the marks. */}
      <div className="clay mb-6 p-5 sm:p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">Subject-wise breakdown</p>
        <SubjectBreakdownAccordion subjects={subjectPerformance} />
      </div>

      {/* Mentor recommendation — surfaced for weak subject(s), matched
          against each mentor's Expertise Showcase and only shown when the
          mentor's own score genuinely beats the student's. */}
      <MentorRecommendations subjects={subjectPerformance.map((s) => ({ subject: s.subject, percent: s.percent }))} />

      {/* Leaderboard — top 5 first so it doesn't push the review off-screen */}
      {leaderboard && <LeaderboardCard leaderboard={leaderboard} />}

      {/* Question-by-question review — mobile-first: collapsible cards, a
          tap-to-jump question palette, and status filters. See
          components/test-question-review.tsx */}
      <QuestionReview
        review={review}
        subjects={attempt.subjectBreakdown.map((s) => s.subject)}
        countedQuestions={attempt.countedQuestions}
      />
    </>
  );
}

function StatBox({
  icon: Icon,
  color,
  value,
  label,
}: {
  // Accepts an icon component from either @tabler/icons-react or
  // lucide-react — both accept className as an optional prop, which is all
  // this component actually uses.
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <div className="clay-inset flex items-center gap-3 rounded-2xl px-3.5 py-3">
      <Icon className={`h-5 w-5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-foreground">{value}</p>
        <p className="mt-1 text-[11px] text-foreground/50">{label}</p>
      </div>
    </div>
  );
}

// Animated donut: the arc sweeps in on mount instead of the number just
// appearing, which feels a lot smoother than a static card.
function ScoreRing({
  percent,
  tone,
  score,
  total,
}: {
  percent: number;
  tone: "positive" | "neutral" | "negative";
  score: number;
  total: number;
}) {
  const R = 68;
  const C = 2 * Math.PI * R;
  const target = Math.max(0, Math.min(100, percent));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const stroke =
    tone === "positive" ? "stroke-[var(--sky-deep)]" : tone === "negative" ? "stroke-destructive" : "stroke-amber-500";

  return (
    <div className="relative h-40 w-40 sm:h-44 sm:w-44" role="img" aria-label={`Score ${score} out of ${total}, ${percent} percent`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" strokeWidth="12" className="stroke-foreground/10" />
        <circle
          cx="80"
          cy="80"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className={`${stroke} motion-reduce:transition-none`}
          style={{
            strokeDasharray: C,
            strokeDashoffset: C * (1 - shown / 100),
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-4xl font-bold leading-none text-foreground">{score}</p>
        <p className="mt-1 text-xs font-semibold text-foreground/40">out of {total}</p>
      </div>
    </div>
  );
}

function LeaderboardCard({
  leaderboard,
}: {
  leaderboard: {
    top: LeaderboardEntry[];
    yourRank: { rank: number; score: number; totalMarks: number } | null;
    totalParticipants: number;
  };
}) {
  const [showAll, setShowAll] = useState(false);
  // Always keep "you" visible even if you're outside the collapsed top 5.
  const collapsed = leaderboard.top.filter((e, i) => i < 5 || e.isYou);
  const rows = showAll ? leaderboard.top : collapsed;
  const hidden = leaderboard.top.length - collapsed.length;

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-foreground/60" />
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Leaderboard</p>
        </div>
        <span className="clay-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-foreground/60">
          {leaderboard.totalParticipants} participants
        </span>
      </div>

      {leaderboard.yourRank && leaderboard.yourRank.rank > 20 && (
        <div className="clay-inset mb-3 flex items-center justify-between rounded-2xl px-4 py-2.5 ring-2 ring-[var(--sky-deep)]">
          <span className="text-sm font-semibold text-foreground">Your rank: #{leaderboard.yourRank.rank}</span>
          <span className="text-sm text-foreground/60">
            {leaderboard.yourRank.score} / {leaderboard.yourRank.totalMarks}
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((entry) => (
          <li
            key={entry.uid}
            className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 sm:px-4 ${
              entry.isYou ? "clay-inset ring-2 ring-[var(--sky-deep)]" : "hover:bg-foreground/5"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  entry.rank === 1
                    ? "bg-[var(--sky-deep)] text-white"
                    : entry.rank <= 3
                      ? "bg-[var(--sky-soft)] text-foreground"
                      : "bg-foreground/10 text-foreground/60"
                }`}
              >
                {entry.rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : entry.rank}
              </span>
              <span className="truncate text-sm font-semibold text-foreground">
                {entry.name}
                {entry.isYou && <span className="ml-1.5 text-xs text-foreground/40">(You)</span>}
              </span>
            </div>
            <span className="shrink-0 text-sm text-foreground/60">
              {entry.score} / {entry.totalMarks}
            </span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold text-[var(--sky-deep)] hover:bg-foreground/5"
        >
          {showAll ? "Show less" : `Show top ${leaderboard.top.length}`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

function TestResultSkeleton() {
  return (
    <div>
      <div className="clay mb-6 p-5 text-center sm:p-8">
        <div className="mx-auto h-3 w-40 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
          <div className="h-40 w-40 animate-pulse rounded-full bg-foreground/10 sm:h-44 sm:w-44" />
          <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="clay-inset h-14 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        </div>
      </div>
      <div className="clay mb-6 p-5 sm:p-6">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-full bg-foreground/5" />
          ))}
        </div>
      </div>
      <div className="clay p-5 sm:p-6">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="clay-inset h-14 animate-pulse rounded-2xl bg-foreground/5" />
          ))}
        </div>
      </div>
    </div>
  );
}