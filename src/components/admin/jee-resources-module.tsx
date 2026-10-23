// src/components/admin/jee-resources-module.tsx
//
// Admin → Content → JEE Resources. Upload the PDFs your team has prepared and manage where they appear on
// /jee-main-2027/resources. Nothing here creates or edits educational content: a PDF goes in exactly as you
// made it and comes out exactly as you made it.
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  IconLoader2 as Loader2, IconUpload as Upload, IconTrash as Trash2, IconEye as Eye, IconPencil as Pencil, IconRefresh as Refresh,
  IconWorld as Globe, IconWorldOff as GlobeOff, IconFileText as FileText, IconExternalLink as ExternalLink, IconPlus as Plus, IconX as X,
} from "@tabler/icons-react";
import {
  adminJeeDeleteResource, adminJeeFileUrl, adminJeeListResources, adminJeeSaveResource, adminJeeSetPublished,
} from "@/server-functions/jee-resources-admin";
import { uploadJeePdf, type JeeUploaded } from "@/lib/jee-resource-upload";
import { getJeeSubjects } from "@/lib/jee-blueprint";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import {
  DEFAULT_JEE_EXAM, JEE_LIBRARY_YEAR, JEE_LIB_BASE, JEE_RESOURCE_EXAMS, JEE_RESOURCE_SUBJECTS, JEE_RESOURCE_SUBJECT_LABELS,
  JEE_RESOURCE_TYPES, JEE_RESOURCE_TYPE_LABELS, MAX_JEE_RESOURCE_BYTES, formatBytes, jeeLibChapterPath,
  type AdminJeeResource, type JeeAdminFilters, type JeeAdminList, type JeeResourceInput,
} from "@/lib/jee-resource-types";

type AdminUser = { getIdToken: () => Promise<string> };
type Notice = { kind: "ok" | "err"; text: string } | null;

const num = (x: number) => x.toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const field = "clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none";
const label = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-foreground/50";

const SUBJECTS = getJeeSubjects();
const chaptersFor = (subjectKey: string, keepSlug?: string) =>
  (SUBJECTS.find((s) => s.key === subjectKey)?.chapters ?? []).filter((c) => !c.retired || c.slug === keepSlug);
const chapterName = (subjectKey: string, slug: string) => SUBJECTS.find((s) => s.key === subjectKey)?.chapters.find((c) => c.slug === slug)?.name ?? slug;

function Kpi({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{l}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-foreground/50">{sub}</p>}
    </div>
  );
}

