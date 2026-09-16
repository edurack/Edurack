import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconTrash as Trash2, IconPlus as Plus } from "@tabler/icons-react";
import {
  listSessionTemplatesAdmin,
  createSessionTemplate,
  setSessionTemplateEnabled,
  deleteSessionTemplate,
} from "@/server-functions/session-templates-admin";
import type { SessionTemplate } from "@/lib/session-types";

// Reuses the shared uploader from lib/supabase.ts (same one Manage
// Bundles / mentor portal uploads already use). Needs one new bucket —
// add to that file:
//   export const SESSION_TEMPLATES_BUCKET = "session-templates";
//   export const MAX_SESSION_TEMPLATE_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
// and create the "session-templates" bucket in Supabase Storage (Public),
// plus an insert policy matching the existing bucket pattern:
//   create policy "Admins can upload to session-templates"
//   on storage.objects for insert to anon
//   with check (bucket_id = 'session-templates');
import { uploadToSupabase, SESSION_TEMPLATES_BUCKET } from "@/lib/supabase";

export function SessionTemplatesAdminModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [templates, setTemplates] = useState<SessionTemplate[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { templates: rows } = await listSessionTemplatesAdmin({ data: { token } });
      setTemplates(rows as SessionTemplate[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const token = await adminUser.getIdToken();
      const thumbnailUrl = await uploadToSupabase(SESSION_TEMPLATES_BUCKET, file);
      await createSessionTemplate({ data: { token, title: title.trim(), description: description.trim(), thumbnailUrl } });
      setTitle("");
      setDescription("");
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Session Templates</h1>
        <p className="mt-1 text-sm text-foreground/60">Thumbnail templates mentors can pick from when publishing a session offering.</p>
      </div>

      <div className="clay mb-6 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">Add a template</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. 'Chalkboard blue')" className="clay-inset rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="clay-inset rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
        </div>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-3 text-sm text-foreground/70" />
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <button
          onClick={handleUpload}
          disabled={uploading || !file || !title.trim()}
          className="clay-btn mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add template
        </button>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : status === "error" ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">Couldn't load templates.</div>
      ) : !templates || templates.length === 0 ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">No templates yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {templates.map((t) => (
            <div key={t.id} className="clay overflow-hidden p-2">
              <img src={t.thumbnailUrl} alt={t.title} className="h-24 w-full rounded-xl object-cover" />
              <div className="p-2">
                <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    onClick={async () => {
                      const token = await adminUser.getIdToken();
                      await setSessionTemplateEnabled({ data: { token, templateId: t.id, enabled: !t.enabled } });
                      load();
                    }}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${t.enabled ? "bg-[var(--mint-soft)] text-foreground" : "bg-foreground/10 text-foreground/50"}`}
                  >
                    {t.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${t.title}"?`)) return;
                      const token = await adminUser.getIdToken();
                      await deleteSessionTemplate({ data: { token, templateId: t.id } });
                      load();
                    }}
                    className="text-foreground/40 hover:text-[var(--coral-soft)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}