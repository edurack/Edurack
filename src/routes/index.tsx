import { createFileRoute, Link, Await } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
  IconBriefcase as Briefcase,
} from "@tabler/icons-react";
import { listMentorsForLanding } from "@/server-functions/catalog";
import { listPublishedPosts } from "@/server-functions/blog-public";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { PublicBlogPostSummary } from "@/lib/blog-types";
import { MotionConfig, motion, useMotionValueEvent, useScroll } from "motion/react";
import { HeroMotion, PREMIUM_BTN, GHOST_BTN } from "@/components/landing/HeroMotion";

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
      // Same streamed-promise pattern as mentors above: the homepage shell
      // ships immediately and the blog rail resolves in behind it, rather
      // than blocking FCP on a Mongo round trip nothing above the fold needs.
      postsPromise: listPublishedPosts({ data: { page: 1 } }).then(
        (res) => res.posts.slice(0, 3),
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
const PRIMARY_CTA = PREMIUM_BTN;

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
  { label: "Blog", type: "route", to: "/blog" },
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
  const ctaRef = useRef<HTMLDivElement>(null);
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
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <Header />
        <main>
          <HeroMotion ctaRef={ctaRef} />
          <LoopSection />
          <SimulatorSection />
          <MentorShowcase />
          <FeaturesSection />
          <BlogShowcase />
          <MentorBanner />
          <CareersStrip />
          <FinalCta />
        </main>
        <Footer />
        <MobileDock ctaRef={ctaRef} />
      </div>
    </MotionConfig>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;
const INK = "bg-[#141b2b] text-white";
const WRAP = "mx-auto max-w-6xl px-4 sm:px-6";

function Rise({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Title({ light, bold, dark = false }: { light: string; bold: string; dark?: boolean }) {
  return (
    <h2 className={`font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl ${dark ? "text-white" : "text-foreground"}`}>
      <span className="block font-light">{light}</span>
      <span className="block font-extrabold">{bold}</span>
    </h2>
  );
}

const shownNav = navLinks.filter((l) => ["CBT Simulator", "Mentors", "Features", "Join as Mentor", "Blog", "Contact"].includes(l.label));

function NavItem({ link, onClick }: { link: NavLink; onClick?: () => void }) {
  const cls = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground";
  return link.type === "route" ? (
    <Link to={link.to} onClick={onClick} className={cls}>{link.label}</Link>
  ) : (
    <a href={link.href} onClick={onClick} className={cls}>{link.label}</a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className={`${WRAP} flex h-16 items-center justify-between gap-2`}>
        <Link to="/" className="flex items-center gap-2">
          <img src="/edurack-logo.webp" alt="EDURACK" width={160} height={160} className="h-9 w-auto object-contain" />
          <span className="font-display text-xl font-extrabold tracking-tight text-foreground max-[350px]:hidden">edurack</span>
        </Link>
        <nav className="hidden items-center lg:flex">
          {shownNav.map((l) => <NavItem key={l.label} link={l} />)}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            to="/auth"
            search={{ tab: "signin" }}
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-sm font-bold text-foreground/80 hover:text-foreground max-[360px]:hidden sm:px-3.5"
          >
            Log in
          </Link>
          <Link
            to="/auth"
            search={{ tab: "signup" }}
            className={`${PREMIUM_BTN} !min-h-11 !shrink-0 whitespace-nowrap !px-4 text-sm sm:!px-5`}
          >
            Sign up
          </Link>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-90 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <div className={`overflow-hidden border-border transition-all duration-300 lg:hidden ${open ? "max-h-96 border-t" : "max-h-0"}`}>
        <nav className={`${WRAP} flex flex-col py-2`}>
          {shownNav.map((l) => <NavItem key={l.label} link={l} onClick={() => setOpen(false)} />)}
        </nav>
      </div>
    </header>
  );
}

function MobileDock({ ctaRef }: { ctaRef: RefObject<HTMLDivElement | null> }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const node = ctaRef.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(node);
    return () => io.disconnect();
  }, [ctaRef]);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-3 pt-2 backdrop-blur-xl transition-transform duration-300 md:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="grid grid-cols-[1fr_1.5fr] gap-2">
        <Link to="/auth" search={{ tab: "signin" }} className={GHOST_BTN}>Log in</Link>
        <Link to="/auth" search={{ tab: "signup" }} className={PREMIUM_BTN}>Start free</Link>
      </div>
    </div>
  );
}

