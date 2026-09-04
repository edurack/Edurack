import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Loader2,
  Plus,
  X,
  Pencil,
  Tag,
  Scale,
  Timer,
  FileText,
  ArrowLeft,
  BarChart3,
  Trophy,
  CalendarRange,
  ListChecks,
  IndianRupee,
  Gift,
  Send,
  Lock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  appendMentorTest,
  updateMentorTest,
  setTestPublishedToBatch,
  listMyBatchSeriesTests,
  getMentorTestResults,
} from "@/server-functions/mentor-test-series";
import { getTestSeriesAccessStatus, requestTestSeriesAccess } from "@/server-functions/mentor-earnings";
import { listMyAssignedBatches } from "@/server-functions/mentor-portal";
import type {
  SubjectWeightage,
  MentorTestResultsOverview,
  MentorTestIngestionProgress,
  TestSeriesAccessStatus,
} from "@/lib/admin-types";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  EmptyState,
  ErrorBanner,
  FileUploadField,
  StatChip,
  inputClass,
} from "@/components/mentor-portal-ui";

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

type BatchOption = { id: string; name: string; track: string };

type TestRow = {
  id: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightage[];
  liveStart: string;
  liveEnd: string;
  instructions: string;
  referencePdfUrl: string | null;
  price: number | null;
  publishedToBatch: boolean;
  progress: MentorTestIngestionProgress;
};

const REFRESH_INTERVAL_MS = 15000;

export function MentorTestSeriesModule({ mentorToken }: { mentorToken: string }) {
  const [status, setStatus] = useState<TestSeriesAccessStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function refreshStatus() {
    const { status: s } = await getTestSeriesAccessStatus({ data: { token: mentorToken } });
    setStatus(s);
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestTestSeriesAccess({ data: { token: mentorToken } });
      await refreshStatus();
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Test Series"
        subtitle="Offer tests to your own batch's students — free with the batch, or sold individually. Edurack ingests the questions from your PDF; you decide when it goes live."
      />

      {status === null ? (
        <LoadingBlock />
      ) : !status.hasAccess ? (
        <Panel icon={Lock} title="Not enabled yet">
          <p className="mb-4 text-sm text-foreground/70">
            Test series access lets you append tests to your mentorship batch — Edurack ingests the questions from a
            PDF you provide, and you decide whether each test is free for your batch students or sold individually,
            and when it goes live.
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
        <BatchSeriesScreen mentorToken={mentorToken} />
      )}
    </div>
  );
}

