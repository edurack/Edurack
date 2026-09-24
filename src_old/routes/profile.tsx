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
export const Route = createFileRoute("/profile")({
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-12 sm:px-6">
        <Link to="/" className="mb-10 flex items-center gap-2 self-start">
          <img src="/edurack-logo.webp" alt="Edurack" width={62} height={70} className="h-10 w-auto object-contain" />
          <span className="font-display text-xl font-extrabold tracking-tight text-foreground">edurack</span>
        </Link>

        <h1 className="font-display text-5xl leading-[1.04] tracking-tight text-foreground sm:text-6xl">
          <span className="block font-light">Welcome back.</span>
          <span className="block font-extrabold">Pick up where you left off.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Continue your NEET, JEE, CUET &amp; IPMAT preparation with CBT-style mock tests, a performance
          dashboard, and access to your mentor, all in one account.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/auth" search={{ tab: "signin" }} className="clay-btn inline-flex min-h-12 items-center justify-center gap-2 px-7 text-[15px]">
            Log in <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/auth" search={{ tab: "signup" }} className="clay-btn-ghost inline-flex min-h-12 items-center justify-center px-7 text-[15px]">
            Create free account
          </Link>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-3">
          <FeatureCard icon={<Brain className="h-5 w-5" />} title="CBT mock tests" description="A test engine built to match the real NEET, JEE, CUET and IPMAT exam interface." />
          <FeatureCard icon={<ChartBar className="h-5 w-5" />} title="Smart dashboard" description="Chapter-wise accuracy, speed and weak areas after every test, updated automatically." />
          <FeatureCard icon={<UsersGroup className="h-5 w-5" />} title="Mentor ecosystem" description="Get matched with a mentor who reviews your progress and helps plan what to study next." />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-start gap-2 bg-card p-6 text-left">
      <div className="text-primary">{icon}</div>
      <h2 className="mt-4 font-display text-base font-bold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