// ── Prep loop: scroll-linked, mirrors the carousel ─────────────────────────
const loop = [
  { k: "Practice", d: "Exam-format tests that feel like the real paper, not a worksheet." },
  { k: "Analyse", d: "Accuracy, speed and concept gaps: the story behind the score." },
  { k: "Get guided", d: "Mentors who have written the same exam and know what to cut." },
  { k: "Improve", d: "Fix the two things that matter, then test again, sharper." },
];

function LoopSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "end 0.55"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.max(0, Math.min(3, Math.floor(v * 4)))));

  return (
    <section className={`${INK} py-20 sm:py-28`}>
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[.9fr_1.1fr]`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Rise>
            <p className="text-lg text-white/60">We don't think prep should be</p>
            <p className="mt-2 font-display text-xl font-bold text-white/40 line-through decoration-white/40">Study → Mock → Score → Repeat</p>
            <h2 className="mt-8 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
              <span className="block font-light">This is</span>
              <span className="block font-extrabold">Edurack.</span>
            </h2>
            <p className="mt-5 max-w-sm text-white/60">Four steps, one place, built for people who want direction and not just another mock.</p>
          </Rise>
        </div>

        <div ref={ref} className="relative pl-8 sm:pl-10">
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-white/15" />
          <motion.div className="absolute left-[7px] top-2 w-px origin-top bg-[#7ba4f0]" style={{ scaleY: scrollYProgress, bottom: "0.5rem" }} />
          {loop.map((s, i) => (
            <div key={s.k} className="relative py-7 transition-opacity duration-500" style={{ opacity: i <= active ? 1 : 0.32 }}>
              <span className={`absolute -left-8 top-[2.15rem] h-[15px] w-[15px] rounded-full border-2 transition-colors duration-500 sm:-left-10 ${i <= active ? "border-[#7ba4f0] bg-[#7ba4f0]" : "border-white/30 bg-[#141b2b]"}`} />
              <span aria-hidden className="pointer-events-none absolute -top-2 right-0 select-none font-display text-8xl font-extrabold text-white/[0.05] sm:text-9xl">0{i + 1}</span>
              <h3 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{s.k}</h3>
              <p className="mt-2 max-w-md text-base leading-relaxed text-white/60">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Simulator + sample report ──────────────────────────────────────────────
function CbtSimulatorFallback() {
  return <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border text-sm text-muted-foreground">Loading the CBT simulator…</div>;
}

function SimulatorSection() {
  const rows = [
    { s: "Physics", t: "Needs attention", c: "text-rose-600 dark:text-rose-400", w: 46 },
    { s: "Chemistry", t: "Strong", c: "text-emerald-600 dark:text-emerald-400", w: 78 },
    { s: "Biology", t: "Moderate", c: "text-amber-600 dark:text-amber-400", w: 61 },
  ];
  return (
    <section id="simulator" className="py-20 sm:py-28">
      <div className={WRAP}>
        <Rise className="max-w-2xl">
          <Title light="Train for the screen" bold="you'll face on exam day." />
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Question palette, section controls, flags and timers, laid out like the real paper. Try the interface right here.</p>
        </Rise>
        <Rise delay={0.1} className="mt-10">
          <Suspense fallback={<CbtSimulatorFallback />}><CbtSimulator /></Suspense>
        </Rise>

        <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:items-center">
          <Rise>
            <h3 className="font-display text-3xl tracking-tight sm:text-4xl"><span className="font-light">Your mock doesn't end</span> <span className="font-extrabold">when you submit.</span></h3>
            <p className="mt-4 max-w-md text-muted-foreground">See where you lose marks and what to work on next, then get matched with someone who can help.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/simulator/live" className={PREMIUM_BTN}>Take a free mock <ArrowRight className="h-4 w-4" /></Link>
              <a href="#mentors" className={GHOST_BTN}>Find a mentor</a>
            </div>
          </Rise>
          <Rise delay={0.1}>
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold text-muted-foreground">Sample performance report</p>
              <div className="mt-2 font-display text-5xl font-extrabold">400<span className="text-xl font-medium text-muted-foreground"> / 720</span></div>
              <div className="mt-6 space-y-4">
                {rows.map((r, i) => (
                  <div key={r.s}>
                    <div className="mb-1.5 flex justify-between text-sm font-semibold"><span>{r.s}</span><span className={r.c}>{r.t}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} whileInView={{ width: `${r.w}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2 + i * 0.12, ease: EASE }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">Focus next: <b className="text-foreground">Physics → Mechanics</b>, <b className="text-foreground">Biology → Plant Physiology</b></p>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}

