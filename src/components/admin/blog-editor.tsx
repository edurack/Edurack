// Blog post editor: write with a live preview, see how it will look on Google, and publish
// with a clear readiness check. Every server action is the same as before; only the experience changed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBlogPost, updateBlogPost, getBlogPostAdmin, publishBlogPost, scheduleBlogPost,
  revertBlogPostToDraft, archiveBlogPost, restoreBlogPost, suggestBlogSlug, checkBlogSlugAvailable,
} from "@/server-functions/blog-admin";
import { uploadBlogImage } from "@/lib/blog-image-upload";
import { BlogImageInsertField } from "@/components/admin/blog-image-insert-field";
import { BlogDocumentsPanel } from "@/components/admin/blog-documents-panel";
import { BlogBody, estimateReadingTimeMinutes, stripMarkdownToText } from "@/lib/blog-content";
import { BLOG_CATEGORIES, BLOG_CATEGORY_LABELS, type BlogCategory, type BlogPost, type BlogPostInput } from "@/lib/blog-types";
import { EXAM_KEYS, EXAM_LABELS, type ExamKey, type Track } from "@/lib/admin-types";
import { EMPTY_BLOG_FORM } from "@/lib/blog-starters";

type AdminUser = { getIdToken: () => Promise<string> };
const TRACKS: Track[] = ["11th", "12th", "Dropper", "All"];

const field = "w-full rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const lbl = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-foreground/50";

const STATUS_STYLE: Record<BlogPost["status"], string> = {
  draft: "bg-secondary text-foreground/60",
  scheduled: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-secondary text-foreground/40",
};
export const StatusPill = ({ status }: { status: BlogPost["status"] }) => (
  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}>{status}</span>
);

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function presets(): { label: string; value: string }[] {
  const now = new Date();
  const inHour = new Date(now.getTime() + 3600e3);
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1); tmr.setHours(7, 0, 0, 0);
  const sat = new Date(now); sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7)); sat.setHours(9, 0, 0, 0);
  return [{ label: "In 1 hour", value: toLocalInput(inHour) }, { label: "Tomorrow 7 AM", value: toLocalInput(tmr) }, { label: "Saturday 9 AM", value: toLocalInput(sat) }];
}
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

// ─── live preview of the post as readers see it ────────────────────────────
export function PostPreview({ form, readMins }: { form: BlogPostInput; readMins: number }) {
  return (
    <article className="rounded-3xl border border-border bg-white p-6 text-[#1F2333]">
      {form.coverImageUrl && <img src={form.coverImageUrl} alt={form.coverImageAlt} className="mb-5 h-52 w-full rounded-2xl object-cover" />}
      <span className="rounded-full bg-[#DCEAFB] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">{BLOG_CATEGORY_LABELS[form.category]}</span>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight">{form.title || "Your post title"}</h1>
      <p className="mt-2 text-xs text-[#6B7280]">{form.author.name || "Edurack Team"} · {readMins} min read</p>
      {form.excerpt && <p className="mt-4 text-base leading-relaxed text-[#374151]">{form.excerpt}</p>}
      <hr className="my-5 border-[#E4E9F1]" />
      {form.bodyMarkdown.trim() ? <BlogBody markdown={form.bodyMarkdown} /> : <p className="text-sm text-[#9CA3AF]">Start writing and your post appears here.</p>}
    </article>
  );
}

