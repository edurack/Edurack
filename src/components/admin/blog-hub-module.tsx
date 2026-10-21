// src/components/admin/blog-hub-module.tsx
//
// The "Blog" tab in admin.dashboard.tsx: a post library (cards, search, status
// tabs, bulk actions) and the full-screen editor in blog-editor.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconEye as Eye,
  IconCircleCheck as CheckCircle2,
  IconAlertCircle as AlertCircle,
  IconPhoto as ImageIcon,
  IconStar as Star,
  IconX as X,
  IconSearch as Search,
  IconCopy as Copy,
  IconExternalLink as ExternalLink,
  IconClock as Clock,
  IconChecklist as ListChecks,
} from "@tabler/icons-react";
import { listBlogPostsAdmin, softDeleteBlogPost, bulkUpdateBlogPosts } from "@/server-functions/blog-admin";
import type { BulkBlogAction } from "@/server-functions/blog-admin";
import { BlogPromoSettingsPanel } from "@/components/admin/blog-promo-settings";
import { BlogEditor, StatusPill } from "@/components/admin/blog-editor";
import { BlogImportDialog } from "@/components/admin/blog-import-dialog";
import { BLOG_STARTERS } from "@/lib/blog-starters";
import { BLOG_CATEGORIES, BLOG_CATEGORY_LABELS, MAX_FEATURED_POSTS } from "@/lib/blog-types";
import type { BlogPost, BlogPostInput, BlogCategory } from "@/lib/blog-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Mirrors assertPublishReady on the server. The server stays the authority;
// this just lets the bulk dialog warn before the click instead of after.
function missingForPublish(p: BlogPost): string[] {
  const m: string[] = [];
  if (!p.title?.trim()) m.push("title");
  if (!p.excerpt?.trim()) m.push("excerpt");
  if (p.coverImageUrl && !p.coverImageAlt?.trim()) m.push("cover alt text");
  if (!p.bodyMarkdown?.trim()) m.push("body");
  return m;
}

type StatusFilter = "all" | BlogPost["status"];
const STATUS_TABS: StatusFilter[] = ["all", "published", "draft", "scheduled", "archived"];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="clay-inset flex-1 min-w-[120px] rounded-2xl p-3.5" style={{ background: tone }}>
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
    </div>
  );
}

