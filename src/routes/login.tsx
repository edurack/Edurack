import { createFileRoute, Link } from "@tanstack/react-router";
import {
  IconArrowRight as ArrowRight,
  IconBrain as Brain,
  IconChartBar as ChartBar,
  IconUsersGroup as UsersGroup,
} from "@tabler/icons-react";

// ─── /login — static, indexable sign-in landing page ───────────────────────
// Unlike /auth (which is a client-rendered, stateful, noindex'd wizard),
// this route exists purely so search crawlers and "edurack login" style
// queries have a real, immediately-painted page to land on and rank.
//
// It renders no auth state, makes no Firebase calls, and has no
// stage === "checking" gate — everything below is static content that
// exists on first paint, whether or not JS has hydrated yet.
//
// The actual sign-in/sign-up logic still lives entirely in /auth; this
// page's only job is to be a crawlable, linkable front door into it.
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in to Edurack · NEET, JEE, CUET & IPMAT Prep" },
      {
        name: "description",
        content:
          "Sign in to Edurack to continue your NEET, JEE, CUET & IPMAT exam prep — CBT-style mock tests, smart dashboards and a dedicated mentor ecosystem.",
      },
      { property: "og:title", content: "Sign in to Edurack" },
      {
        property: "og:description",
        content:
          "Log in or create your free Edurack account for NEET, JEE, CUET & IPMAT preparation.",
      },
      // Intentionally indexable — this is the crawlable counterpart to
      // the noindex'd /auth flow. Do not add a noindex tag here.
    ],
    links: [{ rel: "canonical", href: "https://edurack.in/login" }],
  }),
  component: LoginLandingPage,
});

function LoginLandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="clay flex h-12 w-auto items-center justify-center p-2 sm:h-14">
            <img
              src="https://www.edurack.in/edurack-logo.webp"
              alt="Edurack"
              width={62}
              height={70}
              className="h-10 w-auto object-contain sm:h-12"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/60">
            Edurack
          </p>
        </div>

        {/* H1 + real, static copy — present at first paint, no client gating */}
        <div className="mb-8 max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Sign in to Edurack
          </h1>
          <p className="mt-3 text-base text-foreground/70 sm:text-lg">
            Continue your NEET, JEE, CUET &amp; IPMAT preparation — CBT-style
            mock tests, a smart performance dashboard, and access to your
            mentor, all in one account.
          </p>
        </div>

        {/* Primary CTA — a real anchor into the stateful auth flow, so it
            works for crawlers and users with or without JS having run yet. */}
        <Link
          to="/auth"
          className="clay-btn mb-10 flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white transition-transform hover:scale-[1.02]"
        >
          <span>Login or Create Account</span>
          <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Short, genuinely descriptive content — gives the page enough
            unique text to be worth indexing on its own, rather than being
            a bare button with no context. */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="CBT Mock Tests"
            description="Practice on a computer-based test engine built to match the real NEET, JEE, CUET and IPMAT exam interface."
          />
          <FeatureCard
            icon={<ChartBar className="h-5 w-5" />}
            title="Smart Dashboard"
            description="Track chapter-wise accuracy, speed and weak areas after every test, updated automatically."
          />
          <FeatureCard
            icon={<UsersGroup className="h-5 w-5" />}
            title="Mentor Ecosystem"
            description="Get matched with a mentor who reviews your progress and helps you plan what to study next."
          />
        </div>

        <p className="mt-10 max-w-md text-center text-xs text-foreground/60">
          New to Edurack?{" "}
          <Link to="/auth" className="underline decoration-dotted underline-offset-2">
            Create a free account
          </Link>{" "}
          in under a minute.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="clay flex flex-col items-start gap-2 p-5 text-left">
      <div className="clay-inset flex h-9 w-9 items-center justify-center rounded-full text-[var(--sky-deep)]">
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs leading-relaxed text-foreground/60">{description}</p>
    </div>
  );
}