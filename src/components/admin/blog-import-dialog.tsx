// "Import JSON" — paste or upload an array of posts; preview, then create them as drafts.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { importBlogPosts, type BlogImportResult } from "@/server-functions/blog-import";

export function BlogImportDialog({ open, onClose, adminUser, onDone }: {
  open: boolean; onClose: () => void; adminUser: { getIdToken: () => Promise<string> }; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BlogImportResult[] | null>(null);
  const [done, setDone] = useState(false);

  function parse(): unknown[] {
    let v: unknown;
    try { v = JSON.parse(text); } catch { throw new Error("That isn't valid JSON."); }
    const arr = Array.isArray(v) ? v : Array.isArray((v as { posts?: unknown[] })?.posts) ? (v as { posts: unknown[] }).posts : null;
    if (!arr) throw new Error("Expected a JSON array of posts (or { \"posts\": [...] }).");
    return arr;
  }
  async function run(dryRun: boolean) {
    setError(null); setBusy(true);
    try {
      const posts = parse();
      const { results } = await importBlogPosts({ data: { token: await adminUser.getIdToken(), posts, dryRun } });
      setPreview(results);
      if (!dryRun) { setDone(true); onDone(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  }
  function reset() { setText(""); setPreview(null); setDone(false); setError(null); }
  const created = preview?.filter((r) => r.status === "created").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import posts from JSON</DialogTitle>
          <DialogDescription>Posts are created as drafts. Nothing goes public until you publish or schedule them.</DialogDescription>
        </DialogHeader>
        {!done && (
          <>
            <label className="clay-chip flex cursor-pointer items-center justify-center rounded-2xl px-4 py-2.5 text-xs font-semibold text-foreground/70">
              Choose a .json file
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setPreview(null); } e.target.value = ""; }} />
            </label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} rows={8} placeholder="…or paste the JSON array here" className="clay-inset w-full rounded-xl p-3 font-mono text-[11px] focus:outline-none" />
          </>
        )}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {preview && (
          <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
            {preview.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate">{r.title}</span>
                <span className={`shrink-0 font-semibold ${r.status === "created" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-rose-600"}`}>
                  {r.status === "created" ? (done ? "created" : "will create") : `${r.status}${r.reason ? ` · ${r.reason}` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          {done ? (
            <button onClick={() => { onClose(); reset(); }} className="clay-btn rounded-full px-5 py-2 text-xs font-bold">Done — {created} draft{created === 1 ? "" : "s"} added</button>
          ) : !preview ? (
            <button disabled={busy || !text.trim()} onClick={() => run(true)} className="clay-btn rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50">{busy ? "Checking…" : "Preview"}</button>
          ) : (
            <button disabled={busy || created === 0} onClick={() => run(false)} className="clay-btn rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50">{busy ? "Importing…" : `Import ${created} as drafts`}</button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