// ── PDF drop zone ────────────────────────────────────────────────────────────
function PdfDrop({ adminUser, file, onFile, existing, replaceMode }: {
  adminUser: AdminUser; file: JeeUploaded | null; onFile: (f: JeeUploaded | null) => void; existing?: { name: string; size: number }; replaceMode?: boolean;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = pct !== null;

  async function take(files: FileList | null) {
    const f = files?.[0];
    if (!f || busy) return;
    setErr(null);
    setPct(0);
    try {
      onFile(await uploadJeePdf(f, await adminUser.getIdToken(), setPct));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
    setPct(null);
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); };

  return (
    <div>
      {existing && !file && (
        <p className="mb-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-foreground/70">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Current file: <b>{existing.name}</b> · {formatBytes(existing.size)}</span>
        </p>
      )}
      {file ? (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{file.fileName} · {formatBytes(file.sizeBytes)} · uploaded{replaceMode ? " — will replace the current file when you save" : ""}</span>
          <button type="button" onClick={() => onFile(null)} className="ml-auto shrink-0 underline">remove</button>
        </p>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`clay-chip flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center text-sm ${over ? "border-primary" : "border-transparent"}`}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 text-foreground/60" />}
          <p className="font-semibold text-foreground/75">{busy ? `Uploading… ${pct}%` : replaceMode ? "Drop the replacement PDF here" : "Drag and drop your PDF here"}</p>
          {busy ? (
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          ) : (
            <>
              <button type="button" onClick={() => input.current?.click()} className="rounded-full bg-foreground px-4 py-1.5 text-xs font-bold text-background">Choose a PDF</button>
              <p className="text-[11px] text-foreground/45">PDF only · up to {formatBytes(MAX_JEE_RESOURCE_BYTES)}</p>
            </>
          )}
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
        </div>
      )}
      {err && <p className="mt-2 text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}

// ── Create / edit form ───────────────────────────────────────────────────────
function Editor({ adminUser, item, defaults, replaceFocus, onClose, onSaved }: {
  adminUser: AdminUser; item: AdminJeeResource | null; defaults: JeeAdminFilters; replaceFocus: boolean; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const editing = !!item;
  const [subjectKey, setSubjectKey] = useState<string>(item?.subjectKey ?? defaults.subjectKey ?? "");
  const [chapterSlug, setChapterSlug] = useState(item?.chapterSlug ?? defaults.chapterSlug ?? "");
  const [type, setType] = useState<string>(item?.type ?? defaults.type ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [exam, setExam] = useState<string>(item?.exam ?? DEFAULT_JEE_EXAM);
  const [examYear, setExamYear] = useState(String(item?.examYear ?? JEE_LIBRARY_YEAR));
  const [version, setVersion] = useState(item?.version ?? "");
  const [lastReviewedAt, setLastReviewedAt] = useState(item?.lastReviewedAt ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(item?.displayOrder ?? 0));
  const [sourceConfirmed, setSourceConfirmed] = useState(item?.sourceConfirmed ?? false);
  const [published, setPublished] = useState(item?.published ?? false);
  const [file, setFile] = useState<JeeUploaded | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false); // blocks a second submit fired before React re-renders the disabled button
  const [err, setErr] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const fileSection = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (replaceFocus ? fileSection : top).current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [replaceFocus]);

  const ready = !!subjectKey && !!chapterSlug && !!type && title.trim().length > 0 && (editing || !!file) && (!published || sourceConfirmed);

  async function save() {
    if (lock.current || !ready) return;
    lock.current = true;
    setSaving(true);
    setErr(null);
    try {
      const input: JeeResourceInput = {
        exam, examYear: Number(examYear), subjectKey, chapterSlug, type, title, description, published, version, lastReviewedAt,
        displayOrder: Number(displayOrder) || 0, sourceConfirmed,
        ...(file ? { filePath: file.path, fileName: file.fileName } : {}),
      };
      const r = await adminJeeSaveResource({ data: { token: await adminUser.getIdToken(), id: item?.id, input } });
      onSaved(
        `${editing ? "Changes saved" : "Resource saved"}${r.replaced ? " and the PDF was replaced" : ""} — ${published ? "it's live on the chapter page." : "kept as a draft (hidden from students)."}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save. Please try again.");
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div ref={top} className="clay scroll-mt-4 space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold">{editing ? "Edit resource" : "Upload new resource"}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-foreground/50 hover:bg-foreground/10"><X className="h-4 w-4" /></button>
      </div>

      <section>
        <p className="mb-2 text-sm font-bold">1 · Where does it belong?</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="jr-exam">Exam</label>
            <select id="jr-exam" className={field} value={exam} onChange={(e) => setExam(e.target.value)}>
              {JEE_RESOURCE_EXAMS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="jr-subject">Subject</label>
            <select id="jr-subject" className={field} value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setChapterSlug(""); }}>
              <option value="">Select subject…</option>
              {JEE_RESOURCE_SUBJECTS.map((s) => <option key={s} value={s}>{JEE_RESOURCE_SUBJECT_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="jr-chapter">Chapter</label>
            <select id="jr-chapter" className={field} value={chapterSlug} disabled={!subjectKey} onChange={(e) => setChapterSlug(e.target.value)}>
              <option value="">{subjectKey ? "Select chapter…" : "Pick a subject first"}</option>
              {chaptersFor(subjectKey, item?.chapterSlug).map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.retired ? " (not in syllabus)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="jr-type">Resource type</label>
            <select id="jr-type" className={field} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Select type…</option>
              {JEE_RESOURCE_TYPES.map((t) => <option key={t} value={t}>{JEE_RESOURCE_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-sm font-bold">2 · Title and description</p>
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="jr-title">Resource title</label>
            <input id="jr-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Chemical Bonding — Complete Revision Notes" />
          </div>
          <div>
            <label className={label} htmlFor="jr-desc">Short description (optional)</label>
            <textarea id="jr-desc" className={`${field} min-h-[72px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="One or two lines students will see under the title." />
          </div>
        </div>
      </section>

      <section ref={fileSection} className="scroll-mt-4">
        <p className="mb-2 text-sm font-bold">3 · PDF file</p>
        <PdfDrop adminUser={adminUser} file={file} onFile={setFile} replaceMode={editing} existing={item ? { name: item.fileName, size: item.sizeBytes } : undefined} />
      </section>

      <section>
        <p className="mb-2 text-sm font-bold">4 · Details and publishing</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={label} htmlFor="jr-year">Exam year</label><input id="jr-year" inputMode="numeric" className={field} value={examYear} onChange={(e) => setExamYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
          <div><label className={label} htmlFor="jr-version">Version</label><input id="jr-version" className={field} value={version} onChange={(e) => setVersion(e.target.value)} maxLength={20} placeholder="e.g. v1.2" /></div>
          <div><label className={label} htmlFor="jr-reviewed">Last reviewed</label><input id="jr-reviewed" type="date" className={field} value={lastReviewedAt} onChange={(e) => setLastReviewedAt(e.target.value)} /></div>
          <div><label className={label} htmlFor="jr-order">Display order</label><input id="jr-order" inputMode="numeric" className={field} value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
        </div>
        <p className="mt-1 text-[11px] text-foreground/45">Display order: lower numbers appear first among resources of the same type.</p>

        <label className="mt-4 flex items-start gap-2 text-xs text-foreground/75">
          <input type="checkbox" className="mt-0.5" checked={sourceConfirmed} onChange={(e) => setSourceConfirmed(e.target.checked)} />
          <span>I confirm this PDF is Edurack's own material (or we hold the licence to distribute it). Required to publish.</span>
        </label>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="jr-status" checked={!published} onChange={() => setPublished(false)} /> Draft <span className="text-xs text-foreground/45">(hidden from students)</span></label>
          <label className="flex items-center gap-2"><input type="radio" name="jr-status" checked={published} onChange={() => setPublished(true)} /> Published <span className="text-xs text-foreground/45">(visible on the chapter page)</span></label>
        </div>
        {published && !sourceConfirmed && <p className="mt-2 text-xs font-medium text-amber-700">Tick the confirmation above to publish, or switch to Draft.</p>}
      </section>

      {err && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!ready || saving} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : editing ? "Save changes" : "Save resource"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/60 hover:bg-foreground/5">Cancel</button>
        {!ready && <span className="text-xs text-foreground/45">{!editing && !file ? "Upload the PDF to enable saving." : "Fill in subject, chapter, type and title."}</span>}
      </div>
    </div>
  );
}

// ── Module ───────────────────────────────────────────────────────────────────
export function JeeResourcesModule({ adminUser }: { adminUser: AdminUser }) {
  const [filters, setFilters] = useState<JeeAdminFilters>({ status: "all", page: 1 });
  const [qInput, setQInput] = useState("");
  const [data, setData] = useState<JeeAdminList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<{ item: AdminJeeResource | null; replace: boolean } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setData(await adminJeeListResources({ data: { token: await adminUser.getIdToken(), filters } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load resources.");
    }
  }, [adminUser, filters]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ((f.q ?? "") === qInput.trim() ? f : { ...f, q: qInput.trim() || undefined, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const set = (patch: Partial<JeeAdminFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const fail = (e: unknown) => setNotice({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });

  async function doPreview(r: AdminJeeResource) {
    setBusyId(r.id);
    try {
      const { url, fileName } = await adminJeeFileUrl({ data: { token: await adminUser.getIdToken(), id: r.id } });
      if (typeof navigator !== "undefined" && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false) window.open(url, "_blank", "noopener");
      else setPreview({ url, name: fileName });
    } catch (e) { fail(e); }
    setBusyId(null);
  }
  async function toggle(r: AdminJeeResource) {
    setBusyId(r.id);
    try {
      await adminJeeSetPublished({ data: { token: await adminUser.getIdToken(), id: r.id, published: !r.published } });
      setNotice({ kind: "ok", text: r.published ? `“${r.title}” is now a draft and hidden from students.` : `“${r.title}” is now published.` });
      await load();
    } catch (e) { fail(e); }
    setBusyId(null);
  }
  async function remove(r: AdminJeeResource) {
    if (!window.confirm(`Delete “${r.title}”?\n\nThe PDF is removed and students can no longer open it. This can't be undone.`)) return;
    setBusyId(r.id);
    try {
      await adminJeeDeleteResource({ data: { token: await adminUser.getIdToken(), id: r.id } });
      setNotice({ kind: "ok", text: `Deleted “${r.title}”.` });
      await load();
    } catch (e) { fail(e); }
    setBusyId(null);
  }

  if (err && !data) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>;
  if (!data) return <div className="space-y-3"><div className="clay-inset h-24 animate-pulse rounded-2xl" /><div className="clay-inset h-64 animate-pulse rounded-2xl" /></div>;

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const t = data.totals;
  const chapterOptions = filters.subjectKey ? chaptersFor(filters.subjectKey) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">JEE Resources</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Notes, practice sheets, answer keys and solutions for JEE Main {JEE_LIBRARY_YEAR}. Students see them at{" "}
            <a href={JEE_LIB_BASE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline">{JEE_LIB_BASE}<ExternalLink className="h-3 w-3" /></a>.
          </p>
        </div>
        <button type="button" onClick={() => setEditor({ item: null, replace: false })} className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background">
          <Plus className="h-4 w-4" /> Upload New Resource
        </button>
      </div>

      {notice && (
        <p role="status" className={`rounded-2xl border px-4 py-3 text-sm ${notice.kind === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</p>
      )}
      {err && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Resources" value={num(t.resources)} sub={`${num(t.published)} published · ${num(t.drafts)} draft`} />
        <Kpi label="Downloads" value={num(t.downloads)} sub="unique per visitor per hour" />
        <Kpi label="Previews" value={num(t.previews)} sub="PDF opened in the viewer" />
        <div className="clay px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">Most downloaded</p>
          {data.top.length === 0 ? <p className="mt-2 text-sm text-foreground/45">No activity yet.</p> : (
            <ul className="mt-1.5 space-y-1 text-xs">
              {data.top.slice(0, 3).map((r) => <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{r.title}</span><span className="shrink-0 font-semibold">{num(r.downloads)}</span></li>)}
            </ul>
          )}
        </div>
      </div>

      {editor && (
        <Editor
          key={editor.item?.id ?? "new"}
          adminUser={adminUser}
          item={editor.item}
          replaceFocus={editor.replace}
          defaults={filters}
          onClose={() => setEditor(null)}
          onSaved={(msg) => { setEditor(null); setNotice({ kind: "ok", text: msg }); void load(); }}
        />
      )}

      <div className="clay space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className={`${field} lg:col-span-1`} value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search title or file name…" aria-label="Search" />
          <select className={field} aria-label="Subject filter" value={filters.subjectKey ?? ""} onChange={(e) => set({ subjectKey: e.target.value || undefined, chapterSlug: undefined })}>
            <option value="">All subjects</option>
            {JEE_RESOURCE_SUBJECTS.map((s) => <option key={s} value={s}>{JEE_RESOURCE_SUBJECT_LABELS[s]}</option>)}
          </select>
          <select className={field} aria-label="Chapter filter" value={filters.chapterSlug ?? ""} disabled={!filters.subjectKey} onChange={(e) => set({ chapterSlug: e.target.value || undefined })}>
            <option value="">{filters.subjectKey ? "All chapters" : "Pick a subject for chapters"}</option>
            {chapterOptions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select className={field} aria-label="Resource type filter" value={filters.type ?? ""} onChange={(e) => set({ type: e.target.value || undefined })}>
            <option value="">All types</option>
            {JEE_RESOURCE_TYPES.map((x) => <option key={x} value={x}>{JEE_RESOURCE_TYPE_LABELS[x]}</option>)}
          </select>
          <select className={field} aria-label="Status filter" value={filters.status ?? "all"} onChange={(e) => set({ status: e.target.value as JeeAdminFilters["status"] })}>
            <option value="all">Published + draft</option>
            <option value="published">Published only</option>
            <option value="draft">Drafts only</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-foreground/45">
                <th className="px-3 py-2">Resource</th><th className="px-3 py-2">Subject · Chapter</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">File</th><th className="px-3 py-2">Uploaded</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Downloads</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-foreground/45">{data.totals.resources === 0 ? "Nothing uploaded yet — click “Upload New Resource”." : "No resources match these filters."}</td></tr>
              )}
              {data.items.map((r) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2"><p className="font-semibold">{r.title}</p>{r.version && <p className="text-[11px] text-foreground/45">{r.version}</p>}</td>
                  <td className="px-3 py-2"><p>{JEE_RESOURCE_SUBJECT_LABELS[r.subjectKey]}</p><p className="text-[11px] text-foreground/50">{chapterName(r.subjectKey, r.chapterSlug)}</p></td>
                  <td className="px-3 py-2">{JEE_RESOURCE_TYPE_LABELS[r.type]}</td>
                  <td className="px-3 py-2 text-xs"><p className="max-w-[180px] truncate" title={r.fileName}>{r.fileName}</p><p className="text-foreground/45">{formatBytes(r.sizeBytes)}</p></td>
                  <td className="px-3 py-2 text-xs text-foreground/60">{when(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.published ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{r.published ? "Published" : "Draft"}</span>
                  </td>
                  <td className="px-3 py-2 text-right"><p className="font-semibold">{num(r.downloadCount)}</p><p className="text-[11px] text-foreground/45">{num(r.previewCount)} previews</p></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-0.5">
                      {busyId === r.id ? <Loader2 className="m-1.5 h-4 w-4 animate-spin" /> : (
                        <>
                          <button type="button" title="Preview" aria-label="Preview" onClick={() => doPreview(r)} className="rounded-lg p-1.5 text-foreground/55 hover:bg-foreground/10"><Eye className="h-4 w-4" /></button>
                          <button type="button" title="Edit" aria-label="Edit" onClick={() => setEditor({ item: r, replace: false })} className="rounded-lg p-1.5 text-foreground/55 hover:bg-foreground/10"><Pencil className="h-4 w-4" /></button>
                          <button type="button" title="Replace PDF" aria-label="Replace PDF" onClick={() => setEditor({ item: r, replace: true })} className="rounded-lg p-1.5 text-foreground/55 hover:bg-foreground/10"><Refresh className="h-4 w-4" /></button>
                          <button type="button" title={r.published ? "Unpublish" : "Publish"} aria-label={r.published ? "Unpublish" : "Publish"} onClick={() => toggle(r)} className="rounded-lg p-1.5 text-foreground/55 hover:bg-foreground/10">{r.published ? <GlobeOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}</button>
                          {r.published && <a title="Open student page" aria-label="Open student page" href={jeeLibChapterPath(r.subjectKey, r.chapterSlug)} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-foreground/55 hover:bg-foreground/10"><ExternalLink className="h-4 w-4" /></a>}
                          <button type="button" title="Delete" aria-label="Delete" onClick={() => remove(r)} className="rounded-lg p-1.5 text-red-500/80 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1 text-xs text-foreground/60">
            <span>{num(data.total)} resources · page {data.page} of {pages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })} className="rounded-full bg-secondary px-4 py-1.5 font-bold disabled:opacity-40">Previous</button>
              <button type="button" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })} className="rounded-full bg-secondary px-4 py-1.5 font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {preview && <PdfPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
}
