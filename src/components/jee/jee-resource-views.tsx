// src/components/jee/jee-resource-views.tsx
//
// Student-facing JEE Main 2027 Notes & Practice Sheets library:
//   /jee-main-2027/resources                       (hub)
//   /jee-main-2027/resources/<subject>             (physics | chemistry | maths)
//   /jee-main-2027/resources/<subject>/<chapter>   (resources grouped by type)
//
// Only published resources reach these components, and they carry metadata only — a file's real location is
// released by the server at the moment a student previews or downloads it (and that click is what is counted).
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { IconDownload as Download, IconEye as Eye, IconFileText as FileText, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Crumbs, H1, Page, PracticeCta, SectionTitle } from "@/components/jee/jee-views";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { getJeeChapter, getJeeSubject, getJeeSubjects, jeeChapterPath, jeePracticeSearch } from "@/lib/jee-blueprint";
import { track } from "@/lib/analytics";
import { JEE_LANDING_PATH } from "@/lib/jee-landing-types";
import { getDeviceId } from "@/lib/device";
import { useAuth } from "@/lib/auth-context";
import { accessJeeResource } from "@/server-functions/jee-resources";
import {
  JEE_LIBRARY_YEAR,
  JEE_LIB_BASE,
  JEE_RESOURCE_TYPES,
  JEE_RESOURCE_TYPE_GROUP_LABELS,
  JEE_RESOURCE_TYPE_LABELS,
  formatBytes,
  jeeLibChapterPath,
  jeeLibSubjectPath,
  type JeeLibrarySummary,
  type PublicJeeResource,
} from "@/lib/jee-resource-types";

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const LibCrumbLink = ({ to, children }: { to: string; children: string }) => <Link to={to as never} className="hover:underline">{children}</Link>;

// ── Hub ──────────────────────────────────────────────────────────────────────
export function JeeLibraryHubView({ summary }: { summary: JeeLibrarySummary }) {
  const subjects = getJeeSubjects();
  return (
    <Page>
      <Crumbs items={[{ label: `JEE Main ${JEE_LIBRARY_YEAR} resources` }]} />
      <H1>JEE Main {JEE_LIBRARY_YEAR} Notes &amp; Practice Sheets</H1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
        Chapter-wise PDF notes, quick revision sheets, practice sheets, answer keys and detailed solutions prepared by the Edurack team. Pick a subject to see the chapters that have resources.
      </p>
      <p className="mt-3 text-sm">
        <Link to={JEE_LANDING_PATH as never} className="font-bold text-[var(--sky-deep)] hover:underline">JEE Main {JEE_LIBRARY_YEAR} hub: updates, practice and guides →</Link>
      </p>

      {summary.total === 0 ? (
        <div className="clay mt-8 rounded-3xl p-6 text-sm text-foreground/70">
          <p className="font-semibold text-foreground">Resources are being added.</p>
          <p className="mt-1">Nothing has been published yet. In the meantime you can practise JEE previous-year questions and see which chapters carry the most marks.</p>
          <p className="mt-3 flex flex-wrap gap-4 font-bold text-[var(--sky-deep)]">
            <Link to="/jee/chapter-wise-weightage">Chapter-wise weightage →</Link>
            <Link to="/pyq" search={jeePracticeSearch() as never}>Practise JEE PYQs →</Link>
          </p>
        </div>
      ) : (
        <>
          <SectionTitle>Choose a subject</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {subjects.map((s) => {
              const n = summary.bySubject[s.key] ?? 0;
              const chapters = s.chapters.filter((c) => !c.retired && summary.byChapter[`${s.key}/${c.slug}`]).length;
              const body = (
                <>
                  <span className="block font-display text-xl font-bold text-foreground">{s.name}</span>
                  <span className="mt-1 block text-sm text-foreground/60">{n ? `${plural(n, "resource")} · ${plural(chapters, "chapter")}` : "Coming soon"}</span>
                  {n > 0 && <span className="mt-3 inline-block text-xs font-bold text-[var(--sky-deep)]">Browse {s.name} →</span>}
                </>
              );
              return n ? (
                <Link key={s.key} to={jeeLibSubjectPath(s.key) as never} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">{body}</Link>
              ) : (
                <div key={s.key} className="clay rounded-3xl p-5 opacity-60">{body}</div>
              );
            })}
          </div>
        </>
      )}
      <PracticeCta line="Practise what you revise: JEE PYQs with solutions." />
    </Page>
  );
}

