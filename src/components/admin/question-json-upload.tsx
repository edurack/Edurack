import { useRef, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconCircleCheck as CheckCircle2,
  IconAlertCircle as AlertCircle,
  IconUpload as Upload,
  IconDownload as Download,
} from "@tabler/icons-react";
import { bulkCreateQuestions } from "@/server-functions/admin";

type AdminUser = { getIdToken: () => Promise<string> };

type Preview = Awaited<ReturnType<typeof bulkCreateQuestions>>;

const MAX_QUESTIONS = 1000;
// Server functions ride a normal request body; keep well under typical 4.5 MB host limits.
const MAX_BYTES = 3.5 * 1024 * 1024;

const SAMPLE = [
  {
    subject: "Physics",
    type: "mcq",
    body: "Which of the following is a vector quantity?",
    options: { A: "Speed", B: "Distance", C: "Displacement", D: "Mass" },
    correctOption: "C",
    solution: "Displacement has both magnitude and direction.",
    difficulty: "Easy",
    isPYQ: false,
    chapter: "Motion in a Straight Line",
    topic: "Displacement",
  },
  {
    subject: "Physics",
    type: "integer",
    body: "A body moves 3 m east then 4 m north. Find the magnitude of displacement (m).",
    correctAnswer: 5,
    solution: "√(3² + 4²) = 5",
    difficulty: "Medium",
    isPYQ: true,
    pyqYear: "2023",
  },
  {
    subject: "Chemistry",
    type: "mcq",
    body: "The atomic number of carbon is",
    options: { A: "4", B: "6", C: "8", D: "12" },
    correctOption: "B",
    solution: "Carbon has 6 protons.",
    difficulty: "Easy",
    isPYQ: false,
  },
];

/** { "Physics": [...], "Chemistry": [...] } → one flat list, each question tagged with its subject. */
function flattenBySubject(obj: Record<string, unknown>): unknown[] | null {
  const keys = Object.keys(obj);
  if (keys.length === 0 || !keys.every((k) => Array.isArray(obj[k]))) return null;
  return keys.flatMap((k) =>
    (obj[k] as unknown[]).map((q) =>
      q && typeof q === "object" && !Array.isArray(q) && (q as { subject?: unknown }).subject === undefined ? { ...q, subject: k } : q,
    ),
  );
}

/**
 * Accepts a JSON array, {"questions": [...]}, {"Physics": [...], "Chemistry": [...]},
 * a single object, or JSON Lines (mongoexport style). Questions may carry a `subject`.
 */
function parseQuestionFile(name: string, text: string): unknown[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) throw new Error(`${name} is empty.`);
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const q = (parsed as { questions?: unknown }).questions;
      if (Array.isArray(q)) return q;
      return flattenBySubject(parsed as Record<string, unknown>) ?? [parsed];
    }
    throw new Error("not an object or array");
  } catch {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      return lines.map((l, i) => {
        try {
          return JSON.parse(l);
        } catch {
          throw new Error(`${name}: line ${i + 1} isn't valid JSON.`);
        }
      });
    }
    throw new Error(`${name} isn't valid JSON.`);
  }
}

