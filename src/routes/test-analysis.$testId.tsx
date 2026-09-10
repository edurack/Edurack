import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconTrendingUp as TrendingUp, IconChevronRight as ChevronRight, IconArrowLeft as ArrowLeft, IconTrophy as Trophy } from "@tabler/icons-react";
import { TrendingDown, AlertTriangle, Target, Repeat } from "lucide-react"; // TODO: no Tabler mapping found yet
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { useAuth } from "@/lib/auth-context";
import { getTestAnalysis } from "@/server-functions/test-results";
import { SmartContent } from "@/lib/smart-content";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/test-analysis/$testId")({
  component: TestAnalysisPage,
});

type AttemptRow = {
  id: string;
  attemptNumber: number;
  score: number;
  totalMarks: number;
  timeTakenMinutes: number;
  submittedAt: string | null;
};

type SubjectAccuracy = {
  subject: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracyPercent: number;
};

type RecurringMistake = {
  questionNo: number;
  subject: string;
  body: string;
  correctOption: "A" | "B" | "C" | "D";
  solution: string;
  wrongCount: number;
  totalSeen: number;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TestAnalysisPage() {
  const { testId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [testName, setTestName] = useState<string | null>(null);
  // The batch this test belongs to — used so "Back" returns to the batch
  // itself instead of the generic dashboard. Falls back to /dashboard if
  // the backend hasn't been updated to send it yet.
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [subjectAccuracy, setSubjectAccuracy] = useState<SubjectAccuracy[]>([]);
  const [recurringMistakes, setRecurringMistakes] = useState<RecurringMistake[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const data = await getTestAnalysis({ data: { token, testId } });
      setTestName(data.testName);
      setBundleId((data as { bundleId?: string }).bundleId ?? null);
      setAttempts(data.attempts);
      setSubjectAccuracy(data.subjectAccuracy);
      setRecurringMistakes(data.recurringMistakes);
    })();
  }, [user, testId]);

  function goBack() {
    if (bundleId) {
      navigate({ to: "/course/$kind/$id", params: { kind: "bundle", id: bundleId } });
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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <button
          onClick={goBack}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to batch
        </button>

        {attempts === null ? (
          <TestAnalysisSkeleton />
        ) : attempts.length === 0 ? (
          <div className="clay mx-auto max-w-md p-8 text-center sm:p-10">
            <div className="clay-inset mx-auto grid h-16 w-16 place-items-center rounded-2xl">
              <Target className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="font-display mt-5 text-lg font-bold text-foreground">No attempts yet</p>
            <p className="mt-2 text-sm text-foreground/60">
              Take this test at least once to see your analysis here.
            </p>
          </div>
        ) : (
          <TestAnalysisContent
            testName={testName}
            attempts={attempts}
            subjectAccuracy={subjectAccuracy}
            recurringMistakes={recurringMistakes}
            onOpenAttempt={(attemptId) =>
              navigate({ to: "/test-result/$attemptId", params: { attemptId } })
            }
          />
        )}
      </main>
    </div>
  );
}

