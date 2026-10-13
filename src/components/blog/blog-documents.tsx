// src/components/blog/blog-documents.tsx
//
// "Download" card on a blog post. Visible to everyone (crawlers see the titles
// and descriptions too), but the FILE is only released to a logged-in student:
//   • logged in   → "Download" asks the server for a short-lived link and starts it.
//   • logged out  → "Log in to download" / "Sign up" send the student to /auth with
//                   ?redirect=/blog/<slug>?download=<id>. After login they land back
//                   on this very post and the download starts by itself.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { IconDownload as DownloadIcon, IconFileText as FileText, IconLoader2 as Loader2, IconLock as Lock, IconCircleCheck as Check } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getBlogDocumentDownload } from "@/server-functions/blog-documents";
import { documentKindLabel, formatFileSize } from "@/lib/blog-document-format";
import type { PublicBlogDocument } from "@/lib/blog-types";

export function BlogDocumentsCard({ slug, documents, autoDownloadId }: { slug: string; documents: PublicBlogDocument[]; autoDownloadId?: string }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumedId, setResumedId] = useState<string | null>(null);
  const autoRan = useRef(false);

  async function startDownload(docId: string) {
    if (!user) return;
    setError(null);
    setBusyId(docId);
    try {
      const token = await user.getIdToken();
      const { url, fileName } = await getBlogDocumentDownload({ data: { token, slug, documentId: docId } });
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the download. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  // Back from login with ?download=<id>: start that file once, then tidy the URL.
  useEffect(() => {
    if (!autoDownloadId || !user || autoRan.current) return;
    if (!documents.some((d) => d.id === autoDownloadId)) return;
    autoRan.current = true;
    setResumedId(autoDownloadId);
    void startDownload(autoDownloadId);
    void navigate({ to: "/blog/$slug", params: { slug }, search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownloadId, user]);

  if (documents.length === 0) return null;
  const signedIn = Boolean(user) && !loading;
  const redirectFor = (id: string) => `/blog/${slug}?download=${id}`;

  return (
    <section id="downloads" aria-labelledby="downloads-title" className="relative mb-10 overflow-hidden rounded-3xl bg-[#141b2b] p-5 text-white sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#2864d7]/40 blur-2xl" />
      <div className="relative">
        <h2 id="downloads-title" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <DownloadIcon className="h-5 w-5" aria-hidden="true" />
          {documents.length === 1 ? "Download the PDF" : "Downloads"}
        </h2>
        {!signedIn && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/65">
            <Lock className="h-3 w-3" aria-hidden="true" /> Log in to download — you'll be brought straight back here.
          </p>
        )}
        {resumedId && signedIn && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium">
            <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> You're logged in — your download is starting. If nothing happens, press Download.
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {documents.map((d) => {
            const meta = [documentKindLabel(d.mimeType, d.fileName), formatFileSize(d.sizeBytes)].filter(Boolean).join(" · ");
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-2xl bg-white/[0.07] p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-snug">{d.title}</p>
                    {d.description && <p className="mt-0.5 text-xs leading-relaxed text-white/65">{d.description}</p>}
                    {meta && <p className="mt-1 text-[11px] text-white/45">{meta}</p>}
                  </div>
                </div>

                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => startDownload(d.id)}
                    disabled={busyId === d.id}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90 disabled:opacity-60"
                  >
                    {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <DownloadIcon className="h-4 w-4" aria-hidden="true" />}
                    Download
                  </button>
                ) : (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      to="/auth"
                      search={{ tab: "signin", redirect: redirectFor(d.id) }}
                      className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90"
                    >
                      Log in to download
                    </Link>
                    <Link
                      to="/auth"
                      search={{ tab: "signup", redirect: redirectFor(d.id) }}
                      className="inline-flex items-center justify-center rounded-full border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      Sign up
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="mt-3 text-xs font-medium text-red-300">{error}</p>}
      </div>
    </section>
  );
}
