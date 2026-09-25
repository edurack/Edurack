// src/components/admin/blog-hub-module.tsx
//
// The "Blog" tab in admin.dashboard.tsx — list of posts + an editor view,
// same two-view shape as the other content-authoring admin modules. Own
// file per project convention; wired into admin.dashboard.tsx's
// ModuleRouter the same way PromoterHubModule / MentorHubModule are.
import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconEye as Eye,
  IconClock as Clock,
  IconArchive as Archive,
  IconArrowLeft as ArrowLeft,
  IconCircleCheck as CheckCircle2,
  IconAlertCircle as AlertCircle,
  IconPhoto as ImageIcon,
  IconRestore as Restore,
} from "@tabler/icons-react";
import {
  createBlogPost,
  updateBlogPost,
  listBlogPostsAdmin,
  getBlogPostAdmin,
  publishBlogPost,
  scheduleBlogPost,
  revertBlogPostToDraft,
  archiveBlogPost,
  softDeleteBlogPost,
  restoreBlogPost,
  suggestBlogSlug,
  checkBlogSlugAvailable,
} from "@/server-functions/blog-admin";
import { uploadBlogImage } from "@/lib/blog-image-upload";
import { BlogImageInsertField } from "@/components/admin/blog-image-insert-field";
import { BlogBody } from "@/lib/blog-content";
import { BLOG_CATEGORIES, BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { BlogPost, BlogPostInput, BlogCategory } from "@/lib/blog-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import type { ExamKey, Track } from "@/lib/admin-types";

const TRACKS: Track[] = ["11th", "12th", "Dropper", "All"];

const EMPTY_FORM: BlogPostInput = {
  title: "",
  slug: "",
  excerpt: "",
  category: "platformUpdates",
  tags: [],
  examKey: null,
  track: null,
  coverImageUrl: null,
  coverImageAlt: "",
  bodyMarkdown: "",
  author: { name: "Edurack Team", photoUrl: null, bio: null, mentorId: null },
  pinned: false,
  relatedBundleId: null,
  relatedBatchId: null,
  seoTitleOverride: null,
  seoDescriptionOverride: null,
  substantiveUpdate: false,
};

function statusPill(status: BlogPost["status"]) {
  const styles: Record<BlogPost["status"], string> = {
    draft: "bg-foreground/10 text-foreground/60",
    scheduled: "bg-amber-400/20 text-amber-700",
    published: "bg-[var(--mint-soft)] text-foreground",
    archived: "bg-foreground/10 text-foreground/40",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>{status}</span>;
}

export function BlogHubModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [view, setView] = useState<"list" | "editor">("list");
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadList() {
    setListStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { posts: rows } = await listBlogPostsAdmin({ data: { token } });
      setPosts(rows);
      setListStatus("ready");
    } catch {
      setListStatus("error");
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditingId(null);
    setView("editor");
  }

  function openEdit(id: string) {
    setEditingId(id);
    setView("editor");
  }

  function backToList() {
    setView("list");
    loadList();
  }

  if (view === "editor") {
    return <BlogEditor adminUser={adminUser} postId={editingId} onBack={backToList} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Blog</h1>
          <p className="mt-1 text-sm text-foreground/60">Write, schedule, and publish posts to edurack.in/blog.</p>
        </div>
        <button onClick={openNew} className="clay-btn flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold">
          <Plus className="h-4 w-4" />
          New post
        </button>
      </div>

      {listStatus === "loading" ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : listStatus === "error" ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">Couldn't load posts.</div>
      ) : !posts || posts.length === 0 ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">No posts yet — write your first one.</div>
      ) : (
        <div className="clay overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-[11px] uppercase tracking-wide text-foreground/40">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-foreground/5 last:border-0 hover:bg-foreground/5">
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(p.id)} className="text-left font-semibold text-foreground hover:underline">
                      {p.title || "(untitled)"}
                    </button>
                    <p className="text-[11px] text-foreground/40">/blog/{p.slug}</p>
                  </td>
                  <td className="px-4 py-3">{statusPill(p.status)}</td>
                  <td className="px-4 py-3 text-foreground/60">{BLOG_CATEGORY_LABELS[p.category]}</td>
                  <td className="px-4 py-3 text-foreground/40">
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "published" && (
                      <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="mr-2 inline-flex text-foreground/40 hover:text-foreground/70">
                        <Eye className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`Move "${p.title}" to trash? It won't be publicly reachable anymore.`)) return;
                        const token = await adminUser.getIdToken();
                        await softDeleteBlogPost({ data: { token, id: p.id } });
                        loadList();
                      }}
                      className="text-foreground/40 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────────