// ── Subject ──────────────────────────────────────────────────────────────────
export function JeeLibrarySubjectView({ subjectKey, summary }: { subjectKey: string; summary: JeeLibrarySummary }) {
  const s = getJeeSubject(subjectKey)!;
  const chapters = s.chapters.filter((c) => !c.retired);
  const withRes = chapters.filter((c) => summary.byChapter[`${s.key}/${c.slug}`]);
  const without = chapters.filter((c) => !summary.byChapter[`${s.key}/${c.slug}`]);
  return (
    <Page>
      <Crumbs items={[{ label: `JEE Main ${JEE_LIBRARY_YEAR} resources`, to: <LibCrumbLink to={JEE_LIB_BASE}>{`JEE Main ${JEE_LIBRARY_YEAR} resources`}</LibCrumbLink> }, { label: s.name }]} />
      <H1>JEE Main {JEE_LIBRARY_YEAR} {s.name} Notes &amp; Practice Sheets</H1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
        {withRes.length
          ? `${plural(summary.bySubject[s.key] ?? 0, "resource")} across ${plural(withRes.length, "chapter")}. Open a chapter to preview or download its PDFs.`
          : `No ${s.name} resources have been published yet.`}
      </p>

      {withRes.length > 0 && (
        <>
          <SectionTitle>{s.name} chapters with resources</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {withRes.map((c) => (
              <li key={c.slug}>
                <Link to={jeeLibChapterPath(s.key, c.slug) as never} className="clay flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5">
                  <span className="font-semibold text-foreground">{c.name}</span>
                  <span className="shrink-0 text-xs font-bold text-foreground/55">{plural(summary.byChapter[`${s.key}/${c.slug}`], "file")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {without.length > 0 && (
        <>
          <SectionTitle>Not published yet</SectionTitle>
          <ul className="clay grid gap-x-6 gap-y-1.5 rounded-3xl p-5 text-sm text-foreground/55 sm:grid-cols-2">
            {without.map((c) => <li key={c.slug}>{c.name}</li>)}
          </ul>
        </>
      )}
      <PracticeCta line={`Practise JEE Main ${s.name} PYQs`} subject={s.short} />
    </Page>
  );
}

// ── Chapter ──────────────────────────────────────────────────────────────────
type Busy = { id: string; mode: "preview" | "download" } | null;

function canPreviewInline(): boolean {
  if (typeof navigator === "undefined") return false;
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return !mobile && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === true;
}

export function JeeLibraryChapterView({ subjectKey, chapterSlug, resources }: { subjectKey: string; chapterSlug: string; resources: PublicJeeResource[] }) {
  const s = getJeeSubject(subjectKey)!;
  const c = getJeeChapter(subjectKey, chapterSlug)!;
  const { user } = useAuth();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const base = { exam: "jee-main", exam_year: JEE_LIBRARY_YEAR, subject: s.key, chapter: c.slug };

  // One page-view event per chapter per visit. The ref (not state) is what stops a re-render or a React
  // dev double-effect from sending it twice.
  const viewedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${s.key}/${c.slug}`;
    if (viewedKey.current === key) return;
    viewedKey.current = key;
    track("jee_resource_page_viewed", { ...base, resource_count: resources.length, resource_types: [...new Set(resources.map((r) => r.type))].join(",") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key, c.slug]);

  async function open(r: PublicJeeResource, mode: "preview" | "download") {
    if (busy) return;
    setBusy({ id: r.id, mode });
    setError(null);
    try {
      let token: string | null = null;
      try { token = user ? await user.getIdToken() : null; } catch { token = null; }
      const { url, fileName } = await accessJeeResource({ data: { resourceId: r.id, mode, visitorId: getDeviceId(), token } });
      track(mode === "preview" ? "jee_resource_previewed" : "jee_resource_downloaded", { ...base, resource_type: r.type, resource_id: r.id });
      if (mode === "preview" && canPreviewInline()) setPreview({ url, name: fileName });
      else window.location.assign(url); // phones and tablets: hand the PDF to the device's own viewer / downloads
    } catch (e) {
      setError({ id: r.id, msg: e instanceof Error ? e.message : "Couldn't open this file. Please try again." });
    }
    setBusy(null);
  }

  const groups = JEE_RESOURCE_TYPES.map((t) => ({ type: t, items: resources.filter((r) => r.type === t) })).filter((g) => g.items.length > 0);

  return (
    <Page>
      <Crumbs
        items={[
          { label: `JEE Main ${JEE_LIBRARY_YEAR} resources`, to: <LibCrumbLink to={JEE_LIB_BASE}>{`JEE Main ${JEE_LIBRARY_YEAR} resources`}</LibCrumbLink> },
          { label: s.name, to: <LibCrumbLink to={jeeLibSubjectPath(s.key)}>{s.name}</LibCrumbLink> },
          { label: c.name },
        ]}
      />
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground/50">{s.name}</p>
      <H1>{c.name} — JEE Main {JEE_LIBRARY_YEAR} Notes &amp; Practice Sheets</H1>

      {groups.length === 0 ? (
        <div className="clay mt-8 rounded-3xl p-6 text-sm text-foreground/70">
          <p className="font-semibold text-foreground">No resources published for this chapter yet.</p>
          <p className="mt-1">You can still see how much {c.name} matters in JEE Main and practise previous-year questions.</p>
        </div>
      ) : (
        <>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
            {plural(resources.length, "PDF resource")} for {c.name}, prepared by the Edurack team. Preview a file in your browser or download it to read offline.
          </p>
          {groups.map((g) => (
            <section key={g.type} aria-labelledby={`grp-${g.type}`}>
              <h2 id={`grp-${g.type}`} className="mb-3 mt-10 font-display text-xl font-bold tracking-tight text-foreground">{JEE_RESOURCE_TYPE_GROUP_LABELS[g.type]}</h2>
              <ul className="space-y-3">
                {g.items.map((r) => (
                  <li key={r.id} className="clay flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center">
                    <div className="clay-inset hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:flex"><FileText className="h-5 w-5 text-foreground/55" /></div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-bold leading-snug text-foreground">{r.title}</h3>
                      {r.description && <p className="mt-1 text-sm text-foreground/65">{r.description}</p>}
                      <p className="mt-1.5 text-xs text-foreground/50">
                        {[JEE_RESOURCE_TYPE_LABELS[r.type], "PDF", formatBytes(r.sizeBytes), r.version, r.lastReviewedAt ? `Reviewed ${dateLabel(r.lastReviewedAt)}` : ""].filter(Boolean).join(" · ")}
                      </p>
                      {error?.id === r.id && <p className="mt-2 text-xs font-medium text-red-600">{error.msg}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => open(r, "preview")} disabled={!!busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-bold text-foreground disabled:opacity-60">
                        {busy?.id === r.id && busy.mode === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview
                      </button>
                      <button type="button" onClick={() => open(r, "download")} disabled={!!busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background disabled:opacity-60">
                        {busy?.id === r.id && busy.mode === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <SectionTitle>More for {c.name} on Edurack</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/pyq" search={jeePracticeSearch(s.short) as never} onClick={() => track("jee_resource_practice_clicked", { ...base, resource_type: null, resource_id: null })} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
          <p className="font-semibold text-foreground">Practise JEE {s.name} PYQs</p>
          <p className="mt-0.5 text-xs text-foreground/60">Previous-year questions with solutions on Edurack.</p>
        </Link>
        <Link to={jeeChapterPath(s.key, c.slug) as never} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
          <p className="font-semibold text-foreground">{c.name} weightage</p>
          <p className="mt-0.5 text-xs text-foreground/60">How many questions JEE Main has asked from this chapter.</p>
        </Link>
      </div>

      {preview && <PdfPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </Page>
  );
}
