import { createFileRoute, Link, Await } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconMenu2 as Menu,
  IconX as X,
  IconDeviceDesktopAnalytics as MonitorPlay,
  IconLayoutDashboard as LayoutDashboard,
  IconCalendarCheck as CalendarCheck,
  IconChartLine as LineChart,
  IconArrowRight as ArrowRight,
  IconSparkles as Sparkles,
  IconUserCheck as UserCheck,
  IconTarget as Target,
  IconActivity as Activity,
  IconTrendingUp as TrendingUp,
  IconShieldCheck as ShieldCheck,
  IconUsers as Users,
  IconWorld as Globe,
  IconBrandLinkedin as Linkedin,
  IconBrandYoutube as Youtube,
  IconBrandInstagram as Instagram,
  IconBrandX as Twitter,
  IconMessageCircle as MessageSquare,
  IconAt as AtSign,
  IconAward as Award,
  IconStack2 as Layers3,
  IconChevronDown as ChevronDown,
  IconSchool as GraduationCap, // FIX: replaced the separate `lucide-react` import.
  // Pulling in an entire second icon library for one icon was adding a whole
  // extra module (and its own tree-shaking boundary) to the bundle for a
  // single glyph. Tabler ships an equivalent "school" icon, so we use that
  // instead and drop the lucide-react dependency from this file entirely.
} from "@tabler/icons-react";
import { listMentorsForLanding } from "@/server-functions/catalog";

// FIX: CbtSimulator is a heavy, below-the-fold interactive component
// (exam-navigation UI, question palette, timers, etc). It was being bundled
// into the initial JS payload even though nothing above the fold needs it.
// Lazy-loading it moves its code (and whatever libraries it pulls in) out of
// the critical bundle, which is what Lighthouse's "Reduce unused JavaScript"
// audit was flagging on /assets/index-*.js.
const CbtSimulator = lazy(() =>
  import("@/components/landing/CbtSimulator").then((m) => ({ default: m.CbtSimulator })),
);

// ---------------------------------------------
// Mentor data is deferred/streamed rather than awaited in the loader.
// Awaiting the DB call here would block the ENTIRE page — including the
// hero, which has nothing to do with mentors — until the mentor query
// resolves (this is what caused the FCP/Speed Index regression after the
// first loader-based fix). Instead we hand back the raw promise; the page
// shell streams to the browser immediately, and MentorShowcase below
// resolves the promise itself via <Await>, with a real static fallback
// (not a spinner) shown until it settles. This keeps FCP/LCP fast AND
// keeps mentor content out of a client-only useEffect, so it's still
// present in the streamed HTML rather than hidden behind a client fetch.
// ---------------------------------------------
export const Route = createFileRoute("/")({
  loader: () => {
    return {
      mentorsPromise: listMentorsForLanding().then(
        (res) => res.mentors as LandingMentor[],
      ),
    };
  },
  component: Index,
});

// ---------------------------------------------
// Launch date — single source of truth so the hero badge, footer, and
// structured data all agree with each other.
// ---------------------------------------------
const LAUNCH_DATE_LABEL = "Launched 10 September 2026";

// ---------------------------------------------
// Shared CTA styling — a stronger gradient pill used for the header's
// primary Sign Up action and the hero's primary CTA, so the single most
// important action on the page reads as clearly more important than the
// generic `clay-btn` used everywhere else (tab pills, ghost links, etc).
// Reuses the same sky→teal gradient already established in the mentor
// marketplace banner further down the page, rather than introducing a
// new color.
// ---------------------------------------------
const PRIMARY_CTA =
  "bg-gradient-to-br from-sky-500 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20 hover:shadow-lg hover:shadow-sky-500/30 hover:-translate-y-0.5";

// ---------------------------------------------
// Exam config
// ---------------------------------------------
type ExamKey = "neet" | "jee" | "cuet" | "ipmat";

const exams: { key: ExamKey; label: string; full: string }[] = [
  { key: "neet", label: "NEET", full: "NEET (Medical)" },
  { key: "jee", label: "JEE", full: "JEE Main & Advanced" },
  { key: "cuet", label: "CUET", full: "CUET (UG)" },
  { key: "ipmat", label: "IPMAT", full: "IPMAT (IIM)" },
];