export function QuestionJsonUpload({
  adminUser,
  bundleId,
  testId,
  subject,
  enforceThreshold = true,
  onImported,
}: {
  adminUser: AdminUser;
  bundleId: string;
  testId: string;
  /** Default for questions that don't name a subject. Empty is fine if every question does. */
  subject: string;
  /** Hard-cap at Test Core's subjects/weightage. Off for Sold Tests, which have none. */
  enforceThreshold?: boolean;
  onImported?: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"checking" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; bySubject: { subject: string; count: number; startNo: number; endNo: number }[]; outOfSyllabus: number } | null>(null);

  function reset() {
    setFileLabel(null);
    setRows(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function call(questions: unknown[], dryRun: boolean) {
    const token = await adminUser.getIdToken();
    return bulkCreateQuestions({ data: { token, bundleId, testId, subject, questions, enforceThreshold, dryRun } });
  }

  async function handleFiles(files: FileList | null) {
    setError(null);
    setPreview(null);
    setDone(null);
    setRows(null);
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    try {
      if (list.reduce((n, f) => n + f.size, 0) > MAX_BYTES) {
        throw new Error("These files are too large for one upload (limit ≈ 3.5 MB). Split them into smaller batches.");
      }
      const all: unknown[] = [];
      for (const f of list) all.push(...parseQuestionFile(f.name, await f.text()));
      if (all.length === 0) throw new Error("No questions found in the file.");
      if (all.length > MAX_QUESTIONS) throw new Error(`${all.length} questions found — upload at most ${MAX_QUESTIONS} at a time.`);

      setFileLabel(list.length === 1 ? list[0].name : `${list.length} files`);
      setRows(all);
      setBusy("checking");
      setPreview(await call(all, true));
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!rows) return;
    setError(null);
    setBusy("importing");
    try {
      const res = await call(rows, false);
      if (!res.ok) {
        setPreview(res);
        return;
      }
      setDone({ inserted: res.inserted, bySubject: res.bySubject, outOfSyllabus: res.outOfSyllabus });
      reset();
      await onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed — nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  function downloadSample() {
    const blob = new Blob([JSON.stringify(SAMPLE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions-sample.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canImport = Boolean(preview?.ok) && !busy;

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Upload JSON</h2>
          <p className="mt-1 text-xs text-foreground/50">
            Add many questions at once, across <strong>all subjects of this test</strong> in a single file: give each
            question a <code>subject</code>
            {subject ? <> (questions without one go to <strong>{subject}</strong>)</> : null}. Numbering continues
            automatically per subject, and the same syllabus and weightage checks as the form apply. If any question has
            a problem, nothing is saved.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSample}
          className="clay-chip flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold text-foreground/70"
        >
          <Download className="h-3.5 w-3.5" /> Sample
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".json,.jsonl,.ndjson,application/json"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy !== null}
        className="clay-inset flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-5 text-sm font-semibold text-foreground/70 disabled:opacity-60"
      >
        {busy === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy === "checking" ? "Checking…" : fileLabel ? `${fileLabel} — choose a different file` : "Choose JSON file(s)"}
      </button>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          {preview.ok ? (
            <div className="clay-inset rounded-2xl px-4 py-3 text-sm text-foreground">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {preview.total} question{preview.total === 1 ? "" : "s"} ready
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-foreground/70">
                {preview.bySubject.map((b) => (
                  <li key={b.subject}>
                    <strong>{b.subject}</strong>: {b.count} → Q{b.startNo}–Q{b.endNo}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-foreground/60">
                {preview.mcq} MCQ · {preview.integer} integer
                {preview.outOfSyllabus > 0 ? ` · ${preview.outOfSyllabus} will be tagged "Out of Syllabus"` : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-3 text-xs text-foreground">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4" /> Nothing will be saved until this is fixed
              </p>
              {preview.message && <p className="mt-2">{preview.message}</p>}
              {preview.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {preview.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      <strong>Question {e.row}:</strong> {e.messages.join(" ")}
                    </li>
                  ))}
                  {preview.errors.length > 20 && <li>…and {preview.errors.length - 20} more.</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="clay-btn flex items-center justify-center gap-2 rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {busy === "importing" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Import ${preview.total} question${preview.total === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={reset} disabled={busy !== null} className="text-xs font-semibold text-foreground/60 hover:underline">
              Clear
            </button>
          </div>
        </div>
      )}

      {done && !preview && (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Imported {done.inserted} question{done.inserted === 1 ? "" : "s"} (
          {done.bySubject.map((b) => `${b.subject} Q${b.startNo}–Q${b.endNo}`).join(" · ")})
          {done.outOfSyllabus > 0 ? ` · ${done.outOfSyllabus} tagged "Out of Syllabus"` : ""}
        </p>
      )}
    </div>
  );
}
