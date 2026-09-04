import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronRight, Package, ClipboardList, Trash2, Pencil, Check, X, Search } from "lucide-react";
import type { TestSeriesBundle, TestCore, Question } from "@/lib/admin-types";
import {
  listBundles,
  updateBundle,
  listTestCoresForBundle,
  updateTestCore,
  listQuestionsForTest,
  updateQuestion,
  deleteQuestion,
} from "@/server-functions/admin";
import { SmartContent } from "@/lib/smart-content";

type AdminUser = { getIdToken: () => Promise<string> };

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-foreground/30" />}
          {item.onClick ? (
            <button onClick={item.onClick} className="font-semibold text-[var(--sky-deep)] hover:underline">
              {item.label}
            </button>
          ) : (
            <span className="font-semibold text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-4">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="clay-inset w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
    </div>
  );
}

function matches(haystack: (string | number | null | undefined)[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack
    .filter((v) => v !== null && v !== undefined)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function BundleInspectorModule({ adminUser }: { adminUser: AdminUser }) {
  const [bundles, setBundles] = useState<TestSeriesBundle[] | null>(null);
  const [bundleQuery, setBundleQuery] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [tests, setTests] = useState<TestCore[] | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [questionQuery, setQuestionQuery] = useState("");

  const selectedBundle = bundles?.find((b) => b.id === selectedBundleId) ?? null;
  const selectedTest = tests?.find((t) => t.id === selectedTestId) ?? null;

  const filteredBundles = useMemo(() => {
    if (!bundles) return [];
    return bundles.filter((b) =>
      matches([b.title, b.track, b.exam, b.domainSubject, ...(b.features ?? [])], bundleQuery),
    );
  }, [bundles, bundleQuery]);

  const filteredTests = useMemo(() => {
    if (!tests) return [];
    return tests.filter((t) =>
      matches([t.name, ...(t.subjects ?? []), t.instructions, t.totalQuestions, t.durationMinutes], testQuery),
    );
  }, [tests, testQuery]);

  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    return questions.filter((q) =>
      matches(
        [
          q.questionNo,
          q.subject,
          q.body,
          q.options.A,
          q.options.B,
          q.options.C,
          q.options.D,
          q.correctOption,
          q.solution,
          q.difficulty,
          q.isPYQ ? "pyq" : "",
          q.pyqYear,
        ],
        questionQuery,
      ),
    );
  }, [questions, questionQuery]);

  const questionsBySubject = useMemo(() => {
    return filteredQuestions.reduce<Record<string, Question[]>>((acc, q) => {
      (acc[q.subject] ??= []).push(q);
      return acc;
    }, {});
  }, [filteredQuestions]);

  useEffect(() => {
    (async () => {
      const token = await adminUser.getIdToken();
      const { bundles: rows } = await listBundles({ data: { token } });
      setBundles(rows as TestSeriesBundle[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  async function openBundle(id: string) {
    setSelectedBundleId(id);
    setSelectedTestId(null);
    setQuestions(null);
    setTestQuery("");
    setQuestionQuery("");
    const token = await adminUser.getIdToken();
    const { testCores } = await listTestCoresForBundle({ data: { token, bundleId: id } });
    setTests(testCores as TestCore[]);
  }

  async function openTest(id: string) {
    setSelectedTestId(id);
    setQuestionQuery("");
    const token = await adminUser.getIdToken();
    const { questions: rows } = await listQuestionsForTest({ data: { token, testId: id } });
    setQuestions(rows as Question[]);
  }

  async function refreshQuestions() {
    if (!selectedTestId) return;
    const token = await adminUser.getIdToken();
    const { questions: rows } = await listQuestionsForTest({ data: { token, testId: selectedTestId } });
    setQuestions(rows as Question[]);
  }

  async function refreshBundles() {
    const token = await adminUser.getIdToken();
    const { bundles: rows } = await listBundles({ data: { token } });
    setBundles(rows as TestSeriesBundle[]);
  }

  async function refreshTests() {
    if (!selectedBundleId) return;
    const token = await adminUser.getIdToken();
    const { testCores } = await listTestCoresForBundle({ data: { token, bundleId: selectedBundleId } });
    setTests(testCores as TestCore[]);
  }

  if (!selectedBundleId) {
    return (
      <div>
        <ModuleHeader title="Bundle Inspector" subtitle="Click a bundle to review its tests and questions." />
        <div className="clay p-5 sm:p-6">
          <SearchBar value={bundleQuery} onChange={setBundleQuery} placeholder="Search by title, track, exam, subject, or feature…" />
          {bundles === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            </div>
          ) : bundles.length === 0 ? (
            <p className="text-sm text-foreground/60">No bundles yet.</p>
          ) : filteredBundles.length === 0 ? (
            <p className="text-sm text-foreground/60">No bundles match your search.</p>
          ) : (
            <ul className="space-y-2">
              {filteredBundles.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => openBundle(b.id)}
                    className="clay-inset flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:brightness-95"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-foreground/50" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{b.title}</p>
                        <p className="text-xs text-foreground/50">{b.track}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-foreground/30" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (!selectedTestId) {
    return (
      <div>
        <ModuleHeader title="Bundle Inspector" subtitle="Click a test to review its questions." />
        <Breadcrumb
          items={[
            { label: "All bundles", onClick: () => setSelectedBundleId(null) },
            { label: selectedBundle?.title ?? "…" },
          ]}
        />

        {selectedBundle && (
          <EditableBundleCard bundle={selectedBundle} adminUser={adminUser} onSaved={refreshBundles} />
        )}

        <div className="clay mt-6 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Tests</h2>
          </div>
          <SearchBar value={testQuery} onChange={setTestQuery} placeholder="Search by test name, subject, or instructions…" />
          {tests === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            </div>
          ) : tests.length === 0 ? (
            <p className="text-sm text-foreground/60">No tests in this bundle yet.</p>
          ) : filteredTests.length === 0 ? (
            <p className="text-sm text-foreground/60">No tests match your search.</p>
          ) : (
            <ul className="space-y-2">
              {filteredTests.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openTest(t.id)}
                    className="clay-inset flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:brightness-95"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-foreground/50">
                        {t.totalQuestions} Qs · {t.subjects.join(", ")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-foreground/30" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ModuleHeader title="Bundle Inspector" subtitle="Every field here is editable in place." />
      <Breadcrumb
        items={[
          { label: "All bundles", onClick: () => setSelectedBundleId(null) },
          { label: selectedBundle?.title ?? "…", onClick: () => setSelectedTestId(null) },
          { label: selectedTest?.name ?? "…" },
        ]}
      />

      {selectedTest && <EditableTestCard test={selectedTest} adminUser={adminUser} onSaved={refreshTests} />}

      <div className="clay mt-6 p-5 sm:p-6">
        <SearchBar
          value={questionQuery}
          onChange={setQuestionQuery}
          placeholder="Search by question text, option, solution, subject, difficulty, or PYQ year…"
        />
      </div>

      <div className="mt-4 space-y-6">
        {questions === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          </div>
        ) : questions.length === 0 ? (
          <div className="clay p-8 text-center text-sm text-foreground/60">
            No questions added to this test yet.
          </div>
        ) : Object.keys(questionsBySubject).length === 0 ? (
          <div className="clay p-8 text-center text-sm text-foreground/60">
            No questions match your search.
          </div>
        ) : (
          Object.entries(questionsBySubject).map(([subject, subjectQuestions]) => (
            <div key={subject} className="clay p-5 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
                {subject} ({subjectQuestions.length})
              </h3>
              <div className="space-y-3">
                {subjectQuestions.map((q) => (
                  <EditableQuestionCard
                    key={q.id}
                    question={q}
                    adminUser={adminUser}
                    onSaved={refreshQuestions}
                    onDeleted={refreshQuestions}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EditableBundleCard({
  bundle,
  adminUser,
  onSaved,
}: {
  bundle: TestSeriesBundle;
  adminUser: AdminUser;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(bundle.title);
  const [sellingPrice, setSellingPrice] = useState(String(bundle.sellingPrice));
  const [crossedPrice, setCrossedPrice] = useState(String(bundle.crossedPrice));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateBundle({
        data: {
          token,
          id: bundle.id,
          bundle: { title, sellingPrice: Number(sellingPrice), crossedPrice: Number(crossedPrice) },
        },
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="clay flex items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <p className="font-display text-lg font-bold text-foreground">{bundle.title}</p>
          <p className="text-xs text-foreground/50">
            {bundle.track} · ₹{bundle.sellingPrice}{" "}
            <span className="line-through opacity-60">₹{bundle.crossedPrice}</span>
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="clay space-y-3 p-5 sm:p-6">
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <input
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          inputMode="numeric"
          className={inputClass}
        />
        <input
          value={crossedPrice}
          onChange={(e) => setCrossedPrice(e.target.value)}
          inputMode="numeric"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="clay-btn rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs font-semibold text-foreground/50 hover:text-foreground/70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditableTestCard({
  test,
  adminUser,
  onSaved,
}: {
  test: TestCore;
  adminUser: AdminUser;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(test.name);
  const [instructions, setInstructions] = useState(test.instructions);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateTestCore({ data: { token, id: test.id, testCore: { name, instructions } } });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="clay flex items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <p className="font-display text-lg font-bold text-foreground">{test.name}</p>
          <p className="text-xs text-foreground/50">
            {test.totalQuestions} Qs · {test.subjects.join(", ")} ·{" "}
            {new Date(test.liveStart).toLocaleString()} → {new Date(test.liveEnd).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="clay space-y-3 p-5 sm:p-6">
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="clay-btn rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs font-semibold text-foreground/50 hover:text-foreground/70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditableQuestionCard({
  question,
  adminUser,
  onSaved,
  onDeleted,
}: {
  question: Question;
  adminUser: AdminUser;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(question.body);
  const [optionA, setOptionA] = useState(question.options.A);
  const [optionB, setOptionB] = useState(question.options.B);
  const [optionC, setOptionC] = useState(question.options.C);
  const [optionD, setOptionD] = useState(question.options.D);
  const [correctOption, setCorrectOption] = useState(question.correctOption);
  const [solution, setSolution] = useState(question.solution);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [isPYQ, setIsPYQ] = useState(question.isPYQ);
  const [pyqYear, setPyqYear] = useState(question.pyqYear ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateQuestion({
        data: {
          token,
          id: question.id,
          question: {
            body,
            options: { A: optionA, B: optionB, C: optionC, D: optionD },
            correctOption,
            solution,
            difficulty,
            isPYQ,
            pyqYear: isPYQ ? pyqYear : undefined,
          },
        },
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete question ${question.questionNo}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const token = await adminUser.getIdToken();
      await deleteQuestion({ data: { token, id: question.id } });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="clay-inset px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground/50">Q{question.questionNo}</span>
            <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
              {question.difficulty}
            </span>
            {question.isPYQ && (
              <span className="rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                PYQ · {question.pyqYear}
              </span>
            )}
            <span className="rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
              Correct: {question.correctOption}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--coral-soft)] hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
        <SmartContent value={question.body} className="mb-2 text-sm text-foreground" />
        <div className="grid grid-cols-1 gap-1.5 text-xs text-foreground/60 sm:grid-cols-2">
          {(["A", "B", "C", "D"] as const).map((opt) => (
            <div key={opt} className={opt === question.correctOption ? "font-semibold text-[var(--sky-deep)]" : ""}>
              {opt}. <SmartContent value={question.options[opt]} className="inline" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="clay-inset space-y-3 px-4 py-4">
      <QuickField label="Body" value={body} onChange={setBody} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickField label="Option A" value={optionA} onChange={setOptionA} />
        <QuickField label="Option B" value={optionB} onChange={setOptionB} />
        <QuickField label="Option C" value={optionC} onChange={setOptionC} />
        <QuickField label="Option D" value={optionD} onChange={setOptionD} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Correct:</span>
          {(["A", "B", "C", "D"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCorrectOption(opt)}
              className={`h-7 w-7 rounded-full text-xs font-bold transition-all ${
                correctOption === opt ? "clay-btn text-white" : "clay-btn-ghost text-foreground/60"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          className="clay-inset rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none"
        >
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/60">
          <input type="checkbox" checked={isPYQ} onChange={(e) => setIsPYQ(e.target.checked)} />
          PYQ
        </label>
        {isPYQ && (
          <input
            value={pyqYear}
            onChange={(e) => setPyqYear(e.target.value)}
            placeholder="e.g. NEET 2024"
            className="clay-inset rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none"
          />
        )}
      </div>
      <QuickField label="Solution" value={solution} onChange={setSolution} />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="clay-btn flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-foreground/70"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

function QuickField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={inputClass} />
      {value.trim() && (
        <div className="clay-inset mt-1 rounded-xl px-3 py-2">
          <SmartContent value={value} className="text-sm text-foreground" />
        </div>
      )}
    </label>
  );
}