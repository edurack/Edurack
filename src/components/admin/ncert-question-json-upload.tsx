import { useEffect, useRef, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconCircleCheck as CheckCircle2,
  IconAlertCircle as AlertCircle,
  IconUpload as Upload,
  IconDownload as Download,
} from "@tabler/icons-react";
import { bulkUploadNcertQuestions } from "@/server-functions/ncert-line-admin";
import type { NcertClassLevel } from "@/lib/ncert-line-types";

type AdminUser = { getIdToken: () => Promise<string> };
type Preview = Awaited<ReturnType<typeof bulkUploadNcertQuestions>>;

const MAX_QUESTIONS = 1000;
const MAX_BYTES = 3.5 * 1024 * 1024;

function sample(topics: string[]) {
  const t = topics[0] ?? "Topic name";
  return [
    {
      topic: t,
      type: "mcq",
      body: "Which of the following is true?",
      options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
      correctOption: "C",
      solution: "Explain why C is correct, in NCERT wording.",
      difficulty: "Easy",
    },
    {
      topic: t,
      type: "integer",
      body: "A numerical-answer question for this topic.",
      correctAnswer: 5,
      solution: "Working shown here.",
      difficulty: "Medium",
    },
  ];
}

function parseFile(name: string, text: string): unknown[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new Error(`${name} is empty.`);
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const q = (parsed as { questions?: unknown }).questions;
      if (Array.isArray(q)) return q;
      return [parsed];
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

export function NcertQuestionJsonUpload({
  adminUser,
  subject,
  classLevel,
  chapter,
  topics,
  onImported,
}: {
  adminUser: AdminUser;
  subject: string;
  classLevel: NcertClassLevel;
  chapter: string;
  /** Topics selected on the picker above — every row's `topic` must be one of these. */
  topics: string[];
  onImported?: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"checking" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; byTopic: { topic: string; count: number; startNo: number; endNo: number }[] } | null>(null);

  // A new chapter/topic selection invalidates whatever was staged for the last one.
  useEffect(() => reset(), [subject, classLevel, chapter, topics.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setFileLabel(null);
    setRows(null);
    setPreview(null);
    setError(null);
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function call(questions: unknown[], dryRun: boolean) {
    const token = await adminUser.getIdToken();
    return bulkUploadNcertQuestions({ data: { token, subject, classLevel, chapter, topics, questions, dryRun } });
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
      for (const f of list) all.push(...parseFile(f.name, await f.text()));
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
      setDone({ inserted: res.inserted, byTopic: res.byTopic });
      reset();
      await onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed — nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  function downloadSample() {
    const blob = new Blob([JSON.stringify(sample(topics), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ncert-questions-sample.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canImport = Boolean(preview?.ok) && !busy;
  const disabled = topics.length === 0;

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Upload JSON</h2>
          <p className="mt-1 text-xs text-foreground/50">
            Every question in the file must carry a <code>topic</code> — one of the topics selected above for{" "}
            <strong>{chapter || "this chapter"}</strong>. Numbering continues automatically per topic. If any question has a
            problem, nothing is saved.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSample}
          disabled={disabled}
          className="clay-chip flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold text-foreground/70 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Sample
        </button>
      </div>

      {disabled ? (
        <div className="clay-inset rounded-2xl px-4 py-5 text-center text-xs text-foreground/50">
          Select a chapter and at least one topic above to enable uploads.
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" multiple accept=".json,.jsonl,.ndjson,application/json" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="clay-inset flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-5 text-sm font-semibold text-foreground/70 disabled:opacity-60"
          >
            {busy === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy === "checking" ? "Checking…" : fileLabel ? `${fileLabel} — choose a different file` : "Choose JSON file(s)"}
          </button>
        </>
      )}

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
                {preview.byTopic.map((b) => (
                  <li key={b.topic}>
                    <strong>{b.topic}</strong>: {b.count} → #{b.startNo}–#{b.endNo}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-foreground/60">
                {preview.mcq} MCQ · {preview.integer} integer
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-3 text-xs text-foreground">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4" /> Nothing will be saved until this is fixed
              </p>
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
          Imported {done.inserted} question{done.inserted === 1 ? "" : "s"} ({done.byTopic.map((b) => `${b.topic} #${b.startNo}–#${b.endNo}`).join(" · ")})
        </p>
      )}
    </div>
  );
}