export function BlogHubModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [view, setView] = useState<"list" | "editor">("list");
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initial, setInitial] = useState<Partial<BlogPostInput> | undefined>(undefined);
  const [showPromo, setShowPromo] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<BlogCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "publish" | "feature">(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Fast multi-select (no tick-boxes needed): "select mode" makes the whole
  // row clickable/draggable, Shift+click picks a range, and the quick-select
  // panel picks by row number.
  const [selectMode, setSelectMode] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [firstN, setFirstN] = useState("");
  const anchorRef = useRef<number | null>(null);
  const dragRef = useRef<{ start: number; add: boolean; base: Set<string> } | null>(null);

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

  function openNew(starter?: Partial<BlogPostInput>) {
    setEditingId(null);
    setInitial(starter);
    setChooser(false);
    setView("editor");
  }

  function openEdit(id: string) {
    setEditingId(id);
    setInitial(undefined);
    setView("editor");
  }

  // A duplicate is just a new post pre-filled from an existing one: nothing is
  // saved until the admin saves it, and the slug is regenerated from the title.
  function duplicate(p: BlogPost) {
    openNew({
      title: `${p.title} (copy)`,
      excerpt: p.excerpt,
      category: p.category,
      tags: p.tags,
      examKey: p.examKey,
      track: p.track,
      coverImageUrl: p.coverImageUrl,
      coverImageAlt: p.coverImageAlt,
      bodyMarkdown: p.bodyMarkdown,
      author: p.author,
      documents: p.documents,
      seoTitleOverride: p.seoTitleOverride,
      seoDescriptionOverride: p.seoDescriptionOverride,
    });
  }

  function backToList() {
    setView("list");
    loadList();
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts?.length ?? 0, draft: 0, scheduled: 0, published: 0, archived: 0 };
    (posts ?? []).forEach((p) => (c[p.status] = (c[p.status] ?? 0) + 1));
    return c;
  }, [posts]);

  const visiblePosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter(
      (p) =>
        (statusFilter === "all" || p.status === statusFilter) &&
        (category === "all" || p.category === category) &&
        (!q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))),
    );
  }, [posts, statusFilter, category, query]);

  const selectedPosts = useMemo(() => (posts ?? []).filter((p) => selected.has(p.id)), [posts, selected]);
  const allVisibleSelected = visiblePosts.length > 0 && visiblePosts.every((p) => selected.has(p.id));
  const featuredCount = useMemo(() => (posts ?? []).filter((p) => p.pinned && p.status === "published").length, [posts]);
  const totalViews = useMemo(() => (posts ?? []).reduce((sum, p) => sum + (p.viewCount ?? 0), 0), [posts]);

  // Adds (or removes) every visible row between two indexes, inclusive.
  function applyRange(base: Set<string>, a: number, b: number, add: boolean) {
    const next = new Set(base);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = lo; i <= hi; i++) {
      const post = visiblePosts[i];
      if (!post) continue;
      if (add) next.add(post.id);
      else next.delete(post.id);
    }
    return next;
  }

  function toggleOne(id: string, index?: number, shift = false) {
    if (shift && index !== undefined && anchorRef.current !== null) {
      const from = anchorRef.current;
      setSelected((prev) => applyRange(prev, from, index, true));
      return;
    }
    if (index !== undefined) anchorRef.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Select mode: press on a row to toggle it, keep the button down and drag
  // over other rows to paint the same state onto all of them, or Shift+click
  // to take everything from the last clicked row.
  function handleRowPress(e: ReactMouseEvent, index: number, id: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-select]")) return;
    e.preventDefault();
    if (e.shiftKey && anchorRef.current !== null) {
      const from = anchorRef.current;
      setSelected((prev) => applyRange(prev, from, index, true));
      return;
    }
    const add = !selected.has(id);
    dragRef.current = { start: index, add, base: selected };
    anchorRef.current = index;
    setSelected(applyRange(selected, index, index, add));
  }

  function handleRowEnter(index: number) {
    const d = dragRef.current;
    if (!d) return;
    setSelected(applyRange(d.base, d.start, index, d.add));
  }

  function selectRowRange() {
    const a = parseInt(rangeFrom, 10);
    const b = parseInt(rangeTo, 10);
    if (!a || !b || visiblePosts.length === 0) return;
    const lo = Math.max(1, Math.min(a, b));
    const hi = Math.min(visiblePosts.length, Math.max(a, b));
    if (lo > hi) return;
    setSelected((prev) => applyRange(prev, lo - 1, hi - 1, true));
  }

  function selectFirstN() {
    const n = parseInt(firstN, 10);
    if (!n || n < 1 || visiblePosts.length === 0) return;
    setSelected((prev) => applyRange(prev, 0, Math.min(n, visiblePosts.length) - 1, true));
  }

  function invertVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visiblePosts.forEach((p) => (next.has(p.id) ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }

  // Drag ends wherever the mouse is released; Esc leaves select mode (then
  // clears the selection); Ctrl/Cmd+A selects everything visible in select mode.
  useEffect(() => {
    const stopDrag = () => {
      dragRef.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "Escape" && !dialog) {
        if (selectMode) setSelectMode(false);
        else if (selected.size > 0) setSelected(new Set());
      } else if (selectMode && !dialog && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected((prev) => {
          const next = new Set(prev);
          visiblePosts.forEach((p) => next.add(p.id));
          return next;
        });
      }
    };
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("keydown", onKey);
    };
  }, [selectMode, selected, dialog, visiblePosts]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visiblePosts.forEach((p) => next.delete(p.id));
      else visiblePosts.forEach((p) => next.add(p.id));
      return next;
    });
  }

  // Runs one bulk call, then summarises per-post failures so a partial
  // success ("6 of 8 published") is never silently reported as full success.
  async function runBulk(action: BulkBlogAction, ids: string[], featuredIds?: string[], skippedIds: string[] = []) {
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const token = await adminUser.getIdToken();
      const { results } = await bulkUpdateBlogPosts({ data: { token, action, ids, featuredIds } });
      const failed = results.filter((r) => !r.ok);
      const titleOf = (id: string) => posts?.find((p) => p.id === id)?.title || "(untitled)";
      const verb = { publish: "Published", draft: "Moved to draft", archive: "Archived", setFeatured: "Updated featured for" }[action];
      if (failed.length === 0) {
        const skippedNote = skippedIds.length > 0 ? ` ${skippedIds.length} not ready — still selected; fix them in the editor.` : "";
        setBulkMsg({ kind: "ok", text: `${verb} ${results.length} post${results.length === 1 ? "" : "s"}.${skippedNote}` });
        setSelected(new Set(skippedIds));
      } else {
        setBulkMsg({
          kind: "error",
          text: `${results.length - failed.length} done, ${failed.length} failed — ${failed.map((f) => `"${titleOf(f.id)}": ${f.error}`).join(" · ")}`,
        });
        // Leave only the failures selected so the admin can fix and retry.
        setSelected(new Set([...failed.map((f) => f.id), ...skippedIds]));
      }
      setDialog(null);
      await loadList();
    } catch (err) {
      setBulkMsg({ kind: "error", text: err instanceof Error ? err.message : "Bulk action failed." });
    } finally {
      setBulkBusy(false);
    }
  }

  async function trash(p: BlogPost) {
    if (!confirm(`Move "${p.title || "(untitled)"}" to trash? It won't be publicly reachable anymore.`)) return;
    try {
      const token = await adminUser.getIdToken();
      await softDeleteBlogPost({ data: { token, id: p.id } });
      setSelected((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      loadList();
    } catch (err) {
      setBulkMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't move to trash." });
    }
  }

  if (view === "editor") {
    return <BlogEditor adminUser={adminUser} postId={editingId} initial={initial} onBack={backToList} />;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Blog</h1>
          <p className="mt-1 text-sm text-foreground/60">Write, schedule and publish posts to edurack.in/blog.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPromo((v) => !v)}
            className={`rounded-full px-4 py-2.5 text-xs font-bold ${showPromo ? "bg-foreground text-background" : "clay-chip text-foreground/70"}`}
          >
            Free test popup
          </button>
          <button onClick={() => setImportOpen(true)} className="clay-chip flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-foreground/70">
            Import JSON
          </button>
          <button onClick={() => setChooser(true)} className="clay-btn flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold">
            <Plus className="h-4 w-4" />
            New post
          </button>
        </div>
      </div>

      {showPromo && <BlogPromoSettingsPanel adminUser={adminUser} />}

      {posts && posts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2.5">
          <Stat label="Published" value={counts.published} tone="#CDF0DD" />
          <Stat label="Drafts" value={counts.draft} tone="#E4E9F1" />
          <Stat label="Scheduled" value={counts.scheduled} tone="#F7ECC4" />
          <Stat label="Total views" value={totalViews.toLocaleString()} tone="#DCEAFB" />
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="mb-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="clay-inset flex min-w-[200px] flex-1 items-center gap-2 rounded-full px-3.5 py-2">
              <Search className="h-4 w-4 text-foreground/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, slug or tag"
                className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X className="h-3.5 w-3.5 text-foreground/40" />
                </button>
              )}
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BlogCategory | "all")}
              className="clay-chip rounded-full px-3 py-2 text-xs font-semibold text-foreground/70 outline-none"
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {BLOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {BLOG_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${statusFilter === f ? "bg-foreground text-background" : "clay-chip text-foreground/60"}`}
              >
                {f}
                <span className="ml-1.5 opacity-60">{counts[f] ?? 0}</span>
              </button>
            ))}
            <button
              onClick={() => setSelectMode((v) => !v)}
              className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${selectMode ? "bg-foreground text-background" : "clay-chip text-foreground/60"}`}
              title="Click or drag across posts to select them — no tick-boxes needed"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Select mode
            </button>
            <button
              onClick={() => setQuickOpen((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${quickOpen ? "bg-foreground text-background" : "clay-chip text-foreground/60"}`}
            >
              Quick select
            </button>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground/50">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible posts" />
              Select all
            </label>
            <span className="flex items-center gap-1 text-[11px] text-foreground/50">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
              {featuredCount} featured (index shows {MAX_FEATURED_POSTS})
            </span>
          </div>
          {selectMode && (
            <p className="text-[11px] font-medium text-foreground/50">
              Select mode: click a post to select it, hold the button and drag over posts to select many, Shift+click to select everything from the last clicked post, Ctrl/Cmd+A for all, Esc to exit.
            </p>
          )}
          {quickOpen && (
            <div className="clay-inset flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl p-3 text-[11px] font-semibold text-foreground/60">
              <div className="flex items-end gap-1.5">
                <label className="flex flex-col gap-1">
                  Rows from
                  <input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" className="w-16 rounded-lg bg-background/60 px-2 py-1 text-xs outline-none" />
                </label>
                <label className="flex flex-col gap-1">
                  to
                  <input value={rangeTo} onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(visiblePosts.length || 1)} className="w-16 rounded-lg bg-background/60 px-2 py-1 text-xs outline-none" />
                </label>
                <button onClick={selectRowRange} className="clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/70">
                  Select
                </button>
              </div>
              <div className="flex items-end gap-1.5">
                <label className="flex flex-col gap-1">
                  First
                  <input value={firstN} onChange={(e) => setFirstN(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="20" className="w-16 rounded-lg bg-background/60 px-2 py-1 text-xs outline-none" />
                </label>
                <button onClick={selectFirstN} className="clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/70">
                  Select
                </button>
              </div>
              <button onClick={invertVisible} className="clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/70">
                Invert
              </button>
              <button onClick={() => setSelected(new Set())} className="clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/70">
                Clear
              </button>
              <span className="text-foreground/40">Row numbers are shown on the left of each post and follow the current search/filters ({visiblePosts.length} shown).</span>
            </div>
          )}
        </div>
      )}

      {bulkMsg && (
        <div className={`clay mb-3 flex items-start gap-2 border p-3 text-xs font-medium ${bulkMsg.kind === "ok" ? "border-emerald-300/40 text-emerald-700" : "border-rose-300/40 text-rose-600"}`}>
          {bulkMsg.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{bulkMsg.text}</span>
          <button onClick={() => setBulkMsg(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="clay sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs font-bold text-foreground">{selected.size} selected</span>
          <button onClick={() => setDialog("publish")} disabled={bulkBusy} className="clay-btn rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-60">
            Publish…
          </button>
          <button onClick={() => setDialog("feature")} disabled={bulkBusy} className="clay-chip flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-foreground/70 disabled:opacity-60">
            <Star className="h-3.5 w-3.5" /> Set featured…
          </button>
          <button onClick={() => runBulk("draft", [...selected])} disabled={bulkBusy} className="clay-chip rounded-full px-3 py-1.5 text-xs font-bold text-foreground/70 disabled:opacity-60">
            Move to draft
          </button>
          <button onClick={() => runBulk("archive", [...selected])} disabled={bulkBusy} className="clay-chip rounded-full px-3 py-1.5 text-xs font-bold text-foreground/70 disabled:opacity-60">
            Archive
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-foreground/50 hover:underline">
            Clear
          </button>
        </div>
      )}

      <BlogImportDialog open={importOpen} onClose={() => setImportOpen(false)} adminUser={adminUser} onDone={loadList} />
      {dialog && (
        <BulkPublishDialog
          mode={dialog}
          selectedPosts={selectedPosts}
          allPosts={posts ?? []}
          busy={bulkBusy}
          onClose={() => setDialog(null)}
          onConfirm={(featuredIds) => {
            if (dialog === "feature") {
              // Un-published posts can't be featured yet; leave their flag alone.
              const ids = selectedPosts.filter((p) => p.status === "published").map((p) => p.id);
              return runBulk("setFeatured", ids, featuredIds);
            }
            // Publish: act only on posts that are already live or ready to go;
            // the rest are skipped (and stay selected) instead of failing.
            const ready = selectedPosts.filter((p) => p.status === "published" || missingForPublish(p).length === 0);
            const skipped = selectedPosts.filter((p) => !ready.includes(p)).map((p) => p.id);
            return runBulk("publish", ready.map((p) => p.id), featuredIds, skipped);
          }}
        />
      )}

      <Dialog open={chooser} onOpenChange={setChooser}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Start a new post</DialogTitle>
            <DialogDescription>Pick a starting point. Everything is editable, and you can switch category any time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {BLOG_STARTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => openNew(s.form)}
                className="clay flex items-start gap-3 p-4 text-left transition hover:-translate-y-0.5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: s.tint }}>
                  {s.emoji}
                </span>
                <span>
                  <span className="block text-sm font-bold text-foreground">{s.title}</span>
                  <span className="block text-xs text-foreground/60">{s.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {listStatus === "loading" && !posts ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : listStatus === "error" ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">
          Couldn't load posts.{" "}
          <button onClick={loadList} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="clay p-10 text-center">
          <p className="text-3xl">✍️</p>
          <p className="mt-2 text-sm font-semibold text-foreground">No posts yet</p>
          <p className="mt-1 text-xs text-foreground/60">Pick a starter and write your first one.</p>
          <button onClick={() => setChooser(true)} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-xs font-bold">
            New post
          </button>
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">No posts match these filters.</div>
      ) : (
        <ul className="space-y-2.5">
          {visiblePosts.map((p, index) => (
            <li
              key={p.id}
              onMouseDown={selectMode ? (e) => handleRowPress(e, index, p.id) : undefined}
              onMouseEnter={selectMode ? () => handleRowEnter(index) : undefined}
              className={`clay flex items-stretch gap-3 p-3 ${selected.has(p.id) ? "ring-2 ring-foreground/30" : ""} ${selectMode ? "cursor-pointer select-none" : ""}`}
            >
              <div className="flex shrink-0 flex-col items-center gap-1 self-start">
                <input
                  type="checkbox"
                  className={`mt-1 ${selectMode ? "pointer-events-none" : ""}`}
                  checked={selected.has(p.id)}
                  onChange={(e) => toggleOne(p.id, index, (e.nativeEvent as MouseEvent).shiftKey === true)}
                  aria-label={`Select ${p.title || "untitled post"}`}
                />
                <span className="text-[10px] font-bold tabular-nums text-foreground/35">{index + 1}</span>
              </div>
              <button onClick={() => (selectMode ? undefined : openEdit(p.id))} className="hidden h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-foreground/5 sm:block" aria-label="Edit post">
                {p.coverImageUrl ? (
                  <img src={p.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-foreground/25">
                    <ImageIcon className="h-6 w-6" />
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={p.status} />
                  {p.pinned && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <Star className="h-3 w-3 fill-current" />
                      Featured
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-foreground/50">{BLOG_CATEGORY_LABELS[p.category]}</span>
                </div>
                <button onClick={() => (selectMode ? undefined : openEdit(p.id))} className="mt-1 block max-w-full truncate text-left text-sm font-bold text-foreground hover:underline">
                  {p.title || "(untitled)"}
                </button>
                <p className="truncate text-[11px] text-foreground/40">/blog/{p.slug}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/50">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {(p.viewCount ?? 0).toLocaleString()}
                  </span>
                  {p.status === "scheduled" && p.publishAt ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Clock className="h-3.5 w-3.5" />
                      Goes live {new Date(p.publishAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                  ) : (
                    <span>Updated {fmtDate(p.updatedAt ?? p.createdAt)}</span>
                  )}
                  {p.readingTimeMinutes > 0 && <span>{p.readingTimeMinutes} min read</span>}
                </p>
              </div>
              <div data-no-select className="flex shrink-0 items-start gap-2.5 text-foreground/40">
                {p.status === "published" && (
                  <button
                    onClick={() => runBulk("setFeatured", [p.id], p.pinned ? [] : [p.id])}
                    disabled={bulkBusy}
                    title={p.pinned ? "Remove from featured" : "Feature on blog index"}
                    className="hover:text-amber-500 disabled:opacity-50"
                  >
                    <Star className={`h-4 w-4 ${p.pinned ? "fill-amber-400 text-amber-500" : ""}`} />
                  </button>
                )}
                {p.status === "published" && (
                  <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" title="View live" className="hover:text-foreground/70">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button onClick={() => duplicate(p)} title="Duplicate as new post" className="hover:text-foreground/70">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={() => trash(p)} title="Move to trash" className="hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Bulk publish / feature dialog ────────────────────────────────────────
// Opened from the list's action bar. Lists exactly the selected posts and,
// per post, asks whether it should be featured on the public blog index —
// so publishing a batch and choosing what's featured is one step.
//   mode "publish": publishes the not-yet-published, publish-ready posts;
//                   posts that aren't ready are shown with what's missing
//                   and are skipped.
//   mode "feature": only edits the featured flag.
function BulkPublishDialog({
  mode,
  selectedPosts,
  allPosts,
  busy,
  onClose,
  onConfirm,
}: {
  mode: "publish" | "feature";
  selectedPosts: BlogPost[];
  allPosts: BlogPost[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (featuredIds: string[]) => void;
}) {
  const rows = selectedPosts.map((p) => {
    const missing = p.status === "published" ? [] : missingForPublish(p);
    return { p, missing, willPublish: mode === "publish" && p.status !== "published" && missing.length === 0 };
  });
  // A post that can't be published right now can't be featured by this
  // dialog (it wouldn't show on the index anyway).
  const canFeature = (r: (typeof rows)[number]) => r.p.status === "published" || r.willPublish;

  const [featuredPick, setFeaturedPick] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.p.pinned && canFeature(r)).map((r) => r.p.id)),
  );

  const publishCount = rows.filter((r) => r.willPublish).length;
  const skipped = rows.filter((r) => mode === "publish" && r.p.status !== "published" && r.missing.length > 0).length;

  // Total that would be featured on the index after this action: featured
  // posts outside the selection that are live, plus what's ticked here.
  const selectedIds = new Set(selectedPosts.map((p) => p.id));
  const featuredOutside = allPosts.filter((p) => !selectedIds.has(p.id) && p.pinned && p.status === "published").length;
  const featuredAfter = featuredOutside + featuredPick.size;

  function toggle(id: string) {
    setFeaturedPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const featuredChanged = rows.some((r) => canFeature(r) && Boolean(r.p.pinned) !== featuredPick.has(r.p.id));
  const nothingToDo = publishCount === 0 && !featuredChanged;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="clay flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden bg-background">
        <div className="flex items-start justify-between border-b border-foreground/10 p-5">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              {mode === "publish" ? `Publish ${publishCount} post${publishCount === 1 ? "" : "s"}` : "Choose featured posts"}
            </h2>
            <p className="mt-1 text-xs text-foreground/60">
              {mode === "publish"
                ? "Tick the posts you also want featured at the top of the blog index."
                : "Ticked posts are featured at the top of the blog index. Unticked selected posts are un-featured."}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-foreground/40 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="flex-1 divide-y divide-foreground/5 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.p.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.p.title || "(untitled)"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusPill status={r.p.status} />
                  {mode === "publish" && r.p.status !== "published" && r.missing.length > 0 && (
                    <span className="text-[11px] font-medium text-rose-600">Will be skipped — missing {r.missing.join(", ")}</span>
                  )}
                  {r.willPublish && <span className="text-[11px] font-medium text-emerald-700">Ready to publish</span>}
                </div>
              </div>
              <label className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${canFeature(r) ? "text-foreground/70" : "text-foreground/30"}`}>
                <input
                  type="checkbox"
                  disabled={!canFeature(r)}
                  checked={featuredPick.has(r.p.id)}
                  onChange={() => toggle(r.p.id)}
                />
                <Star className="h-3.5 w-3.5" /> Featured
              </label>
            </li>
          ))}
        </ul>

        <div className="border-t border-foreground/10 p-5">
          {featuredAfter > MAX_FEATURED_POSTS && (
            <p className="mb-3 flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {featuredAfter} posts would be featured, but the index only shows the newest {MAX_FEATURED_POSTS}. Untick some to choose which ones appear.
            </p>
          )}
          {mode === "publish" && skipped > 0 && (
            <p className="mb-3 text-xs text-foreground/60">
              {skipped} post{skipped === 1 ? "" : "s"} can't be published yet and will be left as they are — fix them in the editor, then publish again.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-xs font-semibold text-foreground/60 hover:underline">
              Cancel
            </button>
            <button
              onClick={() => onConfirm([...featuredPick])}
              disabled={busy || nothingToDo}
              className="clay-btn flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "publish" ? (publishCount > 0 ? `Publish ${publishCount}` : "Save featured") : "Save featured"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
