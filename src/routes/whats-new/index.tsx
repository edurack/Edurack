// src/routes/whats-new/index.tsx  →  /whats-new
// Dated release notes (lib/whats-new.ts): a list of releases, each linking to its own page. Indexable.
import { createFileRoute, Link } from "@tanstack/react-router";
import { breadcrumbJsonLd, pageHead, SITE_URL } from "@/lib/seo";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { RELEASES, formatReleaseDate, releaseUrl } from "@/lib/whats-new";

const PATH = "/whats-new";
const TITLE = "What's New on Edurack";
const DESC = "Dated release notes for Edurack: new Quick Mock and test features, free NEET and JEE tools, and what each update means for students.";

export const Route = createFileRoute("/whats-new/")({
  head: () =>
    pageHead({
      title: TITLE,
      description: DESC,
      path: PATH,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "What's new", path: PATH },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${SITE_URL}/whats-new#page`,
          url: `${SITE_URL}/whats-new`,
          name: TITLE,
          description: DESC,
          inLanguage: "en-IN",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          dateModified: RELEASES[0]?.date,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: RELEASES.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: releaseUrl(r), name: r.title })),
          },
        },
      ],
    }),
  component: WhatsNewPage,
});

function WhatsNewPage() {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-foreground/55">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-foreground/80">What's new</span>
        </nav>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">What's new on Edurack</h1>
        <p className="mt-3 text-base leading-relaxed text-foreground/70">
          Every update to Edurack, with the date it went live, what changed, and why it matters to a student. The newest is first. You can follow along with the{" "}
          <a href="/whats-new/feed.xml" className="font-semibold underline underline-offset-2">
            Atom feed
          </a>
          .
        </p>

        <ol className="mt-10 space-y-8">
          {RELEASES.map((r) => (
            <li key={r.slug}>
              <article className="clay rounded-3xl p-6">
                <time dateTime={r.date} className="text-xs font-bold uppercase tracking-widest text-foreground/50">
                  {formatReleaseDate(r.date)}
                </time>
                <h2 className="font-display mt-1 text-xl font-bold text-foreground sm:text-2xl">
                  <Link to="/whats-new/$slug" params={{ slug: r.slug }} className="hover:underline">
                    {r.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{r.summary}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/80">
                  {r.items.map((i) => (
                    <li key={i.title}>{i.title}</li>
                  ))}
                </ul>
                <Link to="/whats-new/$slug" params={{ slug: r.slug }} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary">
                  Read the details
                </Link>
              </article>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}