export function BlogEditor({ adminUser, postId, initial, onBack }: {
  adminUser: AdminUser;
  postId: string | null;
  /** Starter template values for a new post. */
  initial?: Partial<BlogPostInput>;
  onBack: () => void;
}) {
  const baseForm = useMemo<BlogPostInput>(() => ({ ...EMPTY_BLOG_FORM, ...initial, author: { ...EMPTY_BLOG_FORM.author, ...(initial?.author ?? {}) } }), [initial]);
  const [loading, setLoading] = useState(Boolean(postId));
  const [id, setId] = useState<string | null>(postId);
  const [status, setStatus] = useState<BlogPost["status"]>("draft");
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [form, setForm] = useState<BlogPostInput>(baseForm);
  const [slugTouched, setSlugTouched] = useState(Boolean(postId));
  const [slugWarning, setSlugWarning] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [mode, setMode] = useState<"write" | "split" | "preview">("write");
  const [tab, setTab] = useState<"publish" | "details" | "seo" | "files">("publish");
  const [scheduleAt, setScheduleAt] = useState("");
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(baseForm));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const [backup, setBackup] = useState<BlogPostInput | null>(null);
  const loadedRef = useRef(false);

  const backupKey = `edurack-blog-draft:${postId ?? "new"}`;
  const isLive = status === "published" || status === "archived";
  const set = useCallback(<K extends keyof BlogPostInput>(k: K, v: BlogPostInput[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  // load existing post
  useEffect(() => {
    if (!postId) { loadedRef.current = true; return; }
    (async () => {
      try {
        const { post } = await getBlogPostAdmin({ data: { token: await adminUser.getIdToken(), id: postId } });
        const f: BlogPostInput = {
          title: post.title, slug: post.slug, excerpt: post.excerpt, category: post.category, tags: post.tags, examKey: post.examKey, track: post.track,
          coverImageUrl: post.coverImageUrl, coverImageAlt: post.coverImageAlt, bodyMarkdown: post.bodyMarkdown, author: post.author, pinned: post.pinned,
          relatedBundleId: post.relatedBundleId, relatedBatchId: post.relatedBatchId, documents: post.documents ?? [],
          seoTitleOverride: post.seoTitleOverride, seoDescriptionOverride: post.seoDescriptionOverride, substantiveUpdate: false,
        };
        setForm(f); setSavedSnap(JSON.stringify(f)); setStatus(post.status); setPublishAt(post.publishAt ?? null); setSavedAt(post.updatedAt ? new Date(post.updatedAt).getTime() : null);
      } catch { setError("Couldn't load this post."); }
      loadedRef.current = true; setLoading(false);
    })();
  }, [postId, adminUser]);

  const snap = JSON.stringify(form);
  const dirty = snap !== savedSnap;

  // local backup + recovery (never touches the server, so no accidental live edits)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (raw) { const b = JSON.parse(raw) as { form: BlogPostInput; base: string }; if (b.base !== JSON.stringify(baseForm) || postId) setBackup(b.form); }
    } catch { /* storage unavailable */ }
  }, [backupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    const t = setTimeout(() => { try { localStorage.setItem(backupKey, JSON.stringify({ form, base: JSON.stringify(baseForm) })); } catch { /* ignore */ } }, 800);
    return () => clearTimeout(t);
  }, [snap, dirty, backupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearBackup = () => { try { localStorage.removeItem(backupKey); } catch { /* ignore */ } setBackup(null); };

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function handleTitle(title: string) {
    set("title", title);
    if (!slugTouched && !isLive) {
      try { set("slug", (await suggestBlogSlug({ data: { token: await adminUser.getIdToken(), title } })).slug); } catch { /* server re-derives on save */ }
    }
  }
  async function handleSlugBlur() {
    if (!form.slug || isLive) return;
    try { const r = await checkBlogSlugAvailable({ data: { token: await adminUser.getIdToken(), slug: form.slug, excludeId: id ?? undefined } }); setSlugWarning(r.available ? null : "That slug is already taken."); } catch { setSlugWarning(null); }
  }
  async function uploadCover(file: File) {
    setCoverUploading(true); setError(null);
    try { set("coverImageUrl", await uploadBlogImage(file)); } catch { setError("Cover image upload failed."); }
    setCoverUploading(false);
  }

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true); setError(null);
    try {
      const token = await adminUser.getIdToken();
      let savedId = id;
      if (id) await updateBlogPost({ data: { token, id, post: form } });
      else { const r = await createBlogPost({ data: { token, post: form } }); savedId = r.id; setId(r.id); }
      setSavedSnap(JSON.stringify(form)); setSavedAt(Date.now()); clearBackup();
      return savedId;
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); return null; }
    finally { setSaving(false); }
  }, [adminUser, id, form]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd + S
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!saving) save(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [save, saving]);

  async function publishNow() {
    setPublishing(true); setError(null);
    try {
      const sid = await save(); if (!sid) return;
      await publishBlogPost({ data: { token: await adminUser.getIdToken(), id: sid } }); setStatus("published"); setPublishAt(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't publish."); }
    setPublishing(false);
  }
  async function schedule(value: string) {
    if (!value) return;
    setPublishing(true); setError(null);
    try {
      const sid = await save(); if (!sid) return;
      const iso = new Date(value).toISOString();
      await scheduleBlogPost({ data: { token: await adminUser.getIdToken(), id: sid, publishAt: iso } }); setStatus("scheduled"); setPublishAt(iso); setScheduleAt("");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't schedule."); }
    setPublishing(false);
  }
  const act = async (fn: typeof revertBlogPostToDraft, next: BlogPost["status"]) => { if (!id) return; await fn({ data: { token: await adminUser.getIdToken(), id } }); setStatus(next); setPublishAt(null); };

  // ── readiness & quality ──
  const words = useMemo(() => stripMarkdownToText(form.bodyMarkdown).split(/\s+/).filter(Boolean).length, [form.bodyMarkdown]);
  const readMins = useMemo(() => estimateReadingTimeMinutes(form.bodyMarkdown), [form.bodyMarkdown]);
  const required = useMemo(() => [
    { label: "Title", ok: !!form.title.trim() },
    { label: "Excerpt", ok: !!form.excerpt.trim() },
    { label: "Body", ok: !!form.bodyMarkdown.trim() },
    { label: "Cover image alt text", ok: !form.coverImageUrl || !!form.coverImageAlt.trim(), hide: !form.coverImageUrl },
  ].filter((r) => !r.hide), [form]);
  const missing = required.filter((r) => !r.ok);
  const seoTitle = form.seoTitleOverride || form.title;
  const seoDesc = form.seoDescriptionOverride || form.excerpt;
  const quality = useMemo(() => [
    { label: "Title under 60 characters", ok: !!form.title && form.title.length <= 60 },
    { label: "Excerpt 120–160 characters", ok: form.excerpt.length >= 120 && form.excerpt.length <= 160 },
    { label: "Cover image added", ok: !!form.coverImageUrl },
    { label: "At least 2 tags", ok: form.tags.length >= 2 },
    { label: "Has section headings (##)", ok: /^##\s+/m.test(form.bodyMarkdown) },
    { label: "300+ words", ok: words >= 300 },
    { label: "Has a button or link for readers", ok: /\[button:|\]\(https?:\/\/|\]\(\//.test(form.bodyMarkdown) },
  ], [form, words]);
  const qualityScore = quality.filter((q) => q.ok).length;

  const addTag = (raw: string) => {
    const tags = raw.split(",").map((t) => t.trim()).filter(Boolean).filter((t) => !form.tags.includes(t));
    if (tags.length) set("tags", [...form.tags, ...tags]); setTagDraft("");
  };

  if (loading) return <div className="space-y-3"><div className="clay-inset h-16 animate-pulse rounded-2xl" /><div className="clay-inset h-96 animate-pulse rounded-2xl" /></div>;

  const saveLabel = saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${ago(savedAt)}` : "Not saved yet";

  // ── side panel (reused in write mode and, below, in split mode) ──
  const sidePanel = (
    <div className="clay overflow-hidden">
      <div className="flex border-b border-border bg-secondary/50 p-1.5">
        {([["publish", "Publish"], ["details", "Details"], ["seo", "SEO"], ["files", `Files${form.documents?.length ? ` · ${form.documents.length}` : ""}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${tab === k ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      <div className="space-y-5 p-5">
        {tab === "publish" && (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-foreground">Ready to publish?</p><span className={`text-xs font-bold ${missing.length ? "text-amber-700" : "text-green-700"}`}>{missing.length ? `${missing.length} to fix` : "All set ✓"}</span></div>
              <ul className="space-y-1.5">
                {required.map((r) => <li key={r.label} className={`flex items-center gap-2 text-xs ${r.ok ? "text-foreground/60" : "font-semibold text-amber-700"}`}><span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${r.ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.ok ? "✓" : "!"}</span>{r.label}</li>)}
              </ul>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-foreground">Quality tips</p><span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{qualityScore}/{quality.length}</span></div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(qualityScore / quality.length) * 100}%` }} /></div>
              <ul className="space-y-1">{quality.map((q) => <li key={q.label} className={`flex items-center gap-2 text-[11px] ${q.ok ? "text-foreground/40 line-through" : "text-foreground/70"}`}><span>{q.ok ? "✓" : "○"}</span>{q.label}</li>)}</ul>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              {status === "scheduled" && publishAt && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">⏰ Goes live {new Date(publishAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
              {(status === "draft" || status === "scheduled") && (
                <>
                  <button type="button" onClick={publishNow} disabled={publishing || missing.length > 0} className="clay-btn w-full py-2.5 text-sm disabled:opacity-40">{publishing ? "Publishing…" : "🚀 Publish now"}</button>
                  <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-foreground/45">{status === "scheduled" ? "Reschedule" : "Or schedule"}</p>
                  <div className="flex flex-wrap gap-1.5">{presets().map((p) => <button key={p.label} type="button" disabled={missing.length > 0 || publishing} onClick={() => schedule(p.value)} className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground/70 hover:border-primary hover:text-primary disabled:opacity-40">{p.label}</button>)}</div>
                  <div className="flex gap-2"><input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className={`${field} flex-1 py-2 text-xs`} /><button type="button" disabled={!scheduleAt || missing.length > 0 || publishing} onClick={() => schedule(scheduleAt)} className="clay-btn px-4 text-xs disabled:opacity-40">Set</button></div>
                </>
              )}
              {status === "published" && (
                <>
                  <button type="button" disabled={saving || !dirty} onClick={save} className="clay-btn w-full py-2.5 text-sm disabled:opacity-40">{saving ? "Saving…" : "Save changes (live)"}</button>
                  <label className="flex items-start gap-2 text-xs text-foreground/70"><input type="checkbox" className="mt-0.5" checked={form.substantiveUpdate} onChange={(e) => set("substantiveUpdate", e.target.checked)} />This edit is substantive: show an "Updated" badge to readers</label>
                  <button type="button" onClick={() => act(revertBlogPostToDraft, "draft")} className="clay-btn-ghost w-full py-2 text-xs">Unpublish to draft</button>
                </>
              )}
              {status === "scheduled" && <label className="flex items-start gap-2 text-xs text-foreground/70"><input type="checkbox" className="mt-0.5" checked={form.substantiveUpdate} onChange={(e) => set("substantiveUpdate", e.target.checked)} />This edit is substantive: show an "Updated" badge</label>}
              {status === "archived" && <button type="button" onClick={() => act(restoreBlogPost, "draft")} className="clay-btn-ghost w-full py-2 text-xs">Restore to draft</button>}
              {status !== "archived" && id && <button type="button" onClick={() => act(archiveBlogPost, "archived")} className="w-full py-1.5 text-xs font-semibold text-foreground/40 hover:text-foreground/70">Archive</button>}
            </div>
          </>
        )}

        {tab === "details" && (
          <>
            <div><label className={lbl}>Category</label><select className={field} value={form.category} onChange={(e) => set("category", e.target.value as BlogCategory)}>{BLOG_CATEGORIES.map((c) => <option key={c} value={c}>{BLOG_CATEGORY_LABELS[c]}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Exam</label><select className={field} value={form.examKey ?? ""} onChange={(e) => set("examKey", (e.target.value || null) as ExamKey | null)}><option value="">Any</option>{EXAM_KEYS.map((k) => <option key={k} value={k}>{EXAM_LABELS[k]}</option>)}</select></div>
              <div><label className={lbl}>Class</label><select className={field} value={form.track ?? ""} onChange={(e) => set("track", (e.target.value || null) as Track | null)}><option value="">Any</option>{TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div>
              <label className={lbl}>Tags</label>
              <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-background p-2">
                {form.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", form.tags.filter((x) => x !== t))} className="text-accent-foreground/60 hover:text-red-500">✕</button></span>)}
                <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagDraft); } else if (e.key === "Backspace" && !tagDraft && form.tags.length) set("tags", form.tags.slice(0, -1)); }} onBlur={() => addTag(tagDraft)} placeholder={form.tags.length ? "" : "Type a tag, press Enter"} className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-xs focus:outline-none" />
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><input type="checkbox" className="mt-0.5" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} />⭐ Feature on the blog index <span className="text-amber-700/70">(several posts can be featured)</span></label>
            <div className="space-y-2.5 border-t border-border pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Byline</p>
              <input className={field} placeholder="Author name" value={form.author.name} onChange={(e) => set("author", { ...form.author, name: e.target.value })} />
              <textarea rows={2} className={field} placeholder="Short bio (optional)" value={form.author.bio ?? ""} onChange={(e) => set("author", { ...form.author, bio: e.target.value || null })} />
            </div>
            <div className="space-y-2.5 border-t border-border pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Related call to action</p>
              <input className={`${field} font-mono text-xs`} placeholder="Related bundle ID" value={form.relatedBundleId ?? ""} onChange={(e) => set("relatedBundleId", e.target.value || null)} />
              <input className={`${field} font-mono text-xs`} placeholder="Related mentorship batch ID" value={form.relatedBatchId ?? ""} onChange={(e) => set("relatedBatchId", e.target.value || null)} />
            </div>
          </>
        )}

        {tab === "seo" && (
          <>
            <div>
              <p className={lbl}>How it looks on Google</p>
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="truncate text-xs text-[#4D5156]">edurack.in › blog › {form.slug || "your-post"}</p>
                <p className="mt-0.5 line-clamp-2 text-[17px] leading-snug text-[#1A0DAB]">{seoTitle || "Your post title"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#4D5156]">{seoDesc || "Your excerpt appears here. Write one that makes people want to click."}</p>
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between"><label className={lbl}>Search title</label><span className={`mb-1.5 text-[11px] ${seoTitle.length > 60 ? "text-amber-600" : "text-foreground/40"}`}>{seoTitle.length}/60</span></div>
              <input className={field} value={form.seoTitleOverride ?? ""} onChange={(e) => set("seoTitleOverride", e.target.value || null)} placeholder={form.title || "Defaults to the post title"} />
            </div>
            <div>
              <div className="flex items-end justify-between"><label className={lbl}>Search description</label><span className={`mb-1.5 text-[11px] ${seoDesc.length > 160 ? "text-amber-600" : "text-foreground/40"}`}>{seoDesc.length}/160</span></div>
              <textarea rows={3} className={field} value={form.seoDescriptionOverride ?? ""} onChange={(e) => set("seoDescriptionOverride", e.target.value || null)} placeholder="Defaults to the excerpt" />
            </div>
            <div>
              <p className={lbl}>Social share card</p>
              <div className="overflow-hidden rounded-2xl border border-border bg-white">
                {form.coverImageUrl ? <img src={form.coverImageUrl} alt="" className="h-28 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-[#DCEAFB] text-3xl">📚</div>}
                <div className="px-3.5 py-2.5"><p className="text-[10px] uppercase text-[#6B7280]">edurack.in</p><p className="line-clamp-1 text-sm font-bold text-[#1F2333]">{seoTitle || "Your post title"}</p><p className="line-clamp-2 text-xs text-[#6B7280]">{seoDesc || "Description"}</p></div>
              </div>
            </div>
          </>
        )}

        {tab === "files" && <BlogDocumentsPanel documents={form.documents ?? []} onChange={(docs) => set("documents", docs)} />}
      </div>
    </div>
  );

  return (
    <div>
      {/* top bar */}
      <div className="sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/90 px-3 py-2.5 backdrop-blur">
        <button type="button" onClick={() => { if (!dirty || window.confirm("You have unsaved changes. Leave anyway?")) onBack(); }} className="clay-btn-ghost px-3.5 py-1.5 text-sm">← Posts</button>
        <StatusPill status={status} />
        <span className={`text-xs ${dirty ? "font-semibold text-amber-700" : "text-foreground/50"}`}>{saveLabel}</span>
        <span className="hidden text-xs text-foreground/40 md:inline">{words.toLocaleString("en-IN")} words · {readMins} min read</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-full border border-border bg-secondary p-0.5">
            {(["write", "split", "preview"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"} ${m === "split" ? "hidden lg:block" : ""}`}>{m}</button>)}
          </div>
          <button type="button" onClick={save} disabled={saving || !dirty} title="Ctrl/Cmd + S" className="clay-btn px-4 py-1.5 text-sm disabled:opacity-40">{saving ? "Saving…" : status === "published" ? "Save (live)" : "Save draft"}</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      {backup && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="flex-1">We found unsaved text from your last session on this device.</span>
          <button type="button" className="clay-btn px-4 py-1.5 text-xs" onClick={() => { setForm(backup); setBackup(null); }}>Restore it</button>
          <button type="button" className="text-xs font-semibold text-amber-800 hover:underline" onClick={clearBackup}>Discard</button>
        </div>
      )}

      <div className={mode === "split" ? "" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]"}>
        <div className="min-w-0 space-y-4">
          {mode !== "preview" && (
            <div className="clay p-5">
              {/* cover */}
              {form.coverImageUrl ? (
                <div className="relative mb-4 overflow-hidden rounded-2xl">
                  <img src={form.coverImageUrl} alt={form.coverImageAlt} className="h-44 w-full object-cover" />
                  <button type="button" onClick={() => { set("coverImageUrl", null); set("coverImageAlt", ""); }} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white hover:bg-black/80">Remove</button>
                </div>
              ) : (
                <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-secondary/40 py-6 text-center transition-colors hover:border-primary/50">
                  <span className="text-2xl">🖼️</span>
                  <span className="text-sm font-semibold text-foreground">{coverUploading ? "Uploading…" : "Add a cover image"}</span>
                  <span className="text-xs text-foreground/50">Optional, but posts with a cover get shared more</span>
                  <input type="file" accept="image/*" disabled={coverUploading} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = ""; }} />
                </label>
              )}
              {form.coverImageUrl && <input className={`${field} mb-4 py-2 text-xs`} placeholder="Describe the image (alt text, required)" value={form.coverImageAlt} onChange={(e) => set("coverImageAlt", e.target.value)} />}

              <textarea rows={1} value={form.title} onChange={(e) => { handleTitle(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }} placeholder="Post title" className="w-full resize-none bg-transparent font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground placeholder:text-foreground/25 focus:outline-none" />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                <span className="rounded-full bg-secondary px-2.5 py-1 font-mono">/blog/</span>
                <input value={form.slug} disabled={isLive} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} onBlur={handleSlugBlur} className="min-w-[10rem] flex-1 rounded-full border border-border bg-background px-3 py-1 font-mono text-xs focus:border-primary focus:outline-none disabled:opacity-50" />
                {isLive && <span className="text-foreground/40">🔒 locked after publishing</span>}
              </div>
              {slugWarning && <p className="mt-1 text-[11px] font-medium text-red-500">{slugWarning}</p>}

              <div className="mt-4">
                <div className="flex items-end justify-between"><label className={lbl}>Excerpt</label><span className={`mb-1.5 text-[11px] ${form.excerpt.length > 160 ? "text-amber-600" : form.excerpt.length >= 120 ? "text-green-700" : "text-foreground/40"}`}>{form.excerpt.length} · aim for 120–160</span></div>
                <textarea rows={2} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="One or two sentences shown on the blog index and in search and social previews. Write it by hand." className={`${field} resize-none`} />
              </div>
            </div>
          )}

          {mode === "write" && (
            <div className="clay p-5">
              <p className={lbl}>Body</p>
              <BlogImageInsertField value={form.bodyMarkdown} onChange={(v) => set("bodyMarkdown", v)} rows={22} placeholder="Write in markdown: ## heading, **bold**, - list, > quote, [link](url), ![](image), $x^2$ math, :::tip callouts…" className="w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:border-primary focus:outline-none" />
              <p className="mt-2 text-[11px] text-foreground/40">Tip: switch to <strong>Split</strong> (top right, on wide screens) to see the post update as you type.</p>
            </div>
          )}

          {mode === "split" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="clay p-5"><p className={lbl}>Body</p><BlogImageInsertField value={form.bodyMarkdown} onChange={(v) => set("bodyMarkdown", v)} rows={26} placeholder="Write in markdown…" className="w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:border-primary focus:outline-none" /></div>
              <div className="max-h-[80vh] overflow-y-auto"><PostPreview form={form} readMins={readMins} /></div>
            </div>
          )}

          {mode === "preview" && <PostPreview form={form} readMins={readMins} />}
        </div>

        {mode !== "split" && <div className="lg:sticky lg:top-20 lg:self-start">{sidePanel}</div>}
      </div>

      {mode === "split" && <div className="mt-5 max-w-xl">{sidePanel}</div>}
    </div>
  );
}