// Honest trust signals for the hero — real product facts, not invented
// numbers. Reuses ShieldCheck / Users / Globe, which were imported but
// previously unused anywhere in this file.
const heroTrustPoints = [
  { icon: ShieldCheck, text: "Exam-accurate CBT interface" },
  { icon: Users, text: "Mentors who've actually cleared these exams" },
  { icon: Globe, text: "Built for NEET · JEE · CUET · IPMAT" },
];

// ---------------------------------------------
// Scroll-reveal motion device
// ---------------------------------------------
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------
// Navigation config
// ---------------------------------------------
type NavLink =
  | { label: string; type: "anchor"; href: string }
  | { label: string; type: "route"; to: string };

const navLinks: NavLink[] = [
  { label: "CBT Simulator", type: "anchor", href: "#simulator" },
  { label: "Mentors", type: "anchor", href: "#mentors" },
  { label: "Features", type: "anchor", href: "#features" },
  { label: "Why Edurack", type: "anchor", href: "#about" },
  { label: "Connect", type: "anchor", href: "#connect" },
  { label: "Join as Mentor", type: "anchor", href: "#marketplace" },
  { label: "Contact", type: "route", to: "/contact" },
];

// ---------------------------------------------
// Social Links Configuration
// ---------------------------------------------
const socialLinks = [
  {
    name: "LinkedIn",
    description: "Founder updates & corporate networking",
    href: "https://www.linkedin.com/company/edurack",
    icon: Linkedin,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    name: "Threads",
    description: "Real-time updates & platform discussions",
    href: "https://threads.net/@edurack.in",
    icon: AtSign,
    color: "text-slate-900 dark:text-slate-100",
    bg: "bg-slate-500/10",
  },
  {
    name: "YouTube",
    description: "CBT walkthroughs & strategy guides",
    href: "https://youtube.com/@edurack",
    icon: Youtube,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
  {
    name: "Instagram",
    description: "Student updates & mentor reels",
    href: "https://instagram.com/edurack.in",
    icon: Instagram,
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    name: "X (Twitter)",
    description: "Tech announcements & build updates",
    href: "https://x.com/edurack_",
    icon: Twitter,
    color: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-500/10",
  },
  {
    name: "Reddit",
    description: "Community strategy & discussions",
    href: "https://www.reddit.com/user/Edurack/",
    icon: MessageSquare,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
  },
];

function Index() {
  // Inject Organization Schema & Favicon tags dynamically
  useEffect(() => {
    // 1. Organization JSON-LD Schema
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      "name": "Edurack Web",
      "alternateName": "EDURACK.IN",
      "url": "https://www.edurack.in",
      "logo": "https://www.edurack.in/edurack-logo.webp",
      "foundingDate": "2026-09-10",
      "founder": [
        {
          "@type": "Person",
          "name": "Vishal Sharma",
          "jobTitle": "Co-Founder",
          "sameAs": ["https://www.linkedin.com/in/vishal-sharma-a59bb2370/"]
        },
         {
          "@type": "Person",
          "name": "Tarun Yadav",
          "jobTitle": "Co-Founder",
          "sameAs": ["https://www.linkedin.com/in/tarun-yadav-37094337b/"]
        },
        {
          "@type": "Person",
          "name": "Archita Priyadarshinee",
          "jobTitle": "Co-Founder",
          "sameAs": ["https://www.linkedin.com/in/archita-priyadarshinee-behuria-a01323335/"]
        }
      ],
      "description": "Edurack (edurack.in) is an independent web application founded by Vishal Sharma, Tarun Yadav and Archita Priyadarshinee, delivering CBT simulators and mentor marketplaces for NEET, JEE, CUET, and IPMAT aspirants. Launched 10 September 2026.",
      "sameAs": [
        "https://www.edurack.in",
        "https://www.linkedin.com/company/edurack",
        "https://threads.net/@edurack.in",
        "https://youtube.com/@edurack",
        "https://instagram.com/edurack.in",
        "https://x.com/edurack_",
        "https://www.reddit.com/user/Edurack/"
      ]
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(schemaData);
    document.head.appendChild(script);

    // 2. Dynamic Favicon Link Injection
    const faviconIco = document.createElement("link");
    faviconIco.rel = "icon";
    faviconIco.type = "image/x-icon";
    faviconIco.href = "https://www.edurack.in/favicon.ico";
    document.head.appendChild(faviconIco);

    const faviconPng = document.createElement("link");
    faviconPng.rel = "icon";
    faviconPng.type = "image/png";
    faviconPng.setAttribute("sizes", "48x48");
    faviconPng.href = "https://www.edurack.in/favicon-48x48.png";
    document.head.appendChild(faviconPng);

    // Cleanup when component unmounts
    return () => {
      document.head.removeChild(script);
      document.head.removeChild(faviconIco);
      document.head.removeChild(faviconPng);
    };
  }, []);

  return (
    <div className="min-h-screen scroll-smooth">
      {/* Hero-only keyframes (slow float + shifting gradient text). Scoped
          via a plain <style> tag rather than a global stylesheet edit,
          since this file can't touch globals.css directly. prefers-reduced-motion
          is respected by disabling the animations outright. */}
      <style>{`
        @keyframes edu-float-a { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(12px, -18px); } }
        @keyframes edu-float-b { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-14px, 14px); } }
        @keyframes edu-float-c { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(8px, -10px) rotate(6deg); } }
        @keyframes edu-gradient-x { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .edu-anim-float-a { animation: edu-float-a 7s ease-in-out infinite; }
        .edu-anim-float-b { animation: edu-float-b 8.5s ease-in-out infinite; }
        .edu-anim-float-c { animation: edu-float-c 6s ease-in-out infinite; }
        .edu-anim-gradient { background-size: 200% auto; animation: edu-gradient-x 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .edu-anim-float-a, .edu-anim-float-b, .edu-anim-float-c, .edu-anim-gradient { animation: none; }
        }
      `}</style>
      <Header />
      <main>
        <Hero />
        <SimulatorSection />
        <ScoreStorySection />
        <MentorShowcase />
        <FeaturesGrid />
        <WhyEdurackSection />
        <MarketplaceBanner />
        <SocialLinksSection />
      </main>
      <Footer />
    </div>
  );
}

function NavItem({ link, onClick }: { link: NavLink; className?: string; onClick?: () => void }) {
  const className =
    "relative rounded-full px-4 py-2 text-sm font-medium text-foreground/70 transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground";

  if (link.type === "route") {
    return (
      <Link to={link.to} onClick={onClick} className={className}>
        {link.label}
      </Link>
    );
  }

  return (
    <a href={link.href} onClick={onClick} className={className}>
      {link.label}
    </a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // FIX (forced reflow audit): reading window.scrollY itself is cheap, but
    // calling setScrolled() on *every* scroll event forces a React re-render
    // (and therefore a style recalculation) tied 1:1 to scroll position.
    // Coalescing updates into a single requestAnimationFrame per frame avoids
    // scheduling more layout/style work than the browser can keep up with,
    // which is the usual cause of "forced reflow" / long scroll-handler
    // warnings from an otherwise-innocent scroll listener like this one.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
      <div
        className={`clay-sm mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 transition-shadow duration-300 sm:px-6 ${
          scrolled ? "shadow-md" : ""
        }`}
      >
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <img
            src="/edurack-logo.webp"
            alt="EDURACK"
            width={160}
            height={160}
            className="h-10 w-auto shrink-0 object-contain sm:h-12"
          />
          <span className="truncate font-display text-xl font-bold tracking-tight text-foreground">EDURACK</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <NavItem key={l.label} link={l} />
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/auth"
            className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/70 underline decoration-transparent decoration-2 underline-offset-4 transition-all duration-200 hover:text-foreground hover:decoration-current"
          >
            Login
          </Link>
          <Link
            to="/auth"
            className={`group inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 ${PRIMARY_CTA}`}
          >
            Sign Up Free
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          className="clay-btn-ghost grid h-10 w-10 place-items-center transition-transform duration-200 active:scale-90 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <span className="relative h-5 w-5">
            <Menu
              className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${
                open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
              }`}
            />
            <X
              className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${
                open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
              }`}
            />
          </span>
        </button>
      </div>

      <div
        className={`mx-auto max-w-7xl overflow-hidden transition-all duration-300 ease-out md:hidden ${
          open ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="clay-sm p-4">
          <nav className="flex flex-col gap-1">
            {navLinks.map((l) => (
              <NavItem key={l.label} link={l} onClick={() => setOpen(false)} />
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                className="clay-btn-ghost px-4 py-2.5 text-center text-sm font-semibold"
              >
                Login
              </Link>
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                className={`rounded-full px-4 py-2.5 text-center text-sm font-bold ${PRIMARY_CTA}`}
              >
                Sign Up Free
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [activeExam, setActiveExam] = useState<ExamKey>("neet");

  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pt-28">
      {/* Animated background — same sky/teal palette used elsewhere on the
          page, just given slow independent drift so the hero feels alive
          rather than static. Purely decorative: aria-hidden, and disabled
          under prefers-reduced-motion via the .edu-anim-* classes above. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="edu-anim-float-a absolute -top-24 left-[8%] h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="edu-anim-float-b absolute top-1/4 right-[6%] h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="edu-anim-float-a absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-orange-300/10 blur-3xl" />

        {/* Small floating trust glyphs — desktop only, purely decorative */}
        <div className="edu-anim-float-c absolute left-[12%] top-[22%] hidden lg:block">
          <div className="clay-sm flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 dark:bg-white/5">
            <GraduationCap className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
        </div>
        <div className="edu-anim-float-b absolute right-[14%] top-[16%] hidden lg:block">
          <div className="clay-sm flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 dark:bg-white/5">
            <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
        </div>
        <div className="edu-anim-float-c absolute bottom-[18%] right-[10%] hidden lg:block">
          <div className="clay-sm flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 dark:bg-white/5">
            <ShieldCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl text-center">
        <Reveal>
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 sm:text-sm">
            <Sparkles className="h-4 w-4 animate-pulse" />
            {LAUNCH_DATE_LABEL} · edurack.in
          </div>
        </Reveal>

        <Reveal delay={60}>
          <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-2">
            {exams.map((e) => (
              <button
                key={e.key}
                onClick={() => setActiveExam(e.key)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${
                  activeExam === e.key
                    ? "clay-btn scale-105 text-white"
                    : "clay-chip text-foreground/60 hover:scale-105 hover:text-foreground"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <h1 className="fluid-h1 mt-6 text-balance font-display font-extrabold tracking-tight text-foreground">
            Take the Test. Know Your Weaknesses.{" "}
            <span className="edu-anim-gradient bg-gradient-to-r from-sky-500 via-teal-400 to-sky-500 bg-clip-text text-transparent">
              Find the Right Mentor.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="fluid-body mx-auto mt-6 max-w-2xl text-muted-foreground">
            Edurack helps NEET, JEE, CUET and IPMAT aspirants practice with realistic mock tests,
            understand their performance, and connect with mentors who have already walked the path
            they're preparing for.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/simulator/live"
              className={`group inline-flex items-center gap-2 rounded-full px-7 py-4 text-base font-bold transition-all duration-200 sm:text-lg ${PRIMARY_CTA}`}
            >
              Take a Free Mock
              <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a
              href="#mentors"
              className="clay-btn-ghost px-6 py-4 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 sm:text-base"
            >
              Find a Mentor
            </a>
          </div>
        </Reveal>

        {/* Honest trust row — real product facts, not invented numbers. */}
        <Reveal delay={340}>
          <div className="mx-auto mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {heroTrustPoints.map((t) => (
              <span key={t.text} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
                <t.icon className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                {t.text}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={380}>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:mx-auto sm:max-w-2xl sm:grid-cols-4">
            {[
              { k: "4", v: "Exams Covered" },
              { k: "1:1", v: "CBT Interfaces" },
              { k: "Open", v: "Mentor Market" },
              { k: "2027", v: "NEET CBT Ready" },
            ].map((s) => (
              <div
                key={s.k}
                className="clay-sm px-3 py-4 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="font-display text-xl font-bold text-foreground sm:text-2xl">{s.k}</div>
                <div className="text-xs text-muted-foreground sm:text-sm">{s.v}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={440} className="mt-12 hidden sm:block">
          <a href="#simulator" aria-label="Scroll to explore" className="inline-flex flex-col items-center gap-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-widest">Explore</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

// FIX: lightweight, non-spinner fallback for the lazy-loaded simulator so
// the section still reserves its box (no layout shift) while the chunk
// downloads. Kept intentionally simple/static — no animation, no JS.
function CbtSimulatorFallback() {
  return (
    <div className="clay mx-auto flex h-[420px] max-w-4xl items-center justify-center p-8 text-center">
      <p className="text-sm text-muted-foreground">Loading the CBT simulator…</p>
    </div>
  );
}

function SimulatorSection() {
  return (
    <section id="simulator" className="px-4 py-16 sm:px-6 lg:py-24">
      <Reveal className="mx-auto max-w-6xl text-center">
        <div className="clay-chip inline-flex px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
          THE EDURACK TESTING ENGINE
        </div>
        <h2 className="fluid-h2 mx-auto mt-4 max-w-3xl font-display font-extrabold text-foreground">
          Train your muscle memory for exam-day screens.
        </h2>
        <p className="fluid-body mx-auto mt-3 max-w-2xl text-muted-foreground">
          Practice in an exam-like environment with question navigation, section controls, flags and
          palettes designed around the real testing experience.
        </p>
      </Reveal>
      <Reveal delay={120} className="mt-10">
        {/* FIX: was a static top-level import; now code-split via React.lazy
            above so its JS only downloads once this section is about to be
            shown, instead of shipping in the initial bundle. */}
        <Suspense fallback={<CbtSimulatorFallback />}>
          <CbtSimulator />
        </Suspense>
      </Reveal>

      <Reveal delay={180} className="mx-auto mt-10 max-w-2xl text-center">
        <p className="fluid-body font-display text-lg font-bold text-foreground">
          Your mock doesn't end when you submit.
        </p>
        <p className="mt-2 text-muted-foreground">
          Your result helps you understand where you're losing marks, what needs improvement, and what
          to focus on next.
        </p>
        <Link
          to="/simulator/live"
          className="clay-btn mt-6 inline-flex items-center gap-2 px-6 py-3 text-sm font-bold transition-transform duration-200 hover:-translate-y-0.5"
        >
          Take a Free Mock
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Reveal>

      <Reveal delay={220} className="mx-auto mt-12 max-w-2xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Example performance report
        </p>
        <div className="clay mt-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">
                400 <span className="text-lg font-semibold text-muted-foreground">/ 720</span>
              </div>
              <p className="text-sm text-muted-foreground">Your score on this mock</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            {[
              { subject: "Physics", status: "Needs Attention", tone: "bg-red-500/15 text-red-600 dark:text-red-400" },
              { subject: "Chemistry", status: "Strong", tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
              { subject: "Biology", status: "Moderate", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
            ].map((row) => (
              <div
                key={row.subject}
                className="clay-sm flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-semibold text-foreground">{row.subject}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.tone}`}>{row.status}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended focus
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground/80">
              <li>Physics → Mechanics</li>
              <li>Biology → Plant Physiology</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <p className="text-sm font-semibold text-foreground">Need help improving?</p>
            <a
              href="#mentors"
              className="clay-btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-transform duration-200 hover:-translate-y-0.5"
            >
              Explore mentors who can help <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------
// New: bridges the simulator into the mentor marketplace by walking the
// student through the Measure -> Diagnose -> Improve funnel that the rest
// of the product is built around.
// ---------------------------------------------
const scoreStorySteps = [
  {
    n: "01",
    icon: Target,
    title: "Measure",
    desc: "Take a realistic mock and see where you stand.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/15",
  },
  {
    n: "02",
    icon: Activity,
    title: "Diagnose",
    desc: "Understand your score, accuracy and subject-wise weaknesses.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/15",
  },
  {
    n: "03",
    icon: TrendingUp,
    title: "Improve",
    desc: "Get relevant guidance and mentorship based on what you need to work on.",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/15",
  },
];

function ScoreStorySection() {
  return (
    <section className="bg-secondary/40 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="fluid-h2 font-display font-extrabold text-foreground">
            Your Score Tells a Story. We Help You Read It.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {scoreStorySteps.map((step, i) => (
            <Reveal key={step.title} delay={i * 100}>
              <div className="clay h-full p-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${step.bg}`}
                  >
                    <step.icon className={`h-6 w-6 ${step.color}`} />
                  </div>
                  <span className="font-display text-2xl font-extrabold text-foreground/20">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={220} className="mt-10 text-center">
          <Link
            to="/simulator/live"
            className="clay-btn inline-flex items-center gap-2 px-6 py-3 text-sm font-bold transition-transform duration-200 hover:-translate-y-0.5"
          >
            Take your first free mock
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------
// Real mentor directory. The list itself is deferred/streamed (see the
// loader on Route above) — <Suspense>/<Await> below resolve the promise
// as it settles, without ever blocking the hero/hero-adjacent sections
// that stream ahead of it. The <Suspense fallback> is real static markup
// (not a spinner), so even a crawler snapshot taken before the DB query
// resolves still sees meaningful page content in this section.
// ---------------------------------------------
type LandingMentor = {
  id: string;
  name: string;
  // FIX: this can legitimately be null in the DB (see the mentor doc with
  // profilePictureUrl: null) — was previously typed as `string`, which hid
  // the missing-avatar case from the type checker entirely.
  profilePictureUrl: string | null;
  yearOfStudy: string;
  aiimsIitRank: string;
  // Expertise Showcase — admin-set (see updateMentorLockedInfo in
  // mentor-auth.ts). Only expertAt is shown on this card; whyExpertAt and
  // the score live on the full mentor profile page, one click away.
  expertAt: string;
  batches: { id: string; name: string; track: string; exam: string }[];
};

function MentorShowcase() {
  const { mentorsPromise } = Route.useLoaderData();

  return (
    <section id="mentors" className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="fluid-h2 font-display font-extrabold text-foreground">
            Don't Just Follow Advice. Learn From Someone Who Has Done It.
          </h2>
          <p className="fluid-body mt-3 text-muted-foreground">
            Explore mentors who have already cleared the exams you're preparing for and choose
            mentorship based on your goals, needs and budget.
          </p>
        </Reveal>

        <Suspense fallback={<MentorsFallback />}>
          <Await promise={mentorsPromise}>
            {(mentors) => <MentorsResolved mentors={mentors} />}
          </Await>
        </Suspense>
      </div>
    </section>
  );
}

// Static fallback shown while the mentor query is still in flight. Real,
// meaningful copy — not a spinner — so this section is never an empty
// shell in the initial/streamed HTML.
function MentorsFallback() {
  return (
    <Reveal delay={80} className="mt-12">
      <div className="clay mx-auto max-w-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Mentors who have cleared NEET, JEE, CUET and IPMAT are running live batches on
          EDURACK — loading the current roster now.
        </p>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------
// FIX: initials-avatar fallback for mentors without a profilePictureUrl.
// Previously MentorAvatar always rendered <img src={src}>, so a null/empty
// profilePictureUrl (very common — see the sample mentor doc) produced a
// broken image icon instead of a graceful fallback. This was likely what
// looked like the mentor's "name and profile not showing" — the broken
// <img> next to the text was the actual visual problem, not missing text.
// ---------------------------------------------
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color pick so the same mentor always gets the same
// avatar background instead of a different random one on every render.
const AVATAR_COLORS = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// FIX (image sizing, kept from before): explicit width/height on the real
// <img> path still reserves the 56x56 box before the image downloads, so
// there's no layout shift once a real profilePictureUrl does load.
function MentorAvatar({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <div
        className={`clay-sm grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${getAvatarColor(
          name,
        )}`}
        role="img"
        aria-label={name}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div className="clay-sm h-14 w-14 shrink-0 overflow-hidden rounded-full">
      <img
        src={src}
        alt={name}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function MentorsResolved({ mentors }: { mentors: LandingMentor[] }) {
  if (mentors.length === 0) {
    return (
      <Reveal delay={80} className="mt-12">
        <div className="clay mx-auto max-w-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Mentors are being onboarded right now — check back shortly to meet the rankers running
            batches on EDURACK.
          </p>
        </div>
      </Reveal>
    );
  }

  return (
    <>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mentors.map((m, i) => (
          <Reveal key={m.id} delay={i * 90}>
            <div className="clay flex h-full flex-col justify-between p-5 transition-transform duration-300 hover:-translate-y-1">
              <div>
                <div className="flex items-center gap-3">
                  <MentorAvatar src={m.profilePictureUrl} name={m.name} />
                  <div className="min-w-0">
                    <h3 className="truncate font-display font-bold text-foreground">{m.name}</h3>
                    <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      {m.aiimsIitRank && (
                        <span className="inline-flex items-center gap-1">
                          <Award className="h-3 w-3" />
                          {m.aiimsIitRank}
                        </span>
                      )}
                      {m.yearOfStudy && (
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          {m.yearOfStudy}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Expertise Showcase — subject chip, admin-set. Sits above
                    the batches list so a visitor scanning cards sees what
                    each mentor specializes in before the batch names. */}
                {m.expertAt?.trim() && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--sky-deep)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Award className="h-3 w-3" />
                    Expert in {m.expertAt}
                  </div>
                )}

                {m.batches.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Layers3 className="h-3 w-3" />
                      Batches
                    </p>
                    <ul className="space-y-1.5">
                      {m.batches.map((b) => (
                        <li key={b.id} className="clay-chip px-3 py-1.5 text-xs font-semibold text-foreground/80">
                          {b.name} · {b.exam.toUpperCase()} · {b.track}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <Link
                to="/mentor-profile/$mentorId"
                params={{ mentorId: m.id }}
                className="clay-btn-ghost mt-4 inline-flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold transition-transform duration-200 hover:-translate-y-0.5"
              >
                View Full Profile <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={mentors.length * 90 + 60} className="mt-12">
        <div className="clay mx-auto flex max-w-2xl flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">
              Not sure which mentor is right for you?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Take a free mock and let your performance guide your next step.
            </p>
          </div>
          <Link
            to="/simulator/live"
            className="clay-btn inline-flex shrink-0 items-center gap-2 px-6 py-3 text-sm font-bold transition-transform duration-200 hover:-translate-y-0.5"
          >
            Take Free Mock
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </>
  );
}

const features = [
  {
    icon: MonitorPlay,
    title: "Realistic Exam Practice",
    desc: "Experience an exam-like environment before the actual exam.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/15",
  },
  {
    icon: LayoutDashboard,
    title: "Performance Tracking",
    desc: "Track your preparation across tests and topics.",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/15",
  },
  {
    icon: CalendarCheck,
    title: "Mentor Marketplace",
    desc: "Find mentors who can help you work on the areas that matter.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/15",
  },
  {
    icon: LineChart,
    title: "Performance Analytics",
    desc: "Understand your accuracy, speed, subject-wise performance and areas that need more attention.",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/15",
  },
];

function FeaturesGrid() {
  return (
    <section id="features" className="bg-secondary/40 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="fluid-h2 font-display font-extrabold text-foreground">
            Everything You Need to Know Where You Stand.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div className="clay group h-full p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
                <div
                  className={`grid h-14 w-14 place-items-center rounded-2xl ${f.bg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
                >
                  <f.icon className={`h-7 w-7 ${f.color}`} />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="clay mt-16 grid grid-cols-1 items-center gap-6 p-8 md:grid-cols-[1fr_auto] md:p-12">
            <div>
              <h3 className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                Launch your first CBT mock right now.
              </h3>
              <p className="mt-2 text-muted-foreground">
                NEET, JEE, CUET, or IPMAT — pick your exam and get ahead of the curve today.
              </p>
            </div>
            <Link
              to="/simulator/live"
              className={`inline-flex items-center gap-2 justify-self-start rounded-full px-7 py-4 text-base font-bold transition-all duration-200 md:justify-self-end ${PRIMARY_CTA}`}
            >
              Try Free Mock Test <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------
// "Why Edurack" — brand story section. Sits later in the page now that the
// funnel (mock -> analytics -> mentors) has already made the case; the
// corporate identity details (founders, domain, entity type) live in the
// footer instead, where they belong for SEO without slowing the pitch.
// ---------------------------------------------
const whyEdurackFlow = ["Practice", "Analyze", "Get Guided", "Improve"];

function WhyEdurackSection() {
  return (
    <section id="about" className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <h2 className="fluid-h2 font-display font-extrabold text-foreground">Why Edurack?</h2>
          <p className="fluid-body mx-auto mt-4 max-w-2xl text-muted-foreground">
            Preparing for competitive exams isn't just about taking more tests or watching more
            lectures. You need to know where you stand, what you need to improve, and who can help you
            get there.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {whyEdurackFlow.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div className="clay-chip px-4 py-2 text-sm font-semibold text-foreground/80">
                  {step}
                </div>
                {i < whyEdurackFlow.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-foreground/30" />
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------
// Social Links UI Section
// ---------------------------------------------
function SocialLinksSection() {
  return (
    <section id="connect" className="bg-secondary/40 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="clay-chip inline-flex px-4 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
            CONNECT WITH US
          </div>
          <h2 className="fluid-h2 mt-4 font-display font-extrabold text-foreground">
            Follow EDURACK Across Platforms
          </h2>
          <p className="fluid-body mt-3 text-muted-foreground">
            Connect directly with our co-founders and official community channels to follow product releases and exam strategy tips.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {socialLinks.map((s, i) => (
            <Reveal key={s.name} delay={i * 70}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="clay group flex h-full items-start gap-4 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${s.bg} transition-transform duration-300 group-hover:scale-110`}
                >
                  <s.icon className={`h-6 w-6 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 font-display font-bold text-foreground group-hover:text-sky-600 dark:group-hover:text-sky-400">
                    {s.name}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {s.description}
                  </p>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketplaceBanner() {
  return (
    <section id="marketplace" className="px-4 py-16 sm:px-6 lg:py-24">
      <Reveal className="mx-auto max-w-6xl">
        <div className="clay relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white md:p-14">
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-teal-300 backdrop-blur-sm">
              <UserCheck className="h-3.5 w-3.5" />
              Founding Mentor Community
            </div>
            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              You Cleared the Exam. Now Help Someone Else Clear It.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Turn your experience into structured mentorship. Create your own batch, choose your
              pricing and guide students through Edurack.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">You decide</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  <li>Your batch.</li>
                  <li>Your price.</li>
                  <li>Your teaching style.</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Edurack handles</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  <li>Platform.</li>
                  <li>Student enrollment.</li>
                  <li>Payments.</li>
                  <li>Batch infrastructure.</li>
                  <li>Discovery and promotion.</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-start gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-teal-300">
                Founding 25
              </span>
              <Link
                to="/join-mentor"
                preload="viewport"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-teal-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-md transition-transform duration-200 hover:-translate-y-0.5 hover:opacity-95"
              >
                Become a Founding Mentor <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------
// Footer
// ---------------------------------------------
type FooterLink =
  | { label: string; type: "route"; to: string }
  | { label: string; type: "external"; href: string };

const footerColumns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "CBT Simulator", type: "route", to: "/simulator/live" },
      { label: "Syllabus Trackers", type: "route", to: "/dashboard" },
      { label: "Analytics", type: "route", to: "/dashboard" },
      { label: "Mentors", type: "route", to: "/join-mentor" },
    ],
  },
  {
    title: "Aspirants",
    links: [
      { label: "NEET · JEE · CUET · IPMAT Hub", type: "route", to: "/" },
      { label: "Free Papers", type: "route", to: "/simulator/live" },
      { label: "Contact Us", type: "route", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", type: "route", to: "/legal/terms" },
      { label: "Privacy", type: "route", to: "/legal/privacy" },
      { label: "Refund", type: "route", to: "/legal/refund" },
      { label: "Contact", type: "route", to: "/contact" },
    ],
  },
];

function Footer() {
  return (
    <footer className="px-4 pb-8 pt-10 sm:px-6">
      <div className="clay-sm mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/edurack-logo.webp"
                alt="EDURACK"
                width={160}
                height={160}
                className="h-10 w-auto shrink-0 object-contain sm:h-12"
              />
              <span className="font-display text-lg font-bold text-foreground">EDURACK</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              <strong className="text-foreground">edurack.in</strong> is an independent web platform
              dedicated to pixel-exact CBT simulators and structured mentorship for NEET, JEE, CUET &amp;
              IPMAT aspirants.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Founded by Vishal Sharma, Tarun Yadav and Archita Priyadarshinee. {LAUNCH_DATE_LABEL}. All
              official listings and analytics are hosted exclusively on <strong className="text-foreground">www.edurack.in</strong>.
            </p>
          </div>
          {footerColumns.map((col) => (
            <FooterCol key={col.title} title={col.title} links={col.links} />
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} EDURACK (edurack.in). All rights reserved.</span>
          <span>{LAUNCH_DATE_LABEL} · Built for India's toughest entrance exams.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div className="font-display text-sm font-bold text-foreground">{title}</div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {links.map((l) => (
          <li key={l.label}>
            {l.type === "route" ? (
              <Link to={l.to} className="transition-colors duration-200 hover:text-foreground">
                {l.label}
              </Link>
            ) : (
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 hover:text-foreground"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}