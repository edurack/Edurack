import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconLoader2 as Loader2, IconPlus as Plus, IconX as X, IconTag as Tag, IconFileText as FileText, IconCurrencyRupee as IndianRupee, IconSend as Send, IconLock as Lock, IconCircleCheck as CheckCircle2, IconEye as Eye, IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { Scale, Timer, Link2, Clock3, Circle } from "lucide-react"; // TODO: no Tabler mapping found yet
import {
  getSellTestsAccessStatus,
  requestSellTestsAccess,
  upsertSoldTest,
  listMySoldTests,
  submitSoldTestForIngestion,
  listSoldTestQuestionsForMentorReview,
  approveSoldTestContent,
  attachSoldTestToBatch,
  detachSoldTestFromBatch,
  listMyBatchesForAttach,
} from "@/server-functions/mentor-sell-tests";
import type { SubjectWeightage, SoldTestIngestionProgress, SellTestsAccessStatus } from "@/lib/admin-types";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  EmptyState,
  ErrorBanner,
  FileUploadField,
  inputClass,
} from "@/components/mentor-portal-ui";
import { useTour, OnboardingTour, type TourStep } from "@/components/shared/onboarding-tour";

const SELL_TESTS_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="selltests-list"]',
    title: "Your standalone tests",
    description:
      "Tests you're selling individually — anyone can buy one without purchasing your batch. Hit \"New test\" to submit one; Edurack adds the questions, you review the content, then it goes live once admin approves the price.",
  },
];

function parseSubjectTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const cleaned = part.trim();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

type SoldTestRow = {
  id: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightage[];
  instructions: string;
  referencePdfUrl: string | null;
  proposedPrice: number;
  approvedPrice: number | null;
  status: "draft" | "awaiting_ingestion" | "awaiting_mentor_review" | "awaiting_price_approval" | "live";
  sentToMentorAt: string | null;
  contentApprovedByMentor: boolean;
  mentorReviewedAt: string | null;
  attachedBatchIds: string[];
  progress: SoldTestIngestionProgress;
};

const STATUS_META: Record<SoldTestRow["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-foreground/5 text-foreground/60" },
  awaiting_ingestion: { label: "Edurack is adding questions", tone: "bg-[var(--sky-soft)] text-foreground" },
  awaiting_mentor_review: { label: "Ready for your review", tone: "bg-[var(--lemon-soft)]/70 text-foreground" },
  awaiting_price_approval: { label: "Awaiting price approval", tone: "bg-[var(--sky-soft)] text-foreground" },
  live: { label: "Live for sale", tone: "bg-[var(--mint-soft)] text-foreground" },
};

export function MentorSellTestsModule({ mentorToken }: { mentorToken: string; mentorEmail?: string | null }) {
  const [status, setStatus] = useState<SellTestsAccessStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const tour = useTour("mentorTourSellTestsSeen");

  async function refreshStatus() {
    const { status: s } = await getSellTestsAccessStatus({ data: { token: mentorToken } });
    setStatus(s);
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestSellTestsAccess({ data: { token: mentorToken } });
      await refreshStatus();
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Sell Tests"
        subtitle="Sell individual tests on their own — to anyone, whether or not they've purchased your batch or test series. Submit your test for Edurack to add the questions, review the content once it's added, and go live once admin approves the price."
        onHelp={tour.start}
      />

      {status === null ? (
        <LoadingBlock />
      ) : !status.hasAccess ? (
        <Panel icon={Lock} title="Not enabled yet">
          <p className="mb-4 text-sm text-foreground/70">
            Sell Tests access lets you list individual tests for sale — students can buy just that one test without
            purchasing your batch or a test series. Edurack adds the questions for you at no extra cost — you're only
            ever charged a flat 5% platform commission on each student purchase.
          </p>
          {status.requested ? (
            <p className="clay-inset inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-foreground/60">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sky-deep)]" />
              Request sent — waiting on Edurack to enable this for you.
            </p>
          ) : (
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="clay-btn inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Request access
            </button>
          )}
        </Panel>
      ) : (
        <SoldTestsScreen mentorToken={mentorToken} />
      )}

      {tour.active && <OnboardingTour steps={SELL_TESTS_TOUR_STEPS} onFinish={tour.finish} />}
    </div>
  );
}

