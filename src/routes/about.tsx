import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";
import {
  IconTargetArrow as TargetArrow,
  IconDeviceDesktop as DeviceDesktop,
  IconUsers as Users,
  IconChartBar as ChartBar,
  IconShieldCheck as ShieldCheck,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { SiteHeader, SiteFooter, WRAP, Rise, Title } from "@/components/landing/site-chrome";

// Everything on this page is a claim we can actually stand behind — no
// invented founder bios, no made-up numbers. It leans on what's already
// true and documented elsewhere in the codebase (see legal/terms.tsx:
// the marketplace model, mentor verification requirement, and that
// EDURACK isn't the instructor of record for any individual batch).
export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      title: "About Edurack",
      path: "/about",
      description:
        "Edurack is a mock-test and mentorship marketplace for NEET, JEE, CUET and IPMAT — built on an exact CBT replica engine and mentors verified for real exam rank.",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About Edurack",
          url: `${SITE_URL}/about`,
          about: { "@type": "Organization", "@id": `${SITE_URL}/#organization` },
        },
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ]),
      ],
    }),
  component: AboutPage,
});

const pillars = [
  {
    icon: DeviceDesktop,
    t: "A CBT engine built to match, not resemble",
    d: "Most mock-test tools hand you a PDF or a generic quiz app. Edurack's simulator replicates the actual NTA CBT interface — the same layout, palette, timer and navigation students meet on exam day, so the first time they see it isn't exam day.",
  },
  {
    icon: ShieldCheck,
    t: "Mentors verified for the rank they claim",
    d: "Anyone can put \"AIIMS\" or \"IIT\" on a profile. Edurack mentors are required to prove the exam rank, institution and credentials they advertise before they're allowed to publish a batch — and it's grounds for removal if they don't hold up.",
  },
  {
    icon: Users,
    t: "An open marketplace, not one syllabus",
    d: "Edurack doesn't write the curriculum and isn't the instructor of record. Mentors design and price their own batches; the platform's job is to verify who they are, host the content, and process payment safely.",
  },
  {
    icon: ChartBar,
    t: "Analytics that point at what to fix",
    d: "Every attempt is broken down by subject and topic, not just a final score — so a student (and their mentor) can see exactly which chapters are actually costing them marks.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* ── Hero: the problem, stated plainly ─────────────────────── */}
        <section className="py-16 sm:py-24">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <TargetArrow className="h-4 w-4" />
                About Edurack
              </div>
              <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
                <span className="block font-light">Most students prepare for NEET and JEE</span>
                <span className="block font-extrabold">on tools that don't look like the exam.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Practice tests are usually a PDF, a generic quiz app, or a scanned paper — nothing like the real NTA
                computer-based test screen a student sits down to on exam day. Edurack exists to close that gap: an
                exact CBT replica to practice on, and a marketplace of exam-rank-verified mentors to learn from.
              </p>
            </Rise>
          </div>
        </section>

        {/* ── What Edurack actually is ──────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className={WRAP}>
            <Rise className="max-w-2xl">
              <Title light="What we actually" bold="built, and why." />
            </Rise>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {pillars.map((p, i) => (
                <Rise key={p.t} delay={i * 0.07}>
                  <div className="h-full rounded-3xl border border-border p-6 sm:p-8">
                    <p.icon className="h-7 w-7 text-primary" stroke={1.6} />
                    <h3 className="mt-8 font-display text-xl font-bold">{p.t}</h3>
                    <p className="mt-2 text-muted-foreground">{p.d}</p>
                  </div>
                </Rise>
              ))}
            </div>
          </div>
        </section>

        {/* ── Who's behind it — honest, not padded ──────────────────── */}
        <section className="py-16 sm:py-20">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-3xl">
              <div className="clay p-8 sm:p-12">
                <Title light="Built by a small team," bold="not a big brand." />
                <p className="mt-5 leading-relaxed text-muted-foreground">
                  Edurack is built by a small team, working directly with the mentors and students on the
                  platform rather than at a distance from them. We keep the team intentionally small and close
                  to the product — every feature on here exists because a mentor asked for it or a student ran
                  into a wall without it.
                </p>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  We'd rather the platform speak for itself first: try the free CBT simulator, look at a mentor's
                  verified credentials, read a chapter breakdown. If you have questions about who's behind
                  Edurack, our{" "}
                  <Link to="/contact" className="font-semibold text-foreground hover:underline">
                    contact page
                  </Link>{" "}
                  reaches us directly.
                </p>
              </div>
            </Rise>
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────────── */}
        <section className="pb-20 sm:pb-28">
          <div className={WRAP}>
            <Rise className="clay flex flex-col items-center gap-6 p-10 text-center sm:p-14">
              <Title light="See it before you" bold="decide anything." />
              <p className="max-w-xl text-muted-foreground">
                No sign-up needed — try a free, timed mock in the same interface you'll sit the real exam on.
              </p>
              <Link
                to="/simulator/live"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.02]"
              >
                Try the free demo <ArrowRight className="h-4 w-4" />
              </Link>
            </Rise>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