// ── Mentors (real data, streamed) ──────────────────────────────────────────
type LandingMentor = {
  id: string; name: string; profilePictureUrl: string | null; yearOfStudy: string; aiimsIitRank: string; expertAt: string;
  batches: { id: string; name: string; track: string; exam: string }[];
};

function getInitials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function MentorAvatar({ src, name }: { src: string | null; name: string }) {
  if (!src) return <div role="img" aria-label={name} className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">{getInitials(name)}</div>;
  return <img src={src} alt={name} width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-full object-cover" />;
}

function MentorShowcase() {
  const { mentorsPromise } = Route.useLoaderData();
  return (
    <section id="mentors" className="border-y border-border bg-secondary/50 py-20 sm:py-28">
      <div className={WRAP}>
        <Rise className="max-w-2xl">
          <Title light="Learn from someone" bold="who has done it." />
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Mentors who cleared the exam you're preparing for. Pick one by goal, need and budget.</p>
        </Rise>
        <Suspense fallback={<p className="mt-10 text-muted-foreground">Loading the current mentor roster…</p>}>
          <Await promise={mentorsPromise}>{(mentors) => <MentorsResolved mentors={mentors} />}</Await>
        </Suspense>
      </div>
    </section>
  );
}

function MentorsResolved({ mentors }: { mentors: LandingMentor[] }) {
  if (!mentors.length) return <p className="mt-10 rounded-2xl border border-dashed border-border p-8 text-muted-foreground">Mentors are being onboarded right now. Check back shortly.</p>;
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mentors.map((m, i) => (
        <Rise key={m.id} delay={(i % 3) * 0.08}>
          <Link to="/mentor-profile/$mentorId" params={{ mentorId: m.id }} className="group flex h-full flex-col rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary">
            <div className="flex items-center gap-3">
              <MentorAvatar src={m.profilePictureUrl} name={m.name} />
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-bold">{m.name}</h3>
                <p className="flex flex-wrap gap-x-3 text-xs font-medium text-muted-foreground">
                  {m.aiimsIitRank && <span className="inline-flex items-center gap-1"><Award className="h-3 w-3" />{m.aiimsIitRank}</span>}
                  {m.yearOfStudy && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" />{m.yearOfStudy}</span>}
                </p>
              </div>
            </div>
            {m.expertAt.length > 0 && (
              <p className="mt-4 text-sm font-semibold text-primary">Expert in {m.expertAt}</p>
            )}
            {m.batches.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {m.batches.map((b) => <li key={b.id} className="truncate">{b.name} · {b.exam.toUpperCase()} · {b.track}</li>)}
              </ul>
            )}
            <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold text-foreground">View profile <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
        </Rise>
      ))}
    </div>
  );
}

// ── Features ───────────────────────────────────────────────────────────────
const featureList = [
  { icon: MonitorPlay, t: "Realistic exam practice", d: "An exam-like environment before the actual exam.", span: "lg:col-span-2" },
  { icon: LineChart, t: "Performance analytics", d: "Accuracy, speed and subject-wise gaps after every test.", span: "" },
  { icon: LayoutDashboard, t: "Progress tracking", d: "See your preparation across tests and topics.", span: "" },
  { icon: CalendarCheck, t: "Mentor marketplace", d: "Batches and sessions from mentors who cleared it, including free sessions.", span: "lg:col-span-2" },
];
const alsoOn = ["Lecture library", "Free mentor sessions", "Certificate verification", "Support tickets", "NEET · JEE · CUET · IPMAT"];

