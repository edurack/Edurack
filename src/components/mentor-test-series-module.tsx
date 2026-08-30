import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  Plus,
  X,
  Pencil,
  ClipboardList,
  Tag,
  Scale,
  Timer,
  FileText,
  ArrowLeft,
  IndianRupee,
  TrendingUp,
  BarChart3,
  Trophy,
} from "lucide-react";
import {
  createMentorTestSeries,
  updateMentorTestSeries,
  listMyTestSeries,
  createMentorTest,
  updateMentorTest,
  listMentorTestsForSeries,
  getMentorTestResults,
} from "@/server-functions/mentor-test-series";
import {
  TEST_SERIES_PLATFORM_COMMISSION_PERCENT,
  DEFAULT_TEST_SERIES_MARKETING_PERCENT,
  type MentorTestSeries,
  type MentorTest,
  type SubjectWeightage,
  type MentorTestResultsOverview,
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

const MAX_MARKETING_PERCENT = 30;

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

type View = { screen: "series" } | { screen: "tests"; series: MentorTestSeries } | { screen: "results"; test: MentorTest };

export function MentorTestSeriesModule({ mentorToken }: { mentorToken: string }) {
  const [view, setView] = useState<View>({ screen: "series" });

  return (
    <div>
      <ModuleHeader
        title="Your Test Series"
        subtitle="A separate product from your mentorship batch — set your own price, marketing %, and build out tests with subject-wise distribution."
      />

      {view.screen === "series" && (
        <SeriesListScreen mentorToken={mentorToken} onOpenSeries={(series) => setView({ screen: "tests", series })} />
      )}
      {view.screen === "tests" && (
        <TestsScreen
          mentorToken={mentorToken}
          series={view.series}
          onBack={() => setView({ screen: "series" })}
          onOpenResults={(test) => setView({ screen: "results", test })}
        />
      )}
      {view.screen === "results" && (
        <ResultsScreen
          mentorToken={mentorToken}
          test={view.test}
          onBack={() =>
            setView({
              screen: "tests",
              series: { id: view.test.testSeriesId } as MentorTestSeries,
            })
          }
        />
      )}
    </div>
  );
}

// ─── Screen 1: list of series, create/edit ─────────────────────────────────
function SeriesListScreen({
  mentorToken,
  onOpenSeries,
}: {
  mentorToken: string;
  onOpenSeries: (series: MentorTestSeries) => void;
}) {
  const [series, setSeries] = useState<MentorTestSeries[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSeries, setEditingSeries] = useState<MentorTestSeries | null>(null);

  async function refresh() {
    const { series: rows } = await listMyTestSeries({ data: { token: mentorToken } });
    setSeries(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <div className="space-y-6">
      {(showForm || editingSeries) && (
        <SeriesForm
          mentorToken={mentorToken}
          existing={editingSeries}
          onSaved={() => {
            setShowForm(false);
            setEditingSeries(null);
            refresh();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingSeries(null);
          }}
        />
      )}

      <Panel
        icon={ClipboardList}
        title="Your series"
        action={
          !showForm &&
          !editingSeries && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> New series
            </button>
          )
        }
      >
        {series === null ? (
          <LoadingBlock compact />
        ) : series.length === 0 ? (
          <EmptyState icon={ClipboardList} message="You haven't created a test series yet." />
        ) : (
          <ul className="space-y-2">
            {series.map((s) => (
              <li key={s.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3.5">
                <button onClick={() => onOpenSeries(s)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
                    <span className="inline-flex items-center gap-1">
                      <IndianRupee className="h-3 w-3" /> {s.price.toLocaleString("en-IN")}
                    </span>
                    <span>Platform {s.platformCommissionPercent}%</span>
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Marketing {s.marketingPercent}%
                    </span>
                  </p>
                </button>
                <button
                  onClick={() => setEditingSeries(s)}
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function SeriesForm({
  mentorToken,
  existing,
  onSaved,
  onCancel,
}: {
  mentorToken: string;
  existing: MentorTestSeries | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [price, setPrice] = useState(existing ? String(existing.price) : "");
  const [marketingPercent, setMarketingPercent] = useState(existing?.marketingPercent ?? DEFAULT_TEST_SERIES_MARKETING_PERCENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give this test series a name.");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return setError("Enter a valid price.");

    setSaving(true);
    try {
      if (existing) {
        await updateMentorTestSeries({
          data: { token: mentorToken, id: existing.id, series: { name: name.trim(), price: priceNum, marketingPercent } },
        });
      } else {
        await createMentorTestSeries({
          data: { token: mentorToken, series: { name: name.trim(), price: priceNum, marketingPercent } },
        });
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
      title={existing ? "Edit test series" : "New test series"}
      action={
        <button onClick={onCancel} className="text-foreground/40 hover:text-foreground/70">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ClayField label="Series name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NEET Full Syllabus Test Series"
            className={inputClass}
          />
        </ClayField>

        <ClayField label="Price (₹)">
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={inputClass} />
        </ClayField>

        <ClayField
          label={`Marketing % (editable, floor ${DEFAULT_TEST_SERIES_MARKETING_PERCENT}%)`}
          hint={`Fixed platform commission is ${TEST_SERIES_PLATFORM_COMMISSION_PERCENT}% and isn't editable — this is separate, and comes out of your own share, same idea as the batch promotion boost.`}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={DEFAULT_TEST_SERIES_MARKETING_PERCENT}
              max={MAX_MARKETING_PERCENT}
              value={marketingPercent}
              onChange={(e) => setMarketingPercent(Number(e.target.value))}
              className="flex-1 accent-[var(--sky-deep)]"
            />
            <span className="w-12 shrink-0 text-right text-sm font-semibold text-[var(--sky-deep)]">{marketingPercent}%</span>
          </div>
        </ClayField>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save changes" : "Create series"}
        </button>
      </form>
    </Panel>
  );
}

// ─── Screen 2: tests within a series ────────────────────────────────────────
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

function TestsScreen({
  mentorToken,
  series,
  onBack,
  onOpenResults,
}: {
  mentorToken: string;
  series: MentorTestSeries;
  onBack: () => void;
  onOpenResults: (test: MentorTest) => void;
}) {
  const [tests, setTests] = useState<MentorTest[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTest, setEditingTest] = useState<MentorTest | null>(null);

  async function refresh() {
    const { tests: rows } = await listMentorTestsForSeries({ data: { token: mentorToken, testSeriesId: series.id } });
    setTests(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to series
      </button>

      {(showForm || editingTest) && (
        <TestForm
          mentorToken={mentorToken}
          testSeriesId={series.id}
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
        icon={FileText}
        title={`Tests in ${series.name ?? "this series"}`}
        action={
          !showForm &&
          !editingTest && (
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
          <EmptyState icon={FileText} message="No tests added to this series yet." />
        ) : (
          <ul className="space-y-2">
            {tests.map((t) => (
              <li key={t.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="mt-0.5 text-xs text-foreground/50">
                    {t.totalQuestions} questions · {t.durationMinutes} min · {t.subjects.join(", ")}
                    {t.pdfUrl && (
                      <>
                        {" · "}
                        <a href={t.pdfUrl} target="_blank" rel="noreferrer" className="text-[var(--sky-deep)] hover:underline">
                          Paper PDF
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => onOpenResults(t)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Results
                  </button>
                  <button
                    onClick={() => setEditingTest(t)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TestForm({
  mentorToken,
  testSeriesId,
  existing,
  onSaved,
  onCancel,
}: {
  mentorToken: string;
  testSeriesId: string;
  existing: MentorTest | null;
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
  const [pdfUrl, setPdfUrl] = useState(existing?.pdfUrl ?? "");
  const [pdfName, setPdfName] = useState("");
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

    setSaving(true);
    try {
      const payload = { testSeriesId, name: name.trim(), durationMinutes: duration, totalQuestions: total, subjects: parsedSubjects, weightage, pdfUrl: pdfUrl || null };
      if (existing) {
        await updateMentorTest({ data: { token: mentorToken, id: existing.id, test: payload } });
      } else {
        await createMentorTest({ data: { token: mentorToken, test: payload } });
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

        <FileUploadField
          label="Test paper PDF (reference)"
          value={pdfUrl}
          fileName={pdfName}
          onChange={(url, name) => {
            setPdfUrl(url);
            setPdfName((prev) => prev || name);
          }}
          storagePath={`mentor-test-series/${testSeriesId}`}
        />

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save changes" : "Add test"}
        </button>
      </form>
    </Panel>
  );
}

// ─── Screen 3: results ──────────────────────────────────────────────────────
function ResultsScreen({ mentorToken, test, onBack }: { mentorToken: string; test: MentorTest; onBack: () => void }) {
  const [overview, setOverview] = useState<MentorTestResultsOverview | null>(null);

  useEffect(() => {
    (async () => {
      const { overview: o } = await getMentorTestResults({ data: { token: mentorToken, testId: test.id } });
      setOverview(o);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tests
      </button>

      {overview === null ? (
        <LoadingBlock />
      ) : overview.attemptCount === 0 ? (
        <EmptyState icon={BarChart3} message="No student has attempted this test yet." />
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