// Admin → Free Resources. Upload files for the open /free-resources page, and see
// how many students (and guests) are downloading them.
import { useCallback, useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconUpload as Upload, IconTrash as Trash2, IconEye as Eye, IconEyeOff as EyeOff, IconFileText as FileText, IconExternalLink as ExternalLink } from "@tabler/icons-react";
import { adminCreateResource, adminDeleteResource, adminListResources, adminSetResourcePublished } from "@/server-functions/resources-admin";
import { uploadResourceFile, type UploadedResourceFile } from "@/lib/resource-upload";
import { formatFileSize } from "@/lib/blog-document-format";
import {
  RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABELS, RESOURCE_EXAMS, RESOURCE_EXAM_LABELS,
  type AdminResource, type ResourceCategory, type ResourceExam, type ResourceStats,
} from "@/lib/resource-types";

type AdminUser = { getIdToken: () => Promise<string> };
const num = (x: number) => x.toLocaleString("en-IN");
const short = (day: string) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const catLabel = (c: string) => RESOURCE_CATEGORY_LABELS[c as ResourceCategory] ?? c;
const examLabel = (e: string) => RESOURCE_EXAM_LABELS[e as ResourceExam] ?? e;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-foreground/50">{sub}</p>}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="text-sm text-foreground/45">No downloads yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-foreground">{r.label}</span><span className="shrink-0 font-semibold">{num(r.n)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (r.n / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Trend({ data }: { data: { day: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.day} title={`${short(d.day)}: ${d.n}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(d.n ? 4 : 1.5, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-foreground/40"><span>{short(data[0].day)}</span><span>{short(data[data.length - 1].day)}</span></div>
    </div>
  );
}

function UploadCard({ adminUser, onDone }: { adminUser: AdminUser; onDone: () => void }) {
  const [file, setFile] = useState<UploadedResourceFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [exam, setExam] = useState<ResourceExam>("neet");
  const [category, setCategory] = useState<ResourceCategory>("notes");
  const [published, setPublished] = useState(true);

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setErr(null); setUploading(true);
    try {
      const up = await uploadResourceFile(f);
      setFile(up);
      if (!title) setTitle(up.suggestedTitle);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setUploading(false);
  }

  async function save() {
    if (!file) return;
    setErr(null); setSaving(true);
    try {
      await adminCreateResource({ data: { token: await adminUser.getIdToken(), input: { title, description, subject, exam, category, published, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, bucket: "", path: file.path } } });
      setFile(null); setTitle(""); setDescription(""); setSubject("");
      onDone();
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  const field = "clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none";
  return (
    <div className="clay space-y-3 p-5">
      <h3 className="font-display text-sm font-bold">Add a resource</h3>
      {!file ? (
        <label className={`clay-chip flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm font-semibold text-foreground/70 ${uploading ? "opacity-60" : ""}`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Choose a PDF or document (max 50 MB)"}
          <input type="file" disabled={uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.png,.jpg,.jpeg" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} className="hidden" />
        </label>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-800"><FileText className="h-4 w-4" />{file.fileName} · {formatFileSize(file.sizeBytes)} uploaded
          <button type="button" onClick={() => setFile(null)} className="ml-auto underline">change</button></p>
      )}
      {file && (
        <>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title students see" maxLength={120} />
          <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on what's inside (optional)" maxLength={400} />
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={field} value={exam} onChange={(e) => setExam(e.target.value as ResourceExam)} aria-label="Exam">{RESOURCE_EXAMS.map((x) => <option key={x} value={x}>{RESOURCE_EXAM_LABELS[x]}</option>)}</select>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value as ResourceCategory)} aria-label="Category">{RESOURCE_CATEGORIES.map((x) => <option key={x} value={x}>{RESOURCE_CATEGORY_LABELS[x]}</option>)}</select>
            <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)" maxLength={60} />
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground/70"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publish immediately (visible on /free-resources)</label>
          <button type="button" onClick={save} disabled={saving || !title.trim()} className="rounded-full bg-foreground px-5 py-2 text-xs font-bold text-background disabled:opacity-40">{saving ? "Saving…" : "Save resource"}</button>
        </>
      )}
      {err && <p className="text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}

export function ResourcesModule({ adminUser }: { adminUser: AdminUser }) {
  const [items, setItems] = useState<AdminResource[] | null>(null);
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await adminListResources({ data: { token: await adminUser.getIdToken() } });
      setItems(r.items); setStats(r.stats);
    } catch (e) { setErr((e as Error).message); }
  }, [adminUser]);
  useEffect(() => { load(); }, [load]);

  async function toggle(r: AdminResource) {
    try { await adminSetResourcePublished({ data: { token: await adminUser.getIdToken(), id: r.id, published: !r.published } }); load(); } catch (e) { setErr((e as Error).message); }
  }
  async function remove(r: AdminResource) {
    if (!window.confirm(`Remove “${r.title}” from the public page? Its download history is kept.`)) return;
    try { await adminDeleteResource({ data: { token: await adminUser.getIdToken(), id: r.id } }); load(); } catch (e) { setErr((e as Error).message); }
  }

  if (err && !items) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>;
  if (!items || !stats) return <div className="space-y-3"><div className="clay-inset h-24 animate-pulse rounded-2xl" /><div className="clay-inset h-64 animate-pulse rounded-2xl" /></div>;
  const t = stats.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Free Resources</h1>
        <p className="mt-1 text-sm text-foreground/60">Open to everyone at <a href="/free-resources" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline">/free-resources <ExternalLink className="h-3 w-3" /></a> — no login needed. Every download is counted below.</p>
      </div>
      {err && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total downloads" value={num(t.downloads)} sub={`${num(t.today)} today`} />
        <Kpi label="Last 7 days" value={num(t.last7d)} sub={`${num(t.last30d)} in 30 days`} />
        <Kpi label="Unique visitors" value={num(t.uniqueVisitors)} sub="distinct browsers" />
        <Kpi label="Students vs guests" value={`${num(t.loggedIn)} / ${num(t.guests)}`} sub="logged in / not logged in" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="clay p-5 lg:col-span-2"><h3 className="mb-3 font-display text-sm font-bold">Downloads — last 30 days</h3><Trend data={stats.daily} /></div>
        <div className="clay p-5"><h3 className="mb-3 font-display text-sm font-bold">By exam</h3><Bars rows={stats.byExam.map((r) => ({ label: examLabel(r.label), n: r.n }))} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="clay p-5"><h3 className="mb-3 font-display text-sm font-bold">Most downloaded</h3><Bars rows={stats.top.map((r) => ({ label: `${r.title} · ${examLabel(r.exam)}`, n: r.n }))} /></div>
        <div className="clay p-5"><h3 className="mb-3 font-display text-sm font-bold">By category</h3><Bars rows={stats.byCategory.map((r) => ({ label: catLabel(r.label), n: r.n }))} /></div>
        <div className="clay p-5">
          <h3 className="mb-3 font-display text-sm font-bold">Latest downloads</h3>
          {stats.recent.length === 0 ? <p className="text-sm text-foreground/45">No downloads yet.</p> : (
            <ul className="space-y-2 text-xs">
              {stats.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2"><span className="truncate">{r.title}</span><span className="shrink-0 text-foreground/45">{r.who === "student" ? "student" : "guest"} · {when(r.at)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <UploadCard adminUser={adminUser} onDone={load} />

      <div className="clay overflow-x-auto p-2">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wide text-foreground/45"><th className="px-3 py-2">Resource</th><th className="px-3 py-2">Exam</th><th className="px-3 py-2 text-right">Downloads</th><th className="px-3 py-2 text-right">Unique</th><th className="px-3 py-2">Last</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-foreground/45">Nothing uploaded yet.</td></tr>}
            {items.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2"><p className="font-semibold">{r.title}</p><p className="text-[11px] text-foreground/45">{catLabel(r.category)}{r.subject ? ` · ${r.subject}` : ""} · {r.fileName} {r.sizeBytes ? `· ${formatFileSize(r.sizeBytes)}` : ""}{!r.published && " · hidden"}</p></td>
                <td className="px-3 py-2">{examLabel(r.exam)}</td>
                <td className="px-3 py-2 text-right font-semibold">{num(r.downloads)}</td>
                <td className="px-3 py-2 text-right">{num(r.uniqueDownloaders)}</td>
                <td className="px-3 py-2 text-xs text-foreground/50">{r.lastDownloadedAt ? when(r.lastDownloadedAt) : "—"}</td>
                <td className="px-3 py-2"><div className="flex justify-end gap-1">
                  <button type="button" onClick={() => toggle(r)} aria-label={r.published ? "Hide" : "Publish"} title={r.published ? "Hide from public page" : "Publish"} className="rounded-lg p-1.5 text-foreground/50 hover:bg-foreground/10">{r.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => remove(r)} aria-label="Remove" className="rounded-lg p-1.5 text-foreground/50 hover:bg-foreground/10"><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