// ─── Pick which batch (usually just one) to manage tests for ──────────────
function BatchSeriesScreen({ mentorToken }: { mentorToken: string }) {
  const [batches, setBatches] = useState<BatchOption[] | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { batches: rows } = await listMyAssignedBatches({ data: { token: mentorToken } });
      setBatches(rows as BatchOption[]);
      if (rows.length > 0) setSelectedBatchId(rows[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  if (batches === null) return <LoadingBlock />;
  if (batches.length === 0) {
    return <EmptyState icon={ListChecks} message="You don't have a mentorship batch assigned yet." />;
  }

  const selected = batches.find((b) => b.id === selectedBatchId) ?? batches[0];

  return (
    <div className="space-y-6">
      {batches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {batches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBatchId(b.id)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                selected.id === b.id ? "clay-btn text-white" : "clay-chip text-foreground/70"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <TestsForBatch key={selected.id} mentorToken={mentorToken} batchId={selected.id} batchName={selected.name} />
    </div>
  );
}

// ─── Screen: tests appended for one batch, with live ingestion progress ───
type Screen = { name: "list" } | { name: "results"; testId: string; testName: string };

function TestsForBatch({ mentorToken, batchId, batchName }: { mentorToken: string; batchId: string; batchName: string }) {
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTest, setEditingTest] = useState<TestRow | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const { tests: rows } = await listMyBatchSeriesTests({ data: { token: mentorToken, batchId } });
    setTests(rows as TestRow[]);
  }

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  if (screen.name === "results") {
    return (
      <ResultsScreen
        mentorToken={mentorToken}
        testId={screen.testId}
        testName={screen.testName}
        onBack={() => setScreen({ name: "list" })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {(showForm || editingTest) && (
        <TestForm
          mentorToken={mentorToken}
          batchId={batchId}
          existing={editingTest}
          onSaved={() => {
            setShowForm(false);
            setEditingTest(null);
            refresh();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingTest(null);
          }}
        />
      )}

      <Panel
        icon={ListChecks}
        title={`Tests for ${batchName}`}
        action={
          !showForm &&
          !editingTest && (
            <div className="flex items-center gap-2">
              <button onClick={refresh} className="text-foreground/40 hover:text-foreground/70" aria-label="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
              >
                <Plus className="h-3.5 w-3.5" /> New test
              </button>
            </div>
          )
        }
      >
        {tests === null ? (
          <LoadingBlock compact />
        ) : tests.length === 0 ? (
          <EmptyState icon={FileText} message="No tests appended yet." />
        ) : (
          <ul className="space-y-3">
            {tests.map((t) => (
              <TestListItem
                key={t.id}
                test={t}
                mentorToken={mentorToken}
                onEdit={() => setEditingTest(t)}
                onOpenResults={() => setScreen({ name: "results", testId: t.id, testName: t.name })}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TestListItem({
  test,
  mentorToken,
  onEdit,
  onOpenResults,
  onChanged,
}: {
  test: TestRow;
  mentorToken: string;
  onEdit: () => void;
  onOpenResults: () => void;
  onChanged: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const ready = test.progress.totalAdded >= test.totalQuestions;
  const percent = test.totalQuestions > 0 ? Math.min(100, Math.round((test.progress.totalAdded / test.totalQuestions) * 100)) : 0;

  async function togglePublish() {
    setPublishError(null);
    setPublishing(true);
    try {
      await setTestPublishedToBatch({ data: { token: mentorToken, id: test.id, published: !test.publishedToBatch } });
      onChanged();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Could not update. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <li className="clay-inset rounded-2xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{test.name}</p>
            {test.price ? (
              <span className="clay-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                <IndianRupee className="h-2.5 w-2.5" /> {test.price}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                <Gift className="h-2.5 w-2.5" /> Free with batch
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                test.publishedToBatch ? "bg-[var(--sky-soft)] text-foreground" : "bg-[var(--coral-soft)]/60 text-foreground"
              }`}
            >
              {test.publishedToBatch ? "Live to students" : "Not sent to batch"}
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
          <p className="mt-0.5 text-[11px] text-foreground/40">
            Live window: {new Date(test.liveStart).toLocaleString()} → {new Date(test.liveEnd).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button onClick={onOpenResults} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline">
            <BarChart3 className="h-3.5 w-3.5" /> Results
          </button>
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>

      {/* Ingestion progress — updates automatically as Edurack adds questions */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
          <span>Questions added by Edurack</span>
          <span>{test.progress.totalAdded} / {test.totalQuestions}</span>
        </div>
        <div className="clay-inset h-2 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-500 ${ready ? "bg-[var(--mint-soft)]" : "bg-[var(--sky-deep)]"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {test.progress.subjects.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {test.progress.subjects.map((s) => (
              <span
                key={s.subject}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s.added >= s.required ? "bg-[var(--mint-soft)] text-foreground" : "clay-chip text-foreground/60"
                }`}
              >
                {s.subject}: {s.added}/{s.required}
              </span>
            ))}
          </div>
        )}
      </div>

      {publishError && <p className="mt-2 text-xs font-medium text-rose-600">{publishError}</p>}

      <div className="mt-3">
        {!ready && !test.publishedToBatch ? (
          <p className="text-[11px] text-foreground/40">Publish unlocks once Edurack finishes adding all questions.</p>
        ) : (
          <button
            onClick={togglePublish}
            disabled={publishing || (!ready && !test.publishedToBatch)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              test.publishedToBatch ? "clay-btn-ghost text-foreground/70" : "clay-btn text-white"
            }`}
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {test.publishedToBatch ? "Remove from batch" : "Send to batch"}
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Subject weightage editor ───────────────────────────────────────────────
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

// ─── Append / edit a test ───────────────────────────────────────────────────
function TestForm({
  mentorToken,
  batchId,
  existing,
  onSaved,
  onCancel,
}: {
  mentorToken: string;
  batchId: string;
  existing: TestRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [totalQuestions, setTotalQuestions] = useState(existing ? String(existing.totalQuestions) : "");
  const [durationMinutes, setDurationMinutes] = useState(existing ? String(existing.durationMinutes) : "");
  const [subjectTagsRaw, setSubjectTagsRaw] = useState(existing?.subjects.join(", ") ?? "");
  const [weightageMap, setWeightageMap] = useState<Record<string, number>>(
    existing ? Object.fromEntries(existing.weightage.map((w) => [w.subject, w.questionCount])) : {},
  );
  const [liveStart, setLiveStart] = useState(existing?.liveStart ?? "");
  const [liveEnd, setLiveEnd] = useState(existing?.liveEnd ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [referencePdfUrl, setReferencePdfUrl] = useState(existing?.referencePdfUrl ?? "");
  const [referencePdfName, setReferencePdfName] = useState("");
  const [isPaid, setIsPaid] = useState(Boolean(existing?.price));
  const [price, setPrice] = useState(existing?.price ? String(existing.price) : "");

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
    if (!liveStart || !liveEnd) return setError("Set both the live start and end window.");
    if (new Date(liveEnd) <= new Date(liveStart)) return setError("Live end must be after live start.");
    if (!referencePdfUrl) return setError("Upload the question paper PDF for Edurack to ingest from.");

    let priceNum: number | null = null;
    if (isPaid) {
      priceNum = Number(price);
      if (!priceNum || priceNum <= 0) return setError("Enter a valid price, or switch this test to free.");
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        totalQuestions: total,
        durationMinutes: duration,
        subjects: parsedSubjects,
        weightage,
        liveStart,
        liveEnd,
        instructions: instructions.trim(),
        referencePdfUrl,
        price: priceNum,
      };
      if (existing) {
        await updateMentorTest({ data: { token: mentorToken, id: existing.id, test: payload } });
      } else {
        await appendMentorTest({ data: { token: mentorToken, test: { ...payload, batchId } } });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      icon={existing ? Pencil : Plus}
      title={existing ? "Edit test" : "New test"}
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
          onChange={(url, name) => {
            setReferencePdfUrl(url);
            setReferencePdfName((prev) => prev || name);
          }}
          storagePath={`mentor-test-series/${batchId}`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ClayField label="Test name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mock #1" className={inputClass} />
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

        <ClayField label="Live window">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input type="datetime-local" value={liveStart} onChange={(e) => setLiveStart(e.target.value)} className={inputClass + " pl-10"} />
            </div>
            <input type="datetime-local" value={liveEnd} onChange={(e) => setLiveEnd(e.target.value)} className={inputClass} />
          </div>
        </ClayField>

        <ClayField label="Instructions for students (optional)">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. Negative marking applies."
            className={inputClass + " resize-none"}
          />
        </ClayField>

        <ClayField label="Pricing" hint="Free tests unlock for anyone who's purchased your batch. Paid tests can be bought individually — even by students who haven't purchased the batch.">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPaid(false)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                !isPaid ? "clay-btn text-white" : "clay-chip text-foreground/70"
              }`}
            >
              <Gift className="h-3.5 w-3.5" /> Free with batch
            </button>
            <button
              type="button"
              onClick={() => setIsPaid(true)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                isPaid ? "clay-btn text-white" : "clay-chip text-foreground/70"
              }`}
            >
              <IndianRupee className="h-3.5 w-3.5" /> Sell individually
            </button>
          </div>
          {isPaid && (
            <div className="relative mt-2">
              <IndianRupee className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                placeholder="Price for this test alone"
                className={inputClass + " pl-10"}
              />
            </div>
          )}
        </ClayField>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save changes" : "Append test"}
        </button>
      </form>
    </Panel>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────
function ResultsScreen({
  mentorToken,
  testId,
  testName,
  onBack,
}: {
  mentorToken: string;
  testId: string;
  testName: string;
  onBack: () => void;
}) {
  const [overview, setOverview] = useState<MentorTestResultsOverview | null>(null);

  useEffect(() => {
    (async () => {
      const { overview: o } = await getMentorTestResults({ data: { token: mentorToken, testId } });
      setOverview(o);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {overview === null ? (
        <LoadingBlock />
      ) : overview.attemptCount === 0 ? (
        <EmptyState icon={BarChart3} message={`No student has attempted "${testName}" yet.`} />
      ) : (
        <>
          <Panel icon={BarChart3} title={`Subject-wise comparison — ${overview.testName}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {overview.subjectComparison.map((s) => (
                <StatChip
                  key={s.subject}
                  icon={BarChart3}
                  label={s.subject}
                  value={`${s.averagePercent}% avg`}
                  tone={s.averagePercent >= 60 ? "mint" : s.averagePercent >= 40 ? "sky" : "coral"}
                />
              ))}
            </div>
          </Panel>

          <Panel icon={Trophy} title="Student results">
            <div className="clay-inset max-h-96 overflow-y-auto rounded-2xl">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--sky-soft)]/40 text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                  <tr>
                    <th className="px-4 py-2.5">Student</th>
                    <th className="px-4 py-2.5">Score</th>
                    <th className="px-4 py-2.5">Subject breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.studentResults.map((r) => (
                    <tr key={r.studentUid} className="border-t border-foreground/5">
                      <td className="px-4 py-2.5 font-medium text-foreground">{r.studentName}</td>
                      <td className="px-4 py-2.5 font-semibold text-[var(--sky-deep)]">
                        {r.score}/{r.totalMarks}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground/60">
                        {r.subjectBreakdown.map((s) => `${s.subject}: ${s.correct}/${s.correct + s.incorrect + s.unanswered}`).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}