function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className={WRAP}>
        <Rise className="max-w-2xl"><Title light="Everything to know" bold="where you stand." /></Rise>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featureList.map((f, i) => (
            <Rise key={f.t} delay={i * 0.07} className={f.span}>
              <div className="group h-full rounded-3xl border border-border p-6 transition-colors hover:bg-secondary/60 sm:p-8">
                <f.icon className="h-7 w-7 text-primary" stroke={1.6} />
                <h3 className="mt-10 font-display text-xl font-bold">{f.t}</h3>
                <p className="mt-2 max-w-sm text-muted-foreground">{f.d}</p>
              </div>
            </Rise>
          ))}
        </div>
        <Rise className="mt-8 flex flex-wrap gap-2">
          {alsoOn.map((a) => <span key={a} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground/80">{a}</span>)}
        </Rise>
      </div>
    </section>
  );
}

// ── Blog (real data, streamed) ──────────────────────────────────────────────
// The homepage previously linked nowhere in the site to /blog or any post —
// no header link, no section, no footer link. Crawlers largely find pages
// by following links from already-indexed, frequently-crawled pages, and
// the homepage is that page here. Being in sitemap.xml alone doesn't carry
// the same weight, and gets crawled far less often. This section, plus the
// header/footer links added elsewhere in this file, give Google (and users)
// an actual path from "/" into the blog.
function BlogShowcase() {
  const { postsPromise } = Route.useLoaderData();
  return (
    <section id="blog" className="border-y border-border bg-secondary/50 py-20 sm:py-28">
      <div className={WRAP}>
        <Rise className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <Title light="Strategy and stories," bold="not just a product." />
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Exam strategy, mentor stories and platform updates for NEET, JEE, CUET and IPMAT aspirants.</p>
          </div>
          <Link to="/blog" preload="viewport" className={`${GHOST_BTN} shrink-0`}>Read the blog <ArrowRight className="h-4 w-4" /></Link>
        </Rise>
        <Suspense fallback={<p className="mt-10 text-muted-foreground">Loading recent posts…</p>}>
          <Await promise={postsPromise}>{(posts) => <BlogPostsResolved posts={posts} />}</Await>
        </Suspense>
      </div>
    </section>
  );
}

function BlogPostsResolved({ posts }: { posts: PublicBlogPostSummary[] }) {
  if (!posts.length) return null;
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p, i) => (
        <Rise key={p.id} delay={(i % 3) * 0.08}>
          <Link to="/blog/$slug" params={{ slug: p.slug }} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-primary">
            {p.coverImageUrl && (
              <img src={p.coverImageUrl} alt={p.coverImageAlt} loading="lazy" decoding="async" className="h-40 w-full object-cover" />
            )}
            <div className="flex flex-1 flex-col p-5">
              <span className="text-xs font-semibold text-primary">{BLOG_CATEGORY_LABELS[p.category]}</span>
              <h3 className="mt-2 font-display text-lg font-bold leading-snug">{p.title}</h3>
              {p.excerpt && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>}
              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold text-foreground">Read more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
          </Link>
        </Rise>
      ))}
    </div>
  );
}

