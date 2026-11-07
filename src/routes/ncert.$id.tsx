// src/routes/ncert.$id.tsx  →  /ncert/<slug>-<questionId>
//
// A public, server-rendered page for one NCERT Line-by-Line question, so the question text is in the HTML Google reads.
// It shows the question and its options ONLY: the answer and the step-by-step solution stay inside the practice screen
// (login needed), the same way the PYQ pages keep their solution out of the HTML.
// The page exists only while NCERT is live; before that it is a 404 and is not in the sitemap.
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth-context";
import { SmartContent } from "@/lib/smart-content";
import { SITE_URL, breadcrumbJsonLd, pageHead, truncate } from "@/lib/seo";
import { plainText } from "@/lib/pyq-public";
import { ncertContextLines, ncertJsonLd, ncertQuestionTitle, parseNcertParam, type NcertPublicPage } from "@/lib/ncert-public";
import { getPublicNcertQuestion } from "@/server-functions/ncert-public";

const OPTIONS = ["A", "B", "C", "D"] as const;

export const Route = createFileRoute("/ncert/$id")({
  loader: async ({ params }) => {
    const id = parseNcertParam(params.id);
    if (!id) throw notFound();
    const page = await getPublicNcertQuestion({ data: { id } });
    if (!page) throw notFound();
    // Wrong or outdated slug → permanent redirect to the one canonical url.
    if (params.id !== page.canonical) {
      throw redirect({ to: "/ncert/$id", params: { id: page.canonical }, statusCode: 301 });
    }
    return page;
  },
  head: ({ loaderData }) => {
    const page = loaderData as NcertPublicPage | undefined;
    if (!page) return { meta: [{ title: "Question not found · Edurack" }, { name: "robots", content: "noindex" }] };

    const { question: q, canonical, indexable } = page;
    const path = `/ncert/${canonical}`;
    const text = plainText(q.body);
    const where = `NCERT Class ${q.classLevel} ${q.subject}, ${q.chapter}`;

    // Too little readable text (image-only question etc.): keep it out of search, but let Google follow its links.
    if (!indexable) {
      return {
        meta: [{ title: `${truncate(text || `${q.subject} NCERT question`, 52)} · Edurack` }, { name: "robots", content: "noindex, follow" }],
        links: [{ rel: "canonical", href: `${SITE_URL}${path}` }],
      };
    }
    return pageHead({
      title: ncertQuestionTitle(q),
      description: `${truncate(text, 100)} — ${where}. NCERT Line by Line practice on Edurack.`,
      path,
      type: "article",
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "PYQ practice", path: "/pyq" },
          { name: truncate(text, 60), path },
        ]),
        ncertJsonLd(q, `${SITE_URL}${path}`),
      ],
    });
  },
  notFoundComponent: NotFoundView,
  component: NcertQuestionPage,
});

function NotFoundView() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">Question not found</h1>
      <p className="mt-2 text-sm text-foreground/70">This question doesn't exist or is not available yet.</p>
      <Link to="/pyq" className="clay-btn mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white">
        Browse PYQs
      </Link>
    </div>
  );
}

function NcertQuestionPage() {
  const page = Route.useLoaderData() as NcertPublicPage;
  const { question: q, canonical, related, adjacent } = page;
  const { user, loading } = useAuth();
  const path = `/ncert/${canonical}`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-3 text-[13px] font-semibold text-foreground/70">
          <Link to="/pyq" className="hover:text-foreground">PYQ practice</Link>
          <span aria-hidden> / </span>
          <span>NCERT Line by Line</span>
          <span aria-hidden> / </span>
          <span>{q.subject}</span>
          <span aria-hidden> / </span>
          <span>{q.chapter}</span>
        </nav>

        <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {q.chapter}: NCERT {q.subject} question
        </h1>

        <article className="clay mt-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground/70">
            <span>Class {q.classLevel}</span>
            <span>· {q.difficulty}</span>
            <span>· {q.topic}</span>
          </div>

          <SmartContent value={q.body} eager className="mt-3 text-[15px] leading-relaxed text-foreground" />

          {q.type === "mcq" && q.options ? (
            <ol className="mt-4 space-y-2" aria-label="Options">
              {OPTIONS.map((opt) => (
                <li key={opt} className="flex items-start gap-3 rounded-2xl bg-foreground/[0.04] px-3 py-3 text-sm">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-bold text-foreground/70">{opt}</span>
                  <div className="min-w-0 flex-1">
                    <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-[13px] font-semibold text-foreground/70">This is a numerical-answer question.</p>
          )}

          {/* The answer and solution live in the practice screen. This is where a search visit becomes a student. */}
          <div className="clay-inset mt-5 rounded-2xl p-4 text-center sm:p-5">
            <p className="font-display text-sm font-bold text-foreground">Check your answer and see the solution</p>
            <p className="mt-1 text-[13px] text-foreground/70">Practise this chapter question by question in NCERT Line by Line.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {loading ? null : user ? (
                <Link to="/pyq" search={{ ncert: true }} className="clay-btn inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white">
                  Practise NCERT Line by Line
                </Link>
              ) : (
                <>
                  <Link to="/auth" search={{ tab: "signup", redirect: path }} className="clay-btn inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white">
                    Sign up free
                  </Link>
                  <Link to="/auth" search={{ tab: "signin", redirect: path }} className="clay-chip inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-foreground">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </article>

        <section aria-labelledby="about-question" className="clay mt-6 p-4 sm:p-5">
          <h2 id="about-question" className="font-display text-base font-bold text-foreground">About this question</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/80">
            {ncertContextLines(q).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {(adjacent.prev || adjacent.next) && (
          <nav aria-label="Previous and next question" className="mt-6 grid gap-2 sm:grid-cols-2">
            {adjacent.prev ? (
              <Link to="/ncert/$id" params={{ id: adjacent.prev.param }} className="clay block p-3.5 transition-colors hover:bg-foreground/[0.03]">
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/70">← Previous question</p>
                <p className="mt-1 text-sm leading-snug text-foreground">{adjacent.prev.snippet || `${adjacent.prev.chapter} question`}</p>
              </Link>
            ) : (
              <span />
            )}
            {adjacent.next && (
              <Link to="/ncert/$id" params={{ id: adjacent.next.param }} className="clay block p-3.5 text-right transition-colors hover:bg-foreground/[0.03]">
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/70">Next question →</p>
                <p className="mt-1 text-sm leading-snug text-foreground">{adjacent.next.snippet || `${adjacent.next.chapter} question`}</p>
              </Link>
            )}
          </nav>
        )}

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-8">
            <h2 id="related" className="font-display text-base font-bold text-foreground">Related questions</h2>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.param}>
                  <Link to="/ncert/$id" params={{ id: r.param }} className="clay block p-3.5 transition-colors hover:bg-foreground/[0.03]">
                    <p className="text-sm leading-snug text-foreground">{r.snippet || `${r.chapter} question`}</p>
                    <p className="mt-1.5 text-xs font-semibold text-foreground/70">
                      {r.topic} · {r.difficulty}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