function SoldTestsScreen({ mentorToken }: { mentorToken: string }) {
  const [tests, setTests] = useState<SoldTestRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reviewingTestId, setReviewingTestId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const { tests: rows } = await listMySoldTests({ data: { token: mentorToken } });
    setTests(rows as SoldTestRow[]);
  }

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reviewingTestId) {
    const test = tests?.find((t) => t.id === reviewingTestId);
    if (test) {
      return (
        <ContentReviewScreen
          mentorToken={mentorToken}
          test={test}
          onBack={() => setReviewingTestId(null)}
          onApproved={() => {
            setReviewingTestId(null);
            refresh();
          }}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <NewSoldTestForm
          mentorToken={mentorToken}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div data-tour="selltests-list">
      <Panel
        icon={Tag}
        title="Your standalone tests"
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> New test
            </button>
          )
        }
      >
        {tests === null ? (
          <LoadingBlock compact />
        ) : tests.length === 0 ? (
          <EmptyState icon={FileText} message="No standalone tests yet." />
        ) : (
          <ul className="space-y-3">
            {tests.map((t) => (
              <SoldTestListItem
                key={t.id}
                test={t}
                mentorToken={mentorToken}
                onChanged={refresh}
                onReview={() => setReviewingTestId(t.id)}
              />
            ))}
          </ul>
        )}
      </Panel>
      </div>
    </div>
  );
}