function BlogEditor({
  adminUser,
  postId,
  onBack,
}: {
  adminUser: { getIdToken: () => Promise<string> };
  postId: string | null;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(Boolean(postId));
  const [id, setId] = useState<string | null>(postId);
  const [status, setStatus] = useState<BlogPost["status"]>("draft");
  const [form, setForm] = useState<BlogPostInput>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(Boolean(postId));
  const [slugWarning, setSlugWarning] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!postId) return;
    (async () => {
      try {
        const token = await adminUser.getIdToken();
        const { post } = await getBlogPostAdmin({ data: { token, id: postId } });
        setForm({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          category: post.category,
          tags: post.tags,
          examKey: post.examKey,
          track: post.track,
          coverImageUrl: post.coverImageUrl,
          coverImageAlt: post.coverImageAlt,
          bodyMarkdown: post.bodyMarkdown,
          author: post.author,
          pinned: post.pinned,
          relatedBundleId: post.relatedBundleId,
          relatedBatchId: post.relatedBatchId,
          seoTitleOverride: post.seoTitleOverride,
          seoDescriptionOverride: post.seoDescriptionOverride,
          substantiveUpdate: false,
        });
        setTagsInput(post.tags.join(", "));
        setStatus(post.status);
      } catch {
        setError("Couldn't load this post.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const isPublishedOrPast = status === "published" || status === "archived";

  function set<K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleTitleChange(title: string) {
    set("title", title);
    if (!slugTouched && !isPublishedOrPast) {
      try {
        const token = await adminUser.getIdToken();
        const { slug } = await suggestBlogSlug({ data: { token, title } });
        set("slug", slug);
      } catch {
        // Slug suggestion is a convenience, not a requirement — the
        // server re-derives/validates a slug from the title on save
        // regardless, so a failed suggestion here is a non-event.
      }
    }
  }

  async function handleSlugBlur() {
    if (!form.slug || isPublishedOrPast) return;
    try {
      const token = await adminUser.getIdToken();
      const { available } = await checkBlogSlugAvailable({ data: { token, slug: form.slug, excludeId: id ?? undefined } });
      setSlugWarning(available ? null : "That slug is already taken.");
    } catch {
      setSlugWarning(null);
    }
  }

  async function handleCoverUpload(file: File) {
    setCoverUploading(true);
    setError(null);
    try {
      const url = await uploadBlogImage(file);
      set("coverImageUrl", url);
    } catch {
      setError("Cover image upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  function currentInput(): BlogPostInput {
    return { ...form, tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean) };
  }

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    setError(null);
    try {
      const token = await adminUser.getIdToken();
      const input = currentInput();
      if (id) {
        await updateBlogPost({ data: { token, id, post: input } });
        setNotice("Draft saved.");
        return id;
      } else {
        const { id: newId } = await createBlogPost({ data: { token, post: input } });
        setId(newId);
        setNotice("Draft saved.");
        return newId;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      return null;
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 2500);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const savedId = await saveDraft();
      if (!savedId) return;
      const token = await adminUser.getIdToken();
      await publishBlogPost({ data: { token, id: savedId } });
      setStatus("published");
      setNotice("Published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish — check the checklist below.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleSchedule() {
    if (!scheduleAt) return;
    setPublishing(true);
    setError(null);
    try {
      const savedId = await saveDraft();
      if (!savedId) return;
      const token = await adminUser.getIdToken();
      await scheduleBlogPost({ data: { token, id: savedId, publishAt: new Date(scheduleAt).toISOString() } });
      setStatus("scheduled");
      setNotice(`Scheduled for ${new Date(scheduleAt).toLocaleString()}.`);
      setShowSchedule(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't schedule.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!id) return;
    const token = await adminUser.getIdToken();
    await revertBlogPostToDraft({ data: { token, id } });
    setStatus("draft");
  }

  async function handleArchive() {
    if (!id) return;
    const token = await adminUser.getIdToken();
    await archiveBlogPost({ data: { token, id } });
    setStatus("archived");
  }

  async function handleRestore() {
    if (!id) return;
    const token = await adminUser.getIdToken();
    await restoreBlogPost({ data: { token, id } });
    setStatus("draft");
  }

  const checklist = useMemo(() => {
    const items: string[] = [];
    if (!form.title.trim()) items.push("Title");
    if (!form.excerpt.trim()) items.push("Excerpt");
    if (!form.coverImageUrl) items.push("Cover image");
    if (!form.coverImageAlt.trim()) items.push("Cover image alt text");
    if (!form.bodyMarkdown.trim()) items.push("Body");
    return items;
  }, [form]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to posts
        </button>
        <div className="flex items-center gap-2">
          {notice && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {notice}
            </span>
          )}
          {statusPill(status)}
        </div>
      </div>

      {error && (
        <div className="clay mb-4 flex items-center gap-2 border border-rose-300/40 p-3 text-xs font-medium text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="clay p-5">
            <input
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Post title"
              className="clay-inset w-full rounded-2xl px-4 py-3 text-base font-semibold focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-foreground/50">
              <span>/blog/</span>
              <input
                value={form.slug}
                disabled={isPublishedOrPast}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                onBlur={handleSlugBlur}
                className="clay-inset flex-1 rounded-xl px-3 py-1.5 font-mono text-xs focus:outline-none disabled:opacity-50"
              />
            </div>
            {slugWarning && <p className="mt-1 text-[11px] font-medium text-rose-500">{slugWarning}</p>}
            {isPublishedOrPast && <p className="mt-1 text-[11px] text-foreground/40">Slug is locked once a post has been published.</p>}

            <textarea
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              placeholder="Excerpt — one or two sentences shown on the blog index and in search/social previews. Write this by hand, don't rely on a truncated body."
              rows={3}
              className="clay-inset mt-3 w-full resize-none rounded-2xl px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          <div className="clay p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Body</p>
              <button onClick={() => setPreview((v) => !v)} className="clay-chip rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60">
                {preview ? "Edit" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div className="clay-inset min-h-[300px] rounded-2xl px-4 py-4">
                <BlogBody markdown={form.bodyMarkdown} />
              </div>
            ) : (
              <BlogImageInsertField
                value={form.bodyMarkdown}
                onChange={(v) => set("bodyMarkdown", v)}
                placeholder="Write in markdown — # heading, **bold**, - list item, > quote, [link](url), ![](image url)…"
                className="clay-inset w-full resize-y rounded-2xl px-4 py-3 text-sm leading-relaxed focus:outline-none"
              />
            )}
          </div>

          <div className="clay p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">SEO overrides (optional)</p>
            <input
              value={form.seoTitleOverride ?? ""}
              onChange={(e) => set("seoTitleOverride", e.target.value || null)}
              placeholder={`Search/share title — defaults to "${form.title || "post title"}"`}
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
            />
            <textarea
              value={form.seoDescriptionOverride ?? ""}
              onChange={(e) => set("seoDescriptionOverride", e.target.value || null)}
              placeholder="Search/share description — defaults to the excerpt above"
              rows={2}
              className="clay-inset mt-2 w-full resize-none rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="clay p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">Cover image</p>
            {form.coverImageUrl ? (
              <img src={form.coverImageUrl} alt="" className="mb-2 h-32 w-full rounded-xl object-cover" />
            ) : (
              <div className="mb-2 flex h-32 w-full items-center justify-center rounded-xl bg-foreground/5 text-foreground/30">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={coverUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoverUpload(file);
                e.target.value = "";
              }}
              className="text-xs text-foreground/70"
            />
            <input
              value={form.coverImageAlt}
              onChange={(e) => set("coverImageAlt", e.target.value)}
              placeholder="Alt text (required to publish)"
              className="clay-inset mt-2 w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <div className="clay space-y-3 p-5">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Category</p>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value as BlogCategory)}
                className="clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {BLOG_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Exam (optional)</p>
              <select
                value={form.examKey ?? ""}
                onChange={(e) => set("examKey", (e.target.value || null) as ExamKey | null)}
                className="clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Not exam-specific</option>
                {EXAM_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {EXAM_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Track (optional)</p>
              <select
                value={form.track ?? ""}
                onChange={(e) => set("track", (e.target.value || null) as Track | null)}
                className="clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Any</option>
                {TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Tags</p>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="comma, separated, tags"
                className="clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground/70">
              <input type="checkbox" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              Pin to top of blog index
            </label>
          </div>

          <div className="clay space-y-3 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Byline</p>
            <input
              value={form.author.name}
              onChange={(e) => set("author", { ...form.author, name: e.target.value })}
              placeholder="Author name"
              className="clay-inset w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
            <textarea
              value={form.author.bio ?? ""}
              onChange={(e) => set("author", { ...form.author, bio: e.target.value || null })}
              placeholder="Short bio (optional)"
              rows={2}
              className="clay-inset w-full resize-none rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div className="clay space-y-3 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Related CTA (optional)</p>
            <input
              value={form.relatedBundleId ?? ""}
              onChange={(e) => set("relatedBundleId", e.target.value || null)}
              placeholder="Related bundle ID"
              className="clay-inset w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
            />
            <input
              value={form.relatedBatchId ?? ""}
              onChange={(e) => set("relatedBatchId", e.target.value || null)}
              placeholder="Related mentorship batch ID"
              className="clay-inset w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
            />
          </div>

          {status !== "draft" && (
            <label className="clay flex items-start gap-2 p-4 text-xs font-medium text-foreground/70">
              <input type="checkbox" checked={form.substantiveUpdate} onChange={(e) => set("substantiveUpdate", e.target.checked)} className="mt-0.5" />
              This edit is substantive — show an "Updated" badge to readers
            </label>
          )}

          {checklist.length > 0 && (
            <div className="clay border border-amber-300/40 p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Needed to publish
              </p>
              <ul className="space-y-0.5 text-xs text-foreground/60">
                {checklist.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="clay space-y-2 p-5">
            <button
              onClick={saveDraft}
              disabled={saving}
              className="clay-chip flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-foreground/70 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save draft
            </button>

            {status === "draft" || status === "scheduled" ? (
              <>
                <button
                  onClick={handlePublish}
                  disabled={publishing || checklist.length > 0}
                  className="clay-btn flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Publish now
                </button>
                <button
                  onClick={() => setShowSchedule((v) => !v)}
                  disabled={checklist.length > 0}
                  className="clay-chip flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-foreground/70 disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  {status === "scheduled" ? "Reschedule" : "Schedule…"}
                </button>
                {showSchedule && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="clay-inset flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                    <button onClick={handleSchedule} disabled={!scheduleAt || publishing} className="clay-btn rounded-full px-3 py-2 text-xs font-bold disabled:opacity-50">
                      Set
                    </button>
                  </div>
                )}
              </>
            ) : null}

            {status === "published" && (
              <button onClick={handleUnpublish} className="clay-chip flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-foreground/70">
                Unpublish to draft
              </button>
            )}

            {status !== "archived" && id && (
              <button onClick={handleArchive} className="flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-foreground/40 hover:text-foreground/70">
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            )}
            {status === "archived" && (
              <button onClick={handleRestore} className="flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-foreground/40 hover:text-foreground/70">
                <Restore className="h-3.5 w-3.5" />
                Restore to draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
