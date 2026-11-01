// src/routes/whats-new/$slug.tsx  →  /whats-new/<slug>
// One release, in full: what changed, why it matters, where to try it. Indexable, with Article JSON-LD.
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { breadcrumbJsonLd, DEFAULT_OG_IMAGE, pageHead, SITE_URL } from "@/lib/seo";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { formatReleaseDate, neighbours, releaseBySlug, releaseUrl } from "@/lib/whats-new";

export const Route = createFileRoute("/whats-new/$slug")({
  loader: ({ params }) => {
    const release = releaseBySlug(params.slug);
    if (!release) throw notFound();
    return { release };
  },
  head: ({ loaderData }) => {
    const r = loaderData?.release;
    if (!r) return { meta: [{ title: "Release not found | Edurack" }, { name: "robots", content: "noindex" }] };
    return pageHead({
      title: r.title,
      description: r.summary,
      path: `/whats-new/${r.slug}`,
      type: "article",
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "What's new", path: "/whats-new" },
          { name: r.title, path: `/whats-new/${r.slug}` },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "Article",
          "@id": `${releaseUrl(r)}#article`,
          headline: r.title,
          description: r.summary,
          datePublished: r.date,
          dateModified: r.date,
          inLanguage: "en-IN",
          image: DEFAULT_OG_IMAGE,
          mainEntityOfPage: releaseUrl(r),
          author: { "@id": `${SITE_URL}/#organization` },
          publisher: { "@id": `${SITE_URL}/#organization` },
          audience: { "@type": "Audience", audienceType: r.audience },
        },
      ],
    });
  },
  component: ReleasePage,
});

function ReleasePage() {
  const { release: r } = Route.useLoaderData();
  const { newer, older } = neighbours(r.slug);
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          <span aria-hidden>/</span>
          <Link to="/whats-new" className="hover:underline">
            What's new
          </Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-foreground/80">{r.title}</span>
        </nav>

        <article>
          <header>
            <time dateTime={r.date} className="text-xs font-bold uppercase tracking-widest text-foreground/50">
              {formatReleaseDate(r.date)}
            </time>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{r.title}</h1>
            <p className="mt-3 text-base leading-relaxed text-foreground/75">{r.summary}</p>
            <p className="mt-2 text-xs font-semibold text-foreground/50">For: {r.audience}</p>
          </header>

          <nav aria-label="In this release" className="clay-inset mt-6 rounded-2xl p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">In this release</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {r.items.map((i, n) => (
                <li key={i.title}>
                  <a href={`#item-${n + 1}`} className="text-foreground/80 hover:underline">
                    {i.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-8 space-y-8">
            {r.items.map((i, n) => (
              <section key={i.title} id={`item-${n + 1}`} className="scroll-mt-24">
                <h2 className="font-display text-xl font-bold text-foreground">{i.title}</h2>
                <p className="mt-2 text-base leading-relaxed text-foreground/80">{i.body}</p>
                {i.href && (
                  <a href={i.href} className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary">
                    {i.linkLabel ?? "Try it"}
                  </a>
                )}
              </section>
            ))}
          </div>

          <section className="clay mt-10 rounded-3xl p-6">
            <h2 className="font-display text-lg font-bold text-foreground">Why it matters</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">{r.why}</p>
          </section>
        </article>

        <nav aria-label="Other releases" className="mt-10 grid gap-3 sm:grid-cols-2">
          {older ? (
            <Link to="/whats-new/$slug" params={{ slug: older.slug }} className="clay-inset rounded-2xl p-4 hover:opacity-90">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-foreground/50">Earlier</span>
              <span className="block text-sm font-bold text-foreground">{older.title}</span>
              <span className="block text-xs text-foreground/55">{formatReleaseDate(older.date)}</span>
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link to="/whats-new/$slug" params={{ slug: newer.slug }} className="clay-inset rounded-2xl p-4 text-right hover:opacity-90">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-foreground/50">Later</span>
              <span className="block text-sm font-bold text-foreground">{newer.title}</span>
              <span className="block text-xs text-foreground/55">{formatReleaseDate(newer.date)}</span>
            </Link>
          )}
        </nav>
        <p className="mt-6 text-center text-sm">
          <Link to="/whats-new" className="font-semibold text-primary hover:underline">
            All updates
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