// ── Mentor banner, careers, final CTA ──────────────────────────────────────
function MentorBanner() {
  return (
    <section id="marketplace" className={`${INK} py-20 sm:py-28`}>
      <div className={`${WRAP} grid gap-10 lg:grid-cols-2 lg:items-center`}>
        <Rise>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-[#7ba4f0]"><UserCheck className="h-4 w-4" /> Founding 25 mentors</p>
          <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"><span className="block font-light">You cleared the exam.</span><span className="block font-extrabold">Help someone clear it.</span></h2>
          <p className="mt-5 max-w-md text-white/60">Create your own batch, set your price and teach your way. Edurack handles the platform, enrolment and payments.</p>
          <Link to="/join-mentor" preload="viewport" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ffffff] px-6 text-[15px] font-bold text-[#141b2b] transition-transform active:scale-[.97] hover:-translate-y-0.5">Become a founding mentor <ArrowRight className="h-4 w-4" /></Link>
        </Rise>
        <Rise delay={0.1} className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/15 bg-white/15">
          {[["Your batch", "You decide"], ["Your price", "You decide"], ["Enrolment and payments", "Edurack handles"], ["Discovery and promotion", "Edurack handles"]].map(([a, b]) => (
            <div key={a} className="bg-[#141b2b] p-5"><p className="font-display font-bold">{a}</p><p className="mt-1 text-sm text-white/50">{b}</p></div>
          ))}
        </Rise>
      </div>
    </section>
  );
}

function CareersStrip() {
  return (
    <section id="careers" className={WRAP + " py-16"}>
      <Rise className="flex flex-col gap-5 rounded-3xl border border-border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Briefcase className="h-4 w-4" /> Careers</p>
          <h3 className="mt-1 font-display text-2xl font-extrabold">Build the question bank behind Edurack.</h3>
          <p className="mt-1 text-muted-foreground">Remote, flexible hours, offer letter and certificate. Takes two minutes to apply.</p>
        </div>
        <Link to="/join-intern" preload="viewport" className={`${GHOST_BTN} shrink-0`}>Apply to intern <ArrowRight className="h-4 w-4" /></Link>
      </Rise>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <Rise className={`${WRAP} text-center`}>
        <h2 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl"><span className="block font-light">Stop guessing.</span><span className="block font-extrabold">Start fixing.</span></h2>
        <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">Your first mock is free. See exactly where your marks go.</p>
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/simulator/live" className={PREMIUM_BTN}>Take a free mock <ArrowRight className="h-4 w-4" /></Link>
          <Link to="/auth" search={{ tab: "signup" }} className={GHOST_BTN}>Create free account</Link>
        </div>
      </Rise>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
type FooterLink = { label: string; to: string };
const footerColumns: { title: string; links: FooterLink[] }[] = [
  { title: "Product", links: [{ label: "CBT Simulator", to: "/simulator/live" }, { label: "Dashboard", to: "/dashboard" }, { label: "Become a mentor", to: "/join-mentor" }, { label: "Internships", to: "/join-intern" }, { label: "Blog", to: "/blog" }] },
  { title: "Help", links: [{ label: "Help centre", to: "/help" }, { label: "Contact us", to: "/contact" }, { label: "Verify certificate", to: "/verify" }] },
  { title: "Legal", links: [{ label: "Terms", to: "/legal/terms" }, { label: "Privacy", to: "/legal/privacy" }, { label: "Refund", to: "/legal/refund" }] },
];

function Footer() {
  return (
    <footer className={`${INK} pb-10 pt-16`}>
      <div className={WRAP}>
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2"><img src="/edurack-logo.webp" alt="EDURACK" width={160} height={160} className="h-10 w-auto object-contain" /><span className="font-display text-xl font-extrabold">edurack</span></Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60"><strong className="text-white">edurack.in</strong> is an independent platform for exam-format CBT practice and mentorship for NEET, JEE, CUET and IPMAT aspirants.</p>
            <p className="mt-2 max-w-xs text-sm text-white/40">Founded by Vishal Sharma, Tarun Yadav and Archita Priyadarshinee. {LAUNCH_DATE_LABEL}.</p>
            <div className="mt-5 flex gap-2">
              {socialLinks.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"><s.icon className="h-[18px] w-[18px]" /></a>
              ))}
            </div>
          </div>
          {footerColumns.map((c) => (
            <div key={c.title}>
              <p className="font-display text-sm font-bold">{c.title}</p>
              <ul className="mt-3 space-y-1">{c.links.map((l) => <li key={l.label}><Link to={l.to} className="inline-flex min-h-9 items-center text-sm text-white/60 transition-colors hover:text-white">{l.label}</Link></li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-white/40">© {new Date().getFullYear()} EDURACK (edurack.in). All rights reserved.</p>
      </div>
    </footer>
  );
}