import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  ClipboardList,
  Tag,
  Scale,
  CalendarRange,
  FileText,
  Pencil,
  Timer,
} from "lucide-react";
import {
  listBundles,
  createTestCore,
  listTestCoresForBundle,
  updateTestCore,
} from "@/server-functions/admin";

type AdminUser = { getIdToken: () => Promise<string> };

type BundleOption = { id: string; title: string };

type SubjectWeightageRow = { subject: string; questionCount: number };

type TestCoreRow = {
  id: string;
  bundleId: string;
  name: string;
  totalQuestions: number;
  subjects: string[];
  weightage: SubjectWeightageRow[];
  durationMinutes: number;
  liveStart: string;
  liveEnd: string;
  instructions: string;
  createdAt: string | null;
};

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ClayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

// Parses a comma-separated subject tag string into a clean array, e.g.
// "Physics, Chemistry,  Biology" -> ["Physics", "Chemistry", "Biology"].
// Deduplicates and drops empties so a trailing comma or double-space never
// produces a phantom subject.
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

// ─── Subject weightage editor ────────────────────────────────────────────
// The subject list typed here (comma-separated) is the single source of
// truth for which subjects exist on this test — the weightage rows below
// are generated directly from it, one per subject, so there's no way for a
// weightage entry to reference a subject that was never actually typed
// into the tag list (the old free-text + datalist version allowed that
// mismatch). Editing the tag list adds/removes weightage rows automatically
// while preserving counts for subjects that are still present.
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
            Subject weightage thresholds
          </span>
          <div className="space-y-2">
            {parsedSubjects.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="clay-chip flex-1 truncate px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {s}
                </span>
                <input
                  value={weightageMap[s] || ""}
                  onChange={(e) =>
                    onWeightageMapChange({ ...weightageMap, [s]: Number(e.target.value) || 0 })
                  }
                  inputMode="numeric"
                  placeholder="Qs"
                  className={inputClass + " w-24"}
                />
              </div>
            ))}
          </div>
          <p
            className={`mt-2 text-xs font-medium ${
              totalQuestions && weightageSum !== Number(totalQuestions)
                ? "text-[var(--destructive)]"
                : "text-foreground/40"
            }`}
          >
            Weightage total: {weightageSum}
            {totalQuestions ? ` / ${totalQuestions} required` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export function TestCoreModule({ adminUser }: { adminUser: AdminUser }) {
  const [bundles, setBundles] = useState<BundleOption[] | null>(null);
  const [bundleId, setBundleId] = useState("");
  const [tests, setTests] = useState<TestCoreRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const token = await adminUser.getIdToken();
      const { bundles: rows } = await listBundles({ data: { token } });
      setBundles(rows.map((b) => ({ id: b.id, title: b.title })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  async function refreshTests() {
    if (!bundleId) {
      setTests(null);
      return;
    }
    const token = await adminUser.getIdToken();
    const { testCores } = await listTestCoresForBundle({ data: { token, bundleId } });
    setTests(testCores as TestCoreRow[]);
  }

  useEffect(() => {
    refreshTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);

  return (
    <div>
      <ModuleHeader
        title="Test Core Manager"
        subtitle="Map individual mock tests inside a bundle — subjects, weightage, duration, live windows, and instructions."
      />

      <div className="clay mb-6 p-5 sm:p-6">
        <ClayField label="Parent bundle">
          <select
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            className={inputClass + " appearance-none"}
          >
            <option value="">{bundles === null ? "Loading…" : "Select a bundle to begin"}</option>
            {(bundles ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </ClayField>
      </div>

      {bundleId && (
        <>
          <TestCoreCreationForm bundleId={bundleId} adminUser={adminUser} onCreated={refreshTests} />
          <TestCoreList tests={tests} adminUser={adminUser} onSaved={refreshTests} />
        </>
      )}
    </div>
  );
}

// ─── Creation form ───────────────────────────────────────────────────────────
function TestCoreCreationForm({
  bundleId,
  adminUser,
  onCreated,
}: {
  bundleId: string;
  adminUser: AdminUser;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [totalQuestions, setTotalQuestions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [subjectTagsRaw, setSubjectTagsRaw] = useState("");
  const [weightageMap, setWeightageMap] = useState<Record<string, number>>({});
  const [liveStart, setLiveStart] = useState("");
  const [liveEnd, setLiveEnd] = useState("");
  const [instructions, setInstructions] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const parsedSubjects = parseSubjectTags(subjectTagsRaw);

  // Keep the weightage map in sync with whatever subjects are currently
  // typed into the tag field — add new subjects at 0, drop removed ones,
  // and always preserve the count for subjects that are still present.
  useEffect(() => {
    setWeightageMap((prev) => {
      const next: Record<string, number> = {};
      for (const s of parsedSubjects) next[s] = prev[s] ?? 0;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectTagsRaw]);

  function resetForm() {
    setName("");
    setTotalQuestions("");
    setDurationMinutes("");
    setSubjectTagsRaw("");
    setWeightageMap({});
    setLiveStart("");
    setLiveEnd("");
    setInstructions("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) return setError("Enter a test name.");
    const total = Number(totalQuestions);
    if (!total || total <= 0) return setError("Enter a valid total question count.");
    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) return setError("Enter a valid test duration (in minutes).");
    if (parsedSubjects.length === 0) return setError("Add at least one subject tag.");

    const weightage = parsedSubjects.map((s) => ({ subject: s, questionCount: weightageMap[s] || 0 }));
    if (weightage.some((w) => w.questionCount <= 0)) {
      return setError("Every subject needs a question count greater than 0.");
    }
    const weightageSum = weightage.reduce((sum, w) => sum + w.questionCount, 0);
    if (weightageSum !== total) {
      return setError(`Weightage totals ${weightageSum}, but Total Questions is set to ${total}. They must match.`);
    }

    if (!liveStart || !liveEnd) return setError("Set both the live start and end window.");
    if (new Date(liveEnd) <= new Date(liveStart)) return setError("Live end must be after live start.");
    if (!instructions.trim()) return setError("Add instructions for students taking this test.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await createTestCore({
        data: {
          token,
          testCore: {
            bundleId,
            name: name.trim(),
            totalQuestions: total,
            durationMinutes: duration,
            subjects: parsedSubjects,
            weightage,
            liveStart,
            liveEnd,
            instructions: instructions.trim(),
          },
        },
      });
      setSuccess(true);
      resetForm();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this test. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Append a test to this bundle
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ClayField label="Test name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Full Syllabus Mock #7"
              className={inputClass}
            />
          </ClayField>
          <ClayField label="Total questions">
            <input
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(e.target.value)}
              inputMode="numeric"
              placeholder="180"
              className={inputClass}
            />
          </ClayField>
          <ClayField label="Duration (minutes)">
            <div className="relative">
              <Timer className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                inputMode="numeric"
                placeholder="180"
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
              <input
                type="datetime-local"
                value={liveStart}
                onChange={(e) => setLiveStart(e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            <input
              type="datetime-local"
              value={liveEnd}
              onChange={(e) => setLiveEnd(e.target.value)}
              className={inputClass}
            />
          </div>
        </ClayField>

        <ClayField label="Instructions for students">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="e.g. Negative marking applies. Calculator not allowed."
            className={textareaClass}
          />
        </ClayField>

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
            Test appended to bundle.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Append test to bundle"}
        </button>
      </form>
    </div>
  );
}

// ─── List of tests already in this bundle, with full edit ───────────────────
function TestCoreList({
  tests,
  adminUser,
  onSaved,
}: {
  tests: TestCoreRow[] | null;
  adminUser: AdminUser;
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [totalQuestions, setTotalQuestions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [subjectTagsRaw, setSubjectTagsRaw] = useState("");
  const [weightageMap, setWeightageMap] = useState<Record<string, number>>({});
  const [instructions, setInstructions] = useState("");
  const [liveStart, setLiveStart] = useState("");
  const [liveEnd, setLiveEnd] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(t: TestCoreRow) {
    setEditingId(t.id);
    setName(t.name);
    setTotalQuestions(String(t.totalQuestions));
    setDurationMinutes(String(t.durationMinutes ?? ""));
    setSubjectTagsRaw(t.subjects.join(", "));
    setWeightageMap(Object.fromEntries(t.weightage.map((w) => [w.subject, w.questionCount])));
    setInstructions(t.instructions);
    setLiveStart(t.liveStart);
    setLiveEnd(t.liveEnd);
    setError(null);
  }

  const parsedSubjects = parseSubjectTags(subjectTagsRaw);

  async function save(id: string) {
    setError(null);

    if (!name.trim()) return setError("Enter a test name.");
    const total = Number(totalQuestions);
    if (!total || total <= 0) return setError("Enter a valid total question count.");
    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) return setError("Enter a valid test duration (in minutes).");
    if (parsedSubjects.length === 0) return setError("Add at least one subject tag.");

    const weightage = parsedSubjects.map((s) => ({ subject: s, questionCount: weightageMap[s] || 0 }));
    if (weightage.some((w) => w.questionCount <= 0)) {
      return setError("Every subject needs a question count greater than 0.");
    }
    const weightageSum = weightage.reduce((sum, w) => sum + w.questionCount, 0);
    if (weightageSum !== total) {
      return setError(`Weightage totals ${weightageSum}, but Total Questions is set to ${total}. They must match.`);
    }
    if (new Date(liveEnd) <= new Date(liveStart)) return setError("Live end must be after live start.");
    if (!instructions.trim()) return setError("Add instructions for students taking this test.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateTestCore({
        data: {
          token,
          id,
          testCore: {
            name: name.trim(),
            totalQuestions: total,
            durationMinutes: duration,
            subjects: parsedSubjects,
            weightage,
            instructions: instructions.trim(),
            liveStart,
            liveEnd,
          },
        },
      });
      setEditingId(null);
      onSaved();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <FileText className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Tests in this bundle
        </h2>
      </div>

      {tests === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : tests.length === 0 ? (
        <p className="text-sm text-foreground/60">No tests appended to this bundle yet.</p>
      ) : (
        <ul className="space-y-2">
          {tests.map((t) => (
            <li key={t.id} className="clay-inset px-4 py-3.5">
              {editingId === t.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Test name"
                      className={inputClass}
                    />
                    <input
                      value={totalQuestions}
                      onChange={(e) => setTotalQuestions(e.target.value)}
                      inputMode="numeric"
                      placeholder="Total questions"
                      className={inputClass}
                    />
                    <div className="relative">
                      <Timer className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
                      <input
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        inputMode="numeric"
                        placeholder="Duration (min)"
                        className={inputClass + " pl-10"}
                      />
                    </div>
                  </div>

                  <SubjectWeightageEditor
                    subjectTagsRaw={subjectTagsRaw}
                    onSubjectTagsRawChange={setSubjectTagsRaw}
                    weightageMap={weightageMap}
                    onWeightageMapChange={setWeightageMap}
                    totalQuestions={totalQuestions}
                  />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="datetime-local"
                      value={liveStart}
                      onChange={(e) => setLiveStart(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="datetime-local"
                      value={liveEnd}
                      onChange={(e) => setLiveEnd(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                    className={textareaClass}
                  />
                  {error && (
                    <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => save(t.id)}
                      disabled={saving}
                      className="clay-btn rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-70"
                    >
                      {saving ? "Saving…" : "Save all changes"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-semibold text-foreground/50 hover:text-foreground/70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      {t.totalQuestions} questions · {t.durationMinutes ?? "—"} min · {t.subjects.join(", ")}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      Live {new Date(t.liveStart).toLocaleString()} → {new Date(t.liveEnd).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(t)}
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}