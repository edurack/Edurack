// src/routes/free-resources.tsx
//
// Open library of notes, PYQ papers, formula sheets, etc. for NEET / JEE / CUET / IPMAT.
// Anyone can download — NO login. The only thing we ask of the browser is a random id
// (so the admin dashboard can count distinct visitors); the download itself goes through
// the server, which logs it before releasing the file.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { IconDownload as Download, IconLoader2 as Loader2, IconSearch as Search, IconFileText as FileText } from "@tabler/icons-react";
import { pageHead, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";
import { downloadResource, listPublicResources } from "@/server-functions/resources";
import { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABELS, RESOURCE_EXAMS, RESOURCE_EXAM_LABELS, type PublicResource, type ResourceCategory, type ResourceExam } from "@/lib/resource-types";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { documentKindLabel, formatFileSize } from "@/lib/blog-document-format";
import { getDeviceId } from "@/lib/device";
import { useAuth } from "@/lib/auth-context";

const FAQS: { q: string; a: string }[] = [
  { q: "Are these NEET and JEE notes really free?", a: "Yes. Every file on this page is free to download. You don't need to log in or pay anything." },
  { q: "Which exams are covered?", a: "NEET, JEE, CUET and IPMAT. Some files, like study planners, are useful for every exam and appear under each exam's filter." },
  { q: "What kind of material can I download?", a: "Notes, previous year question papers, formula sheets, syllabus outlines and study planners, mostly as PDFs. We add new files regularly." },
]

type ResourceSearch = { exam?: ResourceExam; category?: ResourceCategory; q?: string };

export const Route = createFileRoute("/free-resources")({
  validateSearch: (s: Record<string, unknown>): ResourceSearch => ({
    exam: RESOURCE_EXAMS.includes(s.exam as ResourceExam) ? (s.exam as ResourceExam) : undefined,
    category: RESOURCE_CATEGORIES.includes(s.category as ResourceCategory) ? (s.category as ResourceCategory) : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 60) : undefined,
  }),
  loader: ({ location }) => {
    const s = location.search as ResourceSearch;
    return listPublicResources({ data: { exam: s.exam, category: s.category, q: s.q } });
  },
  // Filtered views (?exam= / ?category= / ?q=) are the same page — canonical stays plain /free-resources.
  head: ({ loaderData }) => {
    const items = (loaderData as { items?: PublicResource[] } | undefined)?.items ?? [];
    const seo = pageHead({
      title: "Free NEET, JEE, CUET & IPMAT Notes and PDFs",
      description: "Download free notes, previous year papers, formula sheets, syllabus and planners for NEET, JEE, CUET and IPMAT. No login needed.",
      path: "/free-resources",
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free resources", path: "/free-resources" }]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${SITE_URL}/free-resources#webpage`,
          url: `${SITE_URL}/free-resources`,
          name: "Free NEET, JEE, CUET & IPMAT notes and PDFs",
          description: "Free downloadable notes, previous year papers, formula sheets, syllabus and planners for NEET, JEE, CUET and IPMAT aspirants.",
          inLanguage: "en-IN",
          isAccessibleForFree: true,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          publisher: { "@id": `${SITE_URL}/#organization` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: items.length,
            itemListElement: items.slice(0, 20).map((r, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "LearningResource",
                name: r.title,
                ...(r.description ? { description: r.description } : {}),
                learningResourceType: RESOURCE_CATEGORY_LABELS[r.category],
                teaches: r.subject || undefined,
                about: r.exam === "all" ? "NEET, JEE, CUET, IPMAT" : RESOURCE_EXAM_LABELS[r.exam],
                inLanguage: "en-IN",
                isAccessibleForFree: true,
                dateCreated: r.createdAt,
                // No file URL on purpose — downloads go through the server so they can be counted.
                url: `${SITE_URL}/free-resources`,
              },
            })),
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
      ],
    });
    return {
      ...seo,
      meta: [
        ...seo.meta,
        { name: "keywords", content: "free NEET notes PDF, JEE notes PDF, NEET previous year papers, JEE PYQ PDF, CUET notes, IPMAT preparation material, formula sheets, free study material" },
        { property: "og:site_name", content: "Edurack" },
        { property: "og:locale", content: "en_IN" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: FreeResourcesPage,
});

function FreeResourcesPage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useAuth();

  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(search.q ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    listPublicResources({ data: { exam: search.exam, category: search.category, q: search.q } }).then(setData).finally(() => setLoading(false));
  }, [search.exam, search.category, search.q]);

  // Debounced search box → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((q.trim() || undefined) !== search.q) navigate({ search: (p) => ({ ...p, q: q.trim() || undefined }), replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownload(r: PublicResource) {
    setBusyId(r.id); setError(null);
    try {
      // Logged-in students get counted as students; everyone else as a guest. Never blocks.
      let token: string | null = null;
      try { token = user ? await user.getIdToken() : null; } catch { token = null; }
      const { url } = await downloadResource({ data: { resourceId: r.id, visitorId: getDeviceId(), token } });
      window.location.href = url;
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === r.id ? { ...x, downloads: x.downloads + 1 } : x)) }));
    } catch (e) {
      setError({ id: r.id, msg: e instanceof Error ? e.message : "Couldn't start the download. Please try again." });
    }
    setBusyId(null);
  }

  const set = (patch: Partial<ResourceSearch>) => navigate({ search: (p) => ({ ...p, ...patch }) });

  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-5xl px-4 py-14">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Free resources for NEET, JEE &amp; more</h1>
          <p className="mt-1 text-sm text-foreground/60">Notes, previous year papers, formula sheets and planners — free for everyone. No login needed.</p>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter by exam" className="flex flex-wrap gap-2">
            <Chip active={!search.exam} onClick={() => set({ exam: undefined })}>All exams</Chip>
            {RESOURCE_EXAMS.filter((e) => e !== "all").map((e) => <Chip key={e} active={search.exam === e} onClick={() => set({ exam: e })}>{RESOURCE_EXAM_LABELS[e]}</Chip>)}
          </div>
          <label className="clay-inset ml-auto flex min-w-[200px] items-center gap-2 rounded-full px-3 py-2">
            <Search className="h-4 w-4 text-foreground/40" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, subject…" aria-label="Search resources" className="w-full bg-transparent text-sm focus:outline-none" />
          </label>
        </div>
        <div role="group" aria-label="Filter by category" className="mb-8 flex flex-wrap gap-2">
          <Chip active={!search.category} onClick={() => set({ category: undefined })}>Everything</Chip>
          {RESOURCE_CATEGORIES.map((c) => <Chip key={c} active={search.category === c} onClick={() => set({ category: c })}>{RESOURCE_CATEGORY_LABELS[c]}</Chip>)}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-foreground/40" role="status" aria-live="polite">Loading…</div>
        ) : data.items.length === 0 ? (
          <div className="clay p-10 text-center text-sm text-foreground/60" role="status">Nothing here yet — check back soon, we add new files often.</div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.items.map((r) => (
              <li key={r.id} className="clay flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{RESOURCE_EXAM_LABELS[r.exam]}</span>
                      <span className="text-[11px] text-foreground/45">{RESOURCE_CATEGORY_LABELS[r.category]}{r.subject ? ` · ${r.subject}` : ""}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold leading-snug text-foreground">{r.title}</p>
                    {r.description && <p className="mt-1 line-clamp-2 text-xs text-foreground/60">{r.description}</p>}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-foreground/45">{documentKindLabel(r.mimeType, r.fileName)}{r.sizeBytes ? ` · ${formatFileSize(r.sizeBytes)}` : ""}{r.downloads > 0 ? ` · ${r.downloads.toLocaleString("en-IN")} downloads` : ""}</p>
                  <button type="button" onClick={() => handleDownload(r)} disabled={busyId === r.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-bold text-background disabled:opacity-60">
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
                  </button>
                </div>
                {error?.id === r.id && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error.msg}</p>}
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="fr-faq" className="mt-16">
          <h2 id="fr-faq" className="font-display text-xl font-bold tracking-tight text-foreground">Free study material: quick answers</h2>
          <dl className="mt-4 space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="clay p-5">
                <dt className="text-sm font-bold text-foreground">{f.q}</dt>
                <dd className="mt-1 text-sm text-foreground/65">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-foreground text-background" : "clay-chip text-foreground/60"}`}>
      {children}
    </button>
  );
}
