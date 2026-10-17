// src/components/admin/blog-documents-panel.tsx
//
// "Downloadable documents" card in the blog post editor. An admin either
// uploads a file (straight to the private blog-documents bucket) or pastes the
// link of a file that's already in Supabase. Either way only the storage
// location is kept — the permanent link is never shown to students; they get a
// short-lived one after logging in. Changes are saved with the post's Save button.
import { useEffect, useState } from "react";
import {
  IconFileText as FileText,
  IconLink as LinkIcon,
  IconLoader2 as Loader2,
  IconTrash as Trash2,
  IconUpload as Upload,
  IconLock as Lock,
} from "@tabler/icons-react";
import { MAX_BLOG_DOCUMENTS, type BlogDocument } from "@/lib/blog-types";
import { documentFromExistingUrl, uploadBlogDocument } from "@/lib/blog-document-upload";
import { formatFileSize } from "@/lib/blog-document-format";
import { getBlogDownloadStats, type DocDownloadStat, type DownloadRow } from "@/server-functions/blog-download-stats";

export function BlogDocumentsPanel({
  documents,
  onChange,
  postId,
  adminUser,
}: {
  documents: BlogDocument[];
  onChange: (docs: BlogDocument[]) => void;
  postId?: string | null;
  adminUser?: { getIdToken: () => Promise<string> };
}) {
  const [stats, setStats] = useState<{ docs: DocDownloadStat[]; recent: DownloadRow[] } | null>(null);
  const [showWho, setShowWho] = useState(false);
  useEffect(() => {
    if (!postId || !adminUser) return;
    let off = false;
    adminUser.getIdToken().then((token) => getBlogDownloadStats({ data: { token, postId } })).then((r) => { if (!off) setStats(r); }).catch(() => {});
    return () => { off = true; };
  }, [postId, adminUser]);
  const statFor = (id: string) => stats?.docs.find((x) => x.documentId === id);
  const totalDownloads = stats?.docs.reduce((n, d) => n + d.total, 0) ?? 0;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const full = documents.length >= MAX_BLOG_DOCUMENTS;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const added: BlogDocument[] = [];
      for (const f of Array.from(files)) {
        if (documents.length + added.length >= MAX_BLOG_DOCUMENTS) break;
        added.push(await uploadBlogDocument(f));
      }
      onChange([...documents, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleAddLink() {
    setError(null);
    try {
      onChange([...documents, documentFromExistingUrl(linkInput)]);
      setLinkInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that link.");
    }
  }

  function update(id: string, patch: Partial<BlogDocument>) {
    onChange(documents.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  return (
    <div className="clay space-y-3 p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Downloadable documents</p>
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/50">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Students must be logged in to download. If they aren't, they're sent to log in and brought straight back to this post to get the file.
        </p>
      </div>

      {documents.map((d) => (
        <div key={d.id} className="clay-inset space-y-2 rounded-2xl p-3">
          <div className="flex items-start gap-2">
            <FileText className="mt-1 h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <input
                value={d.title}
                onChange={(e) => update(d.id, { title: e.target.value })}
                placeholder="Title students see"
                maxLength={120}
                className="w-full rounded-lg bg-transparent px-1 py-0.5 text-sm font-semibold focus:bg-foreground/5 focus:outline-none"
              />
              <p className="truncate px-1 text-[10px] text-foreground/40">
                {d.fileName}
                {d.sizeBytes ? ` · ${formatFileSize(d.sizeBytes)}` : ""}
                {d.bucket ? ` · ${d.bucket}` : " · external link"}
              </p>
              {postId && stats && (
                <p className="px-1 pt-0.5 text-[11px] font-semibold text-foreground/60">
                  {(statFor(d.id)?.total ?? 0).toLocaleString()} downloads · {(statFor(d.id)?.unique ?? 0).toLocaleString()} students
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(documents.filter((x) => x.id !== d.id))}
              aria-label={`Remove ${d.title}`}
              className="rounded-lg p-1.5 text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <input
            value={d.description}
            onChange={(e) => update(d.id, { description: e.target.value })}
            placeholder="One line on what's inside (optional)"
            maxLength={300}
            className="w-full rounded-lg bg-transparent px-1 py-0.5 text-xs text-foreground/70 focus:bg-foreground/5 focus:outline-none"
          />
        </div>
      ))}

      {postId && stats && totalDownloads > 0 && (
        <div className="clay-inset rounded-2xl p-3">
          <button type="button" onClick={() => setShowWho((v) => !v)} className="flex w-full items-center justify-between text-xs font-semibold text-foreground/70">
            <span>Who downloaded ({totalDownloads.toLocaleString()} total)</span>
            <span>{showWho ? "Hide" : "Show"}</span>
          </button>
          {showWho && (
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-[11px]">
              {stats.recent.map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{r.name}</span>
                    {r.email ? <span className="text-foreground/50"> · {r.email}</span> : null}
                    <span className="block truncate text-foreground/45">{r.title}</span>
                  </span>
                  <span className="shrink-0 text-foreground/45">{new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!full && (
        <>
          <label className={`clay-chip flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold text-foreground/70 ${uploading ? "opacity-60" : ""}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload PDF / document"}
            <input
              type="file"
              multiple
              disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>

          <div className="flex gap-2">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="…or paste a Supabase file link"
              className="clay-inset min-w-0 flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!linkInput.trim()}
              className="clay-chip flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-foreground/70 disabled:opacity-40"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </>
      )}
      {full && <p className="text-[11px] text-foreground/50">Maximum of {MAX_BLOG_DOCUMENTS} documents per post.</p>}
      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
      {documents.length > 0 && <p className="text-[11px] text-foreground/40">Click “Save draft” to apply changes to this post.</p>}
    </div>
  );
}
