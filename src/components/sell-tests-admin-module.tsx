import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Inbox,
  RefreshCw,
  Hash,
  FileQuestion,
  Circle,
  Send,
  ArrowLeft,
} from "lucide-react";
import {
  listSellTestsAccessRequests,
  setSellTestsAccess,
  listSoldTestsForApproval,
  approveSoldTestPrice,
  listSoldTestsForIngestion,
  sendSoldTestToMentorForReview,
  createQuestion,
  listQuestionsForTestSubject,
} from "@/server-functions/admin";

type AdminUser = { getIdToken: () => Promise<string> };

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <AlertCircle className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="max-w-sm text-sm text-foreground/60">{message}</p>
      <button
        onClick={onRetry}
        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <Inbox className="h-5 w-5 text-foreground/30" />
      </div>
      <p className="text-sm text-foreground/60">{message}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
        active ? "clay-btn text-white" : "clay-chip text-foreground/70 hover:bg-foreground/5"
      }`}
    >
      {children}
    </button>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────────────────
type SellTestsAccessRequestRow = {
  mentorId: string;
  mentorName: string;
  adminGranted: boolean;
  requestedAt: string | null;
};

type SoldTestForApproval = {
  id: string;
  mentorId: string;
  mentorName: string;
  name: string;
  totalQuestions: number;
  referencePdfUrl: string | null;
  proposedPrice: number;
  approvedPrice: number | null;
  status: string;
  ingestionFeeAmount: number;
  contentApprovedByMentor: boolean;
  mentorReviewedAt: string | null;
  createdAt: string | null;
};

type SoldTestForIngestion = {
  id: string;
  name: string;
  mentorName: string;
  totalQuestions: number;
  subjects: string[];
  weightage: { subject: string; questionCount: number }[];
  referencePdfUrl: string | null;
  progress: { subject: string; required: number; added: number }[];
  totalAdded: number;
};

export function SellTestsAdminModule({ adminUser }: { adminUser: AdminUser }) {
  const [tab, setTab] = useState<"requests" | "ingestion" | "approvals">("ingestion");
  const [requests, setRequests] = useState<SellTestsAccessRequestRow[] | null>(null);
  const [approvalTests, setApprovalTests] = useState<SoldTestForApproval[] | null>(null);
  const [ingestionTests, setIngestionTests] = useState<SoldTestForIngestion[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [approveError, setApproveError] = useState<string | null>(null);
  const [selectedIngestionTestId, setSelectedIngestionTestId] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const [{ requests: r }, { tests: at }, { tests: it }] = await Promise.all([
        listSellTestsAccessRequests({ data: { token } }),
        listSoldTestsForApproval({ data: { token } }),
        listSoldTestsForIngestion({ data: { token } }),
      ]);
      setRequests(r as SellTestsAccessRequestRow[]);
      setApprovalTests(at as SoldTestForApproval[]);
      setIngestionTests(it as SoldTestForIngestion[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleAccess(mentorId: string, granted: boolean) {
    setBusyId(mentorId);
    try {
      const token = await adminUser.getIdToken();
      await setSellTestsAccess({ data: { token, mentorId, granted } });
      setRequests((prev) => prev?.map((r) => (r.mentorId === mentorId ? { ...r, adminGranted: granted } : r)) ?? null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(testId: string, defaultPrice: number) {
    setApproveError(null);
    const draft = priceDrafts[testId];
    const price = draft ? Number(draft) : defaultPrice;
    if (!price || price <= 0) {
      setApproveError("Enter a valid price.");
      return;
    }
    setBusyId(testId);
    try {
      const token = await adminUser.getIdToken();
      await approveSoldTestPrice({ data: { token, id: testId, approvedPrice: price } });
      await load();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Could not approve. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingRequests = requests?.filter((r) => !r.adminGranted) ?? [];
  const awaitingPrice = approvalTests?.filter((t) => t.status === "awaiting_price_approval") ?? [];
  const live = approvalTests?.filter((t) => t.status === "live") ?? [];

  if (selectedIngestionTestId) {
    const test = ingestionTests?.find((t) => t.id === selectedIngestionTestId);
    if (test) {
      return (
        <SoldTestIngestionScreen
          adminUser={adminUser}
          test={test}
          onBack={() => setSelectedIngestionTestId(null)}
          onSentToMentor={() => {
            setSelectedIngestionTestId(null);
            load();
          }}
        />
      );
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Sell Tests"
        subtitle="Grant mentor access, ingest questions for paid-but-unbuilt tests, and approve the final price before each one goes live."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={tab === "ingestion"} onClick={() => setTab("ingestion")}>
          Ingestion {ingestionTests && ingestionTests.length > 0 ? `(${ingestionTests.length})` : ""}
        </FilterChip>
        <FilterChip active={tab === "approvals"} onClick={() => setTab("approvals")}>
          Price approvals {awaitingPrice.length > 0 ? `(${awaitingPrice.length})` : ""}
        </FilterChip>
        <FilterChip active={tab === "requests"} onClick={() => setTab("requests")}>
          Access requests {pendingRequests.length > 0 ? `(${pendingRequests.length})` : ""}
        </FilterChip>
      </div>

      {status === "loading" ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="clay-inset h-20 animate-pulse rounded-2xl bg-foreground/5" />
          ))}
        </div>
      ) : status === "error" ? (
        <ErrorState message="Couldn't load Sell Tests data." onRetry={load} />
      ) : tab === "requests" ? (
        <div className="clay p-5 sm:p-6">
          {!requests || requests.length === 0 ? (
            <EmptyState message="No access requests yet." />
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.mentorId} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.mentorName}</p>
                    <p className="text-xs text-foreground/50">
                      Requested {formatDateTime(r.requestedAt)} ·{" "}
                      <span className={r.adminGranted ? "text-[var(--sky-deep)]" : "text-foreground/50"}>
                        {r.adminGranted ? "Access granted" : "Not granted"}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleAccess(r.mentorId, !r.adminGranted)}
                    disabled={busyId === r.mentorId}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
                      r.adminGranted ? "clay-btn-ghost text-foreground/70" : "clay-btn text-white"
                    }`}
                  >
                    {busyId === r.mentorId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {r.adminGranted ? "Revoke access" : "Grant access"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "ingestion" ? (
        <div className="clay p-5 sm:p-6">
          {!ingestionTests || ingestionTests.length === 0 ? (
            <EmptyState message="Nothing waiting on question ingestion." />
          ) : (
            <ul className="space-y-3">
              {ingestionTests.map((t) => {
                const percent = t.totalQuestions > 0 ? Math.min(100, Math.round((t.totalAdded / t.totalQuestions) * 100)) : 0;
                return (
                  <li key={t.id} className="clay-inset rounded-2xl px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-foreground/50">
                          {t.mentorName} · {t.totalQuestions} questions
                          {t.referencePdfUrl && (
                            <>
                              {" · "}
                              <a href={t.referencePdfUrl} target="_blank" rel="noreferrer" className="text-[var(--sky-deep)] hover:underline">
                                Reference PDF
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedIngestionTestId(t.id)}
                        className="clay-btn inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
                      >
                        <FileQuestion className="h-3.5 w-3.5" /> Add questions
                      </button>
                    </div>
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
                        <span>Progress</span>
                        <span>{t.totalAdded} / {t.totalQuestions}</span>
                      </div>
                      <div className="clay-inset h-2 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${percent >= 100 ? "bg-[var(--mint-soft)]" : "bg-[var(--sky-deep)]"}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="clay p-5 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Awaiting your price approval
            </h2>
            {approveError && <p className="mb-3 text-xs font-medium text-rose-600">{approveError}</p>}
            {awaitingPrice.length === 0 ? (
              <EmptyState message="Nothing waiting on price approval." />
            ) : (
              <ul className="space-y-3">
                {awaitingPrice.map((t) => (
                  <li key={t.id} className="clay-inset rounded-2xl px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-foreground/50">
                          {t.mentorName} · {t.totalQuestions} questions · Ingestion fee: ₹{t.ingestionFeeAmount}
                          {t.referencePdfUrl && (
                            <>
                              {" · "}
                              <a href={t.referencePdfUrl} target="_blank" rel="noreferrer" className="text-[var(--sky-deep)] hover:underline">
                                Reference PDF
                              </a>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)]">
                          <CheckCircle2 className="h-3 w-3" /> Mentor approved content {formatDateTime(t.mentorReviewedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-foreground/50">Mentor proposed: ₹{t.proposedPrice}</span>
                      <input
                        value={priceDrafts[t.id] ?? String(t.proposedPrice)}
                        onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        inputMode="numeric"
                        className="clay-inset w-28 rounded-2xl px-3 py-1.5 text-xs text-foreground focus:outline-none"
                      />
                      <button
                        onClick={() => handleApprove(t.id, t.proposedPrice)}
                        disabled={busyId === t.id}
                        className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve &amp; go live
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="clay p-5 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Live</h2>
            {live.length === 0 ? (
              <EmptyState message="No live standalone tests yet." />
            ) : (
              <ul className="space-y-2">
                {live.map((t) => (
                  <li key={t.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-foreground/50">{t.mentorName} · {t.totalQuestions} questions</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      ₹{t.approvedPrice}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ingestion screen for one Sold Test — same pattern as
// QuestionIngestionModule, scoped to a single testId, no bundle/testCore
// selectors needed since the test is already fixed. ─────────────────────
function SoldTestIngestionScreen({
  adminUser,
  test,
  onBack,
  onSentToMentor,
}: {
  adminUser: AdminUser;
  test: SoldTestForIngestion;
  onBack: () => void;
  onSentToMentor: () => void;
}) {
  const [subject, setSubject] = useState(test.subjects[0] ?? "");
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const [questionBody, setQuestionBody] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctOption, setCorrectOption] = useState<"A" | "B" | "C" | "D">("A");
  const [solution, setSolution] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const inputClass = "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";
  const textareaClass = "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

  async function refreshCount(subjectToUse: string) {
    if (!subjectToUse) return;
    setCountLoading(true);
    try {
      const token = await adminUser.getIdToken();
      const { questions } = await listQuestionsForTestSubject({ data: { token, testId: test.id, subject: subjectToUse } });
      setNextNumber(questions.length + 1);
      const w = test.weightage.find((row) => row.subject === subjectToUse);
      setThreshold(w ? w.questionCount : null);
    } finally {
      setCountLoading(false);
    }
  }

  useEffect(() => {
    refreshCount(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  function resetFields() {
    setQuestionBody("");
    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");
    setCorrectOption("A");
    setSolution("");
    setDifficulty("Medium");
  }

 async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  setError(null);
  setSuccess(false);

  if (!subject) return setError("Select a subject.");
  if (nextNumber === null) return setError("Still working out the question number — try again in a moment.");
  if (!questionBody.trim()) return setError("Enter the question body.");
  if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) return setError("All four options (A–D) must be filled in.");
  if (!solution.trim()) return setError("Enter the step-by-step solution.");
  // No hard cap at the mentor's original weightage — that was just their
  // plan when creating the test, not a limit admin is bound by. Ingestion
  // can freely go past it (Q11, Q12, ...); the "X of Y" display below just
  // becomes "X of Y (extra)" once it does, purely informational.

  setSaving(true);
  try {
    const token = await adminUser.getIdToken();
    await createQuestion({
      data: {
        token,
        question: {
          bundleId: "",
          testId: test.id,
          subject,
          questionNo: nextNumber,
          body: questionBody.trim(),
          options: { A: optionA.trim(), B: optionB.trim(), C: optionC.trim(), D: optionD.trim() },
          correctOption,
          solution: solution.trim(),
          difficulty,
          isPYQ: false,
        },
      },
    });
    setSuccess(true);
    resetFields();
    setNextNumber((n) => (n === null ? null : n + 1));
  } catch (err) {
    setError(err instanceof Error ? err.message : "Could not save this question. Try again.");
  } finally {
    setSaving(false);
  }
}

  async function handleSendToMentor() {
    setSendError(null);
    setSending(true);
    try {
      const token = await adminUser.getIdToken();
      await sendSoldTestToMentorForReview({ data: { token, id: test.id } });
      onSentToMentor();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send to mentor. Try again.");
    } finally {
      setSending(false);
    }
  }

  const totalAddedNow = test.weightage.reduce((sum, w) => {
    if (w.subject !== subject) return sum + (test.progress.find((p) => p.subject === w.subject)?.added ?? 0);
    return sum + (nextNumber !== null ? nextNumber - 1 : test.progress.find((p) => p.subject === w.subject)?.added ?? 0);
  }, 0);
  const allComplete = totalAddedNow >= test.totalQuestions;

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to ingestion queue
      </button>

      <ModuleHeader title={test.name} subtitle={`For ${test.mentorName} — ${test.totalQuestions} questions across ${test.subjects.join(", ")}`} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Hash className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Subject</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {test.subjects.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubject(s)}
                className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition-all ${
                  subject === s ? "clay-btn text-white" : "clay-chip text-foreground/70"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {subject && (
          <div className="clay-inset mt-4 flex items-center gap-2 rounded-2xl px-4 py-3">
            <Hash className="h-4 w-4 shrink-0 text-foreground/50" />
            {countLoading || nextNumber === null ? (
              <span className="text-sm text-foreground/50">Working out the next question number…</span>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                Adding question {nextNumber}
                {threshold !== null && (
                  <span className={nextNumber > threshold ? "text-[var(--sky-deep)]" : ""}>
                    {" "}({nextNumber <= threshold ? `${nextNumber} of ${threshold} planned` : `${nextNumber - threshold} extra beyond the ${threshold} planned`})
                  </span>
                )}{" "}for {subject}
              </span>
            )}
          </div>
        )}
        </div>

        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileQuestion className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Question</h2>
          </div>

          <fieldset disabled={!subject || nextNumber === null} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Question body (text, LaTeX $…$/$$…$$, or image URL)
              </span>
              <textarea value={questionBody} onChange={(e) => setQuestionBody(e.target.value)} rows={4} className={textareaClass} />
            </label>

            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Options — tap the marker to flag the correct answer
              </span>
              <div className="space-y-2">
                {(
                  [
                    { key: "A" as const, value: optionA, setValue: setOptionA },
                    { key: "B" as const, value: optionB, setValue: setOptionB },
                    { key: "C" as const, value: optionC, setValue: setOptionC },
                    { key: "D" as const, value: optionD, setValue: setOptionD },
                  ] as const
                ).map((opt) => {
                  const isCorrect = correctOption === opt.key;
                  return (
                    <div key={opt.key} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCorrectOption(opt.key)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                          isCorrect ? "clay-btn text-white" : "clay-btn-ghost text-foreground/50"
                        }`}
                      >
                        {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : opt.key}
                      </button>
                      <input value={opt.value} onChange={(e) => opt.setValue(e.target.value)} placeholder={`Option ${opt.key}`} className={inputClass + " flex-1"} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground/40">
                <Circle className="h-3 w-3" /> Currently marked correct: <span className="font-semibold text-foreground/60">Option {correctOption}</span>
              </p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">Step-by-step solution</span>
              <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={4} className={textareaClass} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">Difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "Easy" | "Medium" | "Hard")} className={inputClass + " appearance-none"}>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>
          </fieldset>

          {error && <p className="mt-4 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">{error}</p>}
          {success && <p className="mt-4 rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">Question saved.</p>}

          <button
            type="submit"
            disabled={saving || !subject || nextNumber === null}
            className="clay-btn mt-5 flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save question"}
          </button>
        </div>

        <div className="clay p-5 sm:p-6">
          <p className="mb-3 text-sm text-foreground/70">
            {allComplete
              ? "All questions have been added for this test."
              : `Add every question across all subjects before sending this to the mentor.`}
          </p>
          {sendError && <p className="mb-3 text-xs font-medium text-rose-600">{sendError}</p>}
          <button
            type="button"
            onClick={handleSendToMentor}
            disabled={!allComplete || sending}
            className="clay-btn inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send to mentor for review
          </button>
        </div>
      </form>
    </div>
  );
}