function SoldTestListItem({
  test,
  mentorToken,
  onChanged,
  onReview,
}: {
  test: SoldTestRow;
  mentorToken: string;
  onChanged: () => void;
  onReview: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);

  const meta = STATUS_META[test.status] ?? {
    label: "Unknown status",
    tone: "bg-foreground/5 text-foreground/60",
  };
  const percent = test.totalQuestions > 0 ? Math.min(100, Math.round((test.progress.totalAdded / test.totalQuestions) * 100)) : 0;

  async function handleSubmitForIngestion() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitSoldTestForIngestion({ data: { token: mentorToken, id: test.id } });
      onChanged();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="clay-inset rounded-2xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{test.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            {test.totalQuestions} questions · {test.durationMinutes} min · {test.subjects.join(", ")}
            {test.referencePdfUrl && (
              <>
                {" · "}
                <a href={test.referencePdfUrl} target="_blank" rel="noreferrer" className="text-[var(--sky-deep)] hover:underline">
                  Reference PDF
                </a>
              </>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-foreground/50">
            <span className="inline-flex items-center gap-1">
              <IndianRupee className="h-3 w-3" /> Price: ₹{test.approvedPrice ?? test.proposedPrice}
              {test.approvedPrice === null && " (proposed, awaiting admin)"}
            </span>
            <span className="inline-flex items-center gap-1 text-foreground/40">5% platform commission on every purchase</span>
          </p>
        </div>
      </div>

      {/* Ingestion progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
          <span>Questions added by Edurack</span>
          <span>{test.progress.totalAdded} / {test.totalQuestions}</span>
        </div>
        <div className="clay-inset h-2 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-500 ${percent >= 100 ? "bg-[var(--mint-soft)]" : "bg-[var(--sky-deep)]"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {submitError && <p className="mt-2 text-xs font-medium text-rose-600">{submitError}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {test.status === "draft" && (
          <button
            onClick={handleSubmitForIngestion}
            disabled={submitting}
            className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-70"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit for ingestion
          </button>
        )}
        {test.status === "awaiting_ingestion" && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50">
            <Clock3 className="h-3.5 w-3.5" /> Edurack is adding your questions — check back soon.
          </p>
        )}
        {test.status === "awaiting_mentor_review" && (
          <button
            onClick={onReview}
            className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
          >
            <Eye className="h-3.5 w-3.5" /> Review questions
          </button>
        )}
        {test.status === "awaiting_price_approval" && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50">
            <Clock3 className="h-3.5 w-3.5" /> You approved the content — waiting on Edurack to set the final price.
          </p>
        )}
        {test.status === "live" && (
          <button
            onClick={() => setShowAttach((v) => !v)}
            className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-foreground/70"
          >
            <Link2 className="h-3.5 w-3.5" /> {showAttach ? "Hide" : "Append to a batch"}
          </button>
        )}
      </div>

      {test.status === "live" && showAttach && (
        <AttachToBatchPanel test={test} mentorToken={mentorToken} onChanged={onChanged} />
      )}
    </li>
  );
}

// ─── Read-only content review — mentor sees exactly what Edurack ingested
// before approving it for sale. ────────────────────────────────────────────
type ReviewQuestion = {
  id: string;
  subject: string;
  questionNo: number;
  body: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: "A" | "B" | "C" | "D";
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

function ContentReviewScreen({
  mentorToken,
  test,
  onBack,
  onApproved,
}: {
  mentorToken: string;
  test: SoldTestRow;
  onBack: () => void;
  onApproved: () => void;
}) {
  const [questions, setQuestions] = useState<ReviewQuestion[] | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { questions: rows } = await listSoldTestQuestionsForMentorReview({ data: { token: mentorToken, id: test.id } });
      setQuestions(rows as ReviewQuestion[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  async function handleApprove() {
    setError(null);
    setApproving(true);
    try {
      await approveSoldTestContent({ data: { token: mentorToken, id: test.id } });
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve. Try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <ModuleHeader title={`Review — ${test.name}`} subtitle="Read every question Edurack ingested before approving this test for sale." />

      {questions === null ? (
        <LoadingBlock />
      ) : questions.length === 0 ? (
        <EmptyState message="No questions found for this test." />
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="clay p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="clay-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                  {q.subject} · Q{q.questionNo}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{q.difficulty}</span>
              </div>
              <p className="mb-3 whitespace-pre-line text-sm text-foreground">{q.body}</p>
              <div className="space-y-1.5">
                {(["A", "B", "C", "D"] as const).map((key) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    {q.correctOption === key ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--sky-deep)]" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-foreground/20" />
                    )}
                    <span className={q.correctOption === key ? "font-semibold text-foreground" : "text-foreground/70"}>
                      {key}. {q.options[key]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="clay-inset mt-3 rounded-2xl px-4 py-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40">Solution</p>
                <p className="whitespace-pre-line text-sm text-foreground/70">{q.solution}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="clay mt-6 p-5 sm:p-6">
        <p className="mb-3 text-sm text-foreground/70">
          Approving means this content is ready to sell. Once you approve, Edurack will set the final student-facing price and the test will go live.
        </p>
        {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          onClick={handleApprove}
          disabled={approving || questions === null || questions.length === 0}
          className="clay-btn inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve content
        </button>
      </div>
    </div>
  );
}

function AttachToBatchPanel({
  test,
  mentorToken,
  onChanged,
}: {
  test: SoldTestRow;
  mentorToken: string;
  onChanged: () => void;
}) {
  const [batches, setBatches] = useState<{ id: string; name: string }[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { batches: rows } = await listMyBatchesForAttach({ data: { token: mentorToken } });
      setBatches(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(batchId: string, attached: boolean) {
    setError(null);
    setBusyId(batchId);
    try {
      if (attached) {
        await detachSoldTestFromBatch({ data: { token: mentorToken, id: test.id, batchId } });
      } else {
        await attachSoldTestToBatch({ data: { token: mentorToken, id: test.id, batchId } });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="clay-inset mt-3 rounded-2xl p-3.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
        Appending makes this test free for that batch's purchasers — it stays independently purchasable by everyone else.
      </p>
      {batches === null ? (
        <LoadingBlock compact />
      ) : batches.length === 0 ? (
        <p className="text-xs text-foreground/50">You don't have a mentorship batch assigned yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {batches.map((b) => {
            const attached = test.attachedBatchIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b.id, attached)}
                disabled={busyId === b.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-60 ${
                  attached ? "clay-btn text-white" : "clay-chip text-foreground/70"
                }`}
              >
                {busyId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : attached ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {b.name}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function SubjectWeightageEditor({
  subjectTagsRaw,
  onSubjectTagsRawChange,
  weightageMap,
  onWeightageMapChange,
  totalQuestions,
}: {
  subjectTagsRaw: string;
  onSubjectTagsRawChange: (v: string) => void;
  weightageMap: Record<string, number>;
  onWeightageMapChange: (m: Record<string, number>) => void;
  totalQuestions: string;
}) {
  const parsedSubjects = parseSubjectTags(subjectTagsRaw);
  const weightageSum = parsedSubjects.reduce((sum, s) => sum + (weightageMap[s] || 0), 0);

  return (
    <div className="space-y-3">
      <ClayField label="Subject tags (comma-separated)">
        <div className="relative">
          <Tag className="pointer-events-none absolute left-4 top-3.5 h-3.5 w-3.5 text-foreground/30" />
          <input
            value={subjectTagsRaw}
            onChange={(e) => onSubjectTagsRawChange(e.target.value)}
            placeholder="Physics, Chemistry, Biology"
            className={inputClass + " pl-10"}
          />
        </div>
      </ClayField>

      {parsedSubjects.length > 0 && (
        <div>
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            <Scale className="h-3.5 w-3.5" />
            Subject-wise question distribution
          </span>
          <div className="space-y-2">
            {parsedSubjects.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="clay-chip flex-1 truncate px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {s}
                </span>
                <input
                  value={weightageMap[s] || ""}
                  onChange={(e) => onWeightageMapChange({ ...weightageMap, [s]: Number(e.target.value) || 0 })}
                  inputMode="numeric"
                  placeholder="Qs"
                  className={inputClass + " w-24"}
                />
              </div>
            ))}
          </div>
          <p
            className={`mt-2 text-xs font-medium ${
              totalQuestions && weightageSum !== Number(totalQuestions) ? "text-[var(--destructive)]" : "text-foreground/40"
            }`}
          >
            Distribution total: {weightageSum}
            {totalQuestions ? ` / ${totalQuestions} required` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function NewSoldTestForm({
  mentorToken,
  onSaved,
  onCancel,
}: {
  mentorToken: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [totalQuestions, setTotalQuestions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [subjectTagsRaw, setSubjectTagsRaw] = useState("");
  const [weightageMap, setWeightageMap] = useState<Record<string, number>>({});
  const [instructions, setInstructions] = useState("");
  const [referencePdfUrl, setReferencePdfUrl] = useState("");
  const [referencePdfName, setReferencePdfName] = useState("");
  const [proposedPrice, setProposedPrice] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedSubjects = parseSubjectTags(subjectTagsRaw);

  useEffect(() => {
    setWeightageMap((prev) => {
      const next: Record<string, number> = {};
      for (const s of parsedSubjects) next[s] = prev[s] ?? 0;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectTagsRaw]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give this test a name.");
    const total = Number(totalQuestions);
    if (!total || total <= 0) return setError("Enter a valid total question count.");
    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) return setError("Enter a valid test duration.");
    if (parsedSubjects.length === 0) return setError("Add at least one subject.");

    const weightage: SubjectWeightage[] = parsedSubjects.map((s) => ({ subject: s, questionCount: weightageMap[s] || 0 }));
    const sum = weightage.reduce((s, w) => s + w.questionCount, 0);
    if (sum !== total) return setError(`Subject counts total ${sum}, but Total Questions is ${total}. They must match.`);
    if (weightage.some((w) => w.questionCount <= 0)) return setError("Every subject needs a question count greater than 0.");
    if (!referencePdfUrl) return setError("Upload the question paper PDF for Edurack to ingest from.");
    const price = Number(proposedPrice);
    if (!price || price <= 0) return setError("Enter the price you'd like to sell this test for.");

    setSaving(true);
    try {
      await upsertSoldTest({
        data: {
          token: mentorToken,
          test: {
            name: name.trim(),
            totalQuestions: total,
            durationMinutes: duration,
            subjects: parsedSubjects,
            weightage,
            instructions: instructions.trim(),
            referencePdfUrl,
            proposedPrice: price,
          },
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      icon={Plus}
      title="New standalone test"
      action={
        <button onClick={onCancel} className="text-foreground/40 hover:text-foreground/70">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FileUploadField
          label="Question paper PDF — Edurack ingests the questions from this"
          value={referencePdfUrl}
          fileName={referencePdfName}
          onChange={(url, fName) => {
            setReferencePdfUrl(url);
            setReferencePdfName((prev) => prev || fName);
          }}
          storagePath={`sell-tests/${Date.now()}`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ClayField label="Test name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Mock #1" className={inputClass} />
          </ClayField>
          <ClayField label="Total questions">
            <input value={totalQuestions} onChange={(e) => setTotalQuestions(e.target.value)} inputMode="numeric" className={inputClass} />
          </ClayField>
          <ClayField label="Duration (minutes)">
            <div className="relative">
              <Timer className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                inputMode="numeric"
                className={inputClass + " pl-10"}
              />
            </div>
          </ClayField>
        </div>

        <SubjectWeightageEditor
          subjectTagsRaw={subjectTagsRaw}
          onSubjectTagsRawChange={setSubjectTagsRaw}
          weightageMap={weightageMap}
          onWeightageMapChange={setWeightageMap}
          totalQuestions={totalQuestions}
        />

        <ClayField label="Instructions for students (optional)">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. Negative marking applies."
            className={inputClass + " resize-none"}
          />
        </ClayField>

        <ClayField
          label="Price you'd like to sell this test for"
          hint="Edurack will review and approve this before it goes live — they may adjust it. Edurack takes a flat 5% commission on every purchase; there's no other fee."
        >
          <div className="relative">
            <IndianRupee className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
            <input
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 199"
              className={inputClass + " pl-10"}
            />
          </div>
        </ClayField>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
        </button>
      </form>
    </Panel>
  );
}