function TestAnalysisContent({
  testName,
  attempts,
  subjectAccuracy,
  recurringMistakes,
  onOpenAttempt,
}: {
  testName: string | null;
  attempts: AttemptRow[];
  subjectAccuracy: SubjectAccuracy[];
  recurringMistakes: RecurringMistake[];
  onOpenAttempt: (attemptId: string) => void;
}) {
  const chartData = attempts.map((a) => ({
    attempt: `#${a.attemptNumber}`,
    score: a.score,
    percent: a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0,
  }));

  const weakestSubject = [...subjectAccuracy].sort((a, b) => a.accuracyPercent - b.accuracyPercent)[0];
  const bestAttempt = [...attempts].sort((a, b) => b.score - a.score)[0];
  const latestAttempt = attempts[attempts.length - 1];
  const avgPercent =
    Math.round(
      chartData.reduce((sum, d) => sum + d.percent, 0) / Math.max(1, chartData.length),
    ) || 0;
  const trend =
    attempts.length > 1 ? latestAttempt.score - attempts[attempts.length - 2].score : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {testName}
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Your performance across {attempts.length} attempt{attempts.length > 1 ? "s" : ""}.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Trophy}
          label="Best score"
          value={`${bestAttempt.score}`}
          sub={`/ ${bestAttempt.totalMarks}`}
        />
        <StatCard icon={Target} label="Average" value={`${avgPercent}%`} sub="all attempts" />
        <StatCard
          icon={trend >= 0 ? TrendingUp : TrendingDown}
          label="Last vs prev"
          value={`${trend >= 0 ? "+" : ""}${trend}`}
          sub="marks"
          tone={attempts.length > 1 ? (trend >= 0 ? "positive" : "negative") : "neutral"}
        />
        <StatCard icon={Repeat} label="Attempts" value={`${attempts.length}`} sub="taken" />
      </div>

      <div className="clay mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-foreground/60" />
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Score over attempts
          </p>
        </div>
        {attempts.length > 1 ? (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="attempt" stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                  formatter={(value: number) => [value, "Score"]}
                />
                <ReferenceLine
                  y={attempts.reduce((s, a) => s + a.score, 0) / attempts.length}
                  stroke="var(--foreground)"
                  strokeOpacity={0.15}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--sky-deep)"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-foreground/60">
            Take this test again to start seeing your score trend over time.
          </p>
        )}
      </div>

      <div className="clay mb-6 p-5 sm:p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">Attempt history</p>
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onOpenAttempt(a.id)}
                className="clay-inset group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    Attempt {a.attemptNumber}
                    {a.id === bestAttempt.id && attempts.length > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                        <Trophy className="h-2.5 w-2.5" />
                        Best
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-foreground/50">
                    {formatDateTime(a.submittedAt)} · {a.timeTakenMinutes} min
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {a.score} / {a.totalMarks}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="clay mb-6 p-5 sm:p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          Subject-wise accuracy (across all attempts)
        </p>
        <div className="space-y-3">
          {subjectAccuracy.map((s) => (
            <div key={s.subject}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">{s.subject}</span>
                <span className="text-foreground/60">
                  {s.accuracyPercent}% · {s.correct}✓ {s.incorrect}✗ {s.unanswered}–
                </span>
              </div>
              <div className="clay-inset h-2.5 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    s.accuracyPercent < 50 ? "bg-[var(--coral-soft)]" : "bg-[var(--sky-deep)]"
                  }`}
                  style={{ width: `${s.accuracyPercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {weakestSubject && weakestSubject.accuracyPercent < 60 && (
          <div className="clay-inset mt-4 flex items-start gap-2 rounded-2xl bg-[var(--coral-soft)]/30 px-4 py-3 text-xs text-foreground/70">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>{weakestSubject.subject}</strong> is your weakest area at{" "}
              {weakestSubject.accuracyPercent}% accuracy — consider spending extra revision time there.
            </p>
          </div>
        )}
      </div>

      {recurringMistakes.length > 0 && (
        <div className="clay p-5 sm:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Questions you keep getting wrong
          </p>
          <div className="space-y-3">
            {recurringMistakes.map((q) => {
              const missRate = Math.round((q.wrongCount / Math.max(1, q.totalSeen)) * 100);
              return (
                <div key={`${q.subject}-${q.questionNo}`} className="clay-inset rounded-2xl p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground/50">
                      Q{q.questionNo} · {q.subject}
                    </span>
                    <span className="rounded-full bg-[var(--coral-soft)]/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      Wrong {q.wrongCount} of {q.totalSeen} · {missRate}%
                    </span>
                  </div>
                  <SmartContent value={q.body} className="mb-2 text-sm text-foreground" />
                  <div className="clay-inset rounded-xl px-3 py-2 text-xs text-foreground/70">
                    <span className="font-semibold">Correct answer: {q.correctOption}</span>
                    {q.solution && (
                      <div className="mt-1">
                        <SmartContent value={q.solution} className="text-foreground/70" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  sub: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    tone === "positive"
      ? "text-[var(--sky-deep)]"
      : tone === "negative"
        ? "text-[var(--coral-soft)]"
        : "text-foreground";

  return (
    <div className="clay p-3.5 sm:p-4">
      <Icon className="mb-2 h-4 w-4 text-foreground/40" />
      <p className={`font-display text-xl font-bold sm:text-2xl ${valueColor}`}>{value}</p>
      <p className="text-[11px] text-foreground/50">
        {label} <span className="text-foreground/30">· {sub}</span>
      </p>
    </div>
  );
}

function TestAnalysisSkeleton() {
  return (
    <div>
      <div className="mb-6 h-7 w-64 animate-pulse rounded-full bg-foreground/10" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="clay p-4">
            <div className="mb-2 h-4 w-4 animate-pulse rounded-full bg-foreground/10" />
            <div className="h-6 w-12 animate-pulse rounded-full bg-foreground/10" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded-full bg-foreground/10" />
          </div>
        ))}
      </div>
      <div className="clay mb-6 h-64 p-5 sm:p-6">
        <div className="h-full w-full animate-pulse rounded-2xl bg-foreground/5" />
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