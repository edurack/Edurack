import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Menu,
  X,
  MonitorPlay,
  LayoutDashboard,
  CalendarCheck,
  LineChart,
  ArrowRight,
  Sparkles,
  Play,
  UserCheck,
  Cpu,
  TrendingUp,
} from "lucide-react";
import { CbtSimulator } from "@/components/landing/CbtSimulator";

export const Route = createFileRoute("/")({
  component: Index,
});

// ---------------------------------------------
// Exam config — shared across hero selector, mentor
// showcase, and (soon) other pages that need to filter
// or badge content by exam.
// ---------------------------------------------
type ExamKey = "neet" | "jee" | "cuet" | "ipmat";

const exams: { key: ExamKey; label: string; full: string }[] = [
  { key: "neet", label: "NEET", full: "NEET (Medical)" },
  { key: "jee", label: "JEE", full: "JEE Main & Advanced" },
  { key: "cuet", label: "CUET", full: "CUET (UG)" },
  { key: "ipmat", label: "IPMAT", full: "IPMAT (IIM)" },
];

// ---------------------------------------------
// Scroll-reveal — the page's one motion device.
// Fades + lifts an element into place the first time
// it enters the viewport. Respects reduced-motion.
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
  { label: "Join as Mentor", type: "anchor", href: "#marketplace" },
  { label: "Contact", type: "route", to: "/contact" },
];

function Index() {
  return (
    <div className="min-h-screen scroll-smooth">
      <Header />
      <main>
        <Hero />
        <SimulatorSection />
        <MentorVideoShowcase />
        <FeaturesGrid />
        <MarketplaceBanner />
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
    const onScroll = () => setScrolled(window.scrollY > 8);
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
            src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
            alt="EDURACK"
            className="h-10 w-auto shrink-0 object-contain sm:h-12"
          />
          <span className="truncate font-display text-xl font-bold tracking-tight text-foreground">EDURACK</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <NavItem key={l.label} link={l} />
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            to="/auth"
            className="clay-btn-ghost px-5 py-2 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            Login
          </Link>
          <Link
            to="/auth"
            className="clay-btn px-5 py-2 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            Sign Up
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
                className="clay-btn px-4 py-2.5 text-center text-sm font-semibold"
              >
                Sign Up
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  // Local selection only — swapping this doesn't yet filter the rest of
  // the page's content by exam. It's here so a JEE/CUET/IPMAT aspirant
  // immediately sees "this platform is for me too" instead of reading
  // NEET-only copy and assuming otherwise. Wiring it to actually filter
  // simulator/mentor content by exam is a natural next step once each
  // section has exam-tagged data to filter against.
  const [activeExam, setActiveExam] = useState<ExamKey>("neet");

  return (
    <section className="px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pt-28">
      <div className="mx-auto max-w-5xl text-center">
        <Reveal>
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 sm:text-sm">
            <Sparkles className="h-4 w-4 animate-pulse" />
            One platform. Four of India's toughest entrance exams.
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
                    ? "clay-btn text-white"
                    : "clay-chip text-foreground/60 hover:text-foreground"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <h1 className="fluid-h1 mt-6 font-display font-extrabold tracking-tight text-foreground">
            Prepare for{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-br from-sky-600 to-teal-500 bg-clip-text text-transparent">
                {exams.find((e) => e.key === activeExam)?.full}
              </span>
            </span>{" "}
            like it's already exam day.
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="fluid-body mx-auto mt-6 max-w-2xl text-muted-foreground">
            Don't let an unfamiliar screen cost you marks. EDURACK gives NEET, JEE, CUET, and IPMAT
            aspirants a <b className="text-foreground">pixel-exact CBT simulator</b> for each exam's
            real interface, paired with mentorship spaces run directly by top rankers and IIM/IIT/AIIMS
            students.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/simulator/live"
              className="clay-btn group inline-flex items-center gap-2 px-7 py-4 text-base font-bold transition-transform duration-200 hover:-translate-y-0.5 sm:text-lg"
            >
              Start Free CBT Mock Test
              <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a
              href="#simulator"
              className="clay-btn-ghost px-6 py-4 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 sm:text-base"
            >
              Explore Simulator
            </a>
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
      </div>
    </section>
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
          Matching question palettes, navigation flags, and section indicators for each exam's actual
          testing interface — NEET's upcoming CBT shift, JEE and CUET's existing NTA screens, and
          IPMAT's format. Walk in already familiar with the layout, whichever exam you're sitting.
        </p>
      </Reveal>
      <Reveal delay={120} className="mt-10">
        {/* CbtSimulator is intentionally left as a fixed light-mode replica —
            the real NTA exam screen is always light, regardless of device
            theme, so this component should not follow site-wide dark mode. */}
        <CbtSimulator />
      </Reveal>
    </section>
  );
}

function MentorVideoShowcase() {
  const sampleVideos = [
    { name: "Rahul Jha", rank: "AIR 14 NEET · AIIMS Delhi", topic: "NEET CBT Strategy" },
    { name: "Sneha Reddy", rank: "AIR 312 JEE Adv. · IIT Bombay", topic: "JEE Problem-Solving Speed" },
    { name: "Aman Verma", rank: "99.8%ile CUET · DU (SRCC)", topic: "CUET Section Time Management" },
  ];

  return (
    <section id="mentors" className="bg-secondary/40 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="clay-chip inline-flex px-4 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
            LEARN FROM THE BEST
          </div>
          <h2 className="fluid-h2 mt-4 font-display font-extrabold text-foreground">
            Direct Guidance From Top Rankers — Across Every Exam
          </h2>
          <p className="fluid-body mt-3 text-muted-foreground">
            Hear straight from mentors who cracked NEET, JEE, CUET, and IPMAT — the competitive
            pressure is different for each, and so is their advice. Watch their high-yield prep tips
            below.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sampleVideos.map((v, i) => (
            <Reveal key={v.name} delay={i * 90}>
              <div className="clay flex h-full flex-col justify-between overflow-hidden p-4 transition-transform duration-300 hover:-translate-y-1">
                {/* Video thumbnail placeholder — intentionally stays dark
                    in both themes, same reasoning as CbtSimulator: it's
                    mimicking a video player surface, not a page surface. */}
                <div className="group relative aspect-video w-full cursor-pointer rounded-2xl bg-slate-900 shadow-inner">
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <button
                    className="absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur-sm transition-transform duration-200 group-hover:scale-110"
                    aria-label={`Play strategy video by ${v.name}`}
                  >
                    <Play className="ml-0.5 h-6 w-6 fill-sky-600 text-sky-600" />
                  </button>
                  <span className="absolute bottom-3 left-4 z-20 rounded-md bg-black/30 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                    {v.topic}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display font-bold text-foreground">{v.name}</h3>
                    <p className="text-xs font-medium text-muted-foreground">{v.rank}</p>
                  </div>
                  <Link
                    to="/auth"
                    className="clay-btn-ghost shrink-0 px-4 py-2 text-xs font-bold transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    View Space
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: MonitorPlay,
    title: "1:1 Exam-Specific CBT Engines",
    desc: "Every shortcut, color state, and layout mirrors each exam's real testing interface — NEET, JEE, CUET, and IPMAT alike.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/15",
  },
  {
    icon: LayoutDashboard,
    title: "Syllabus-Driven Trackers",
    desc: "Tailored structures per exam and class level — Class 11, 12, and Droppers — to pace out high-weightage topics.",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/15",
  },
  {
    icon: CalendarCheck,
    title: "Direct Mentor Marketplace",
    desc: "Browse premium batches listed by rankers across all four exams, each at their own customized rates.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/15",
  },
  {
    icon: LineChart,
    title: "Screen Analytics",
    desc: "Tracks speed per question, subject-wise accuracy, and projected percentile — normalized for each exam's own scoring pattern.",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/15",
  },
];

function FeaturesGrid() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="clay-chip inline-flex px-4 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
            THE EDURACK ADVANTAGE
          </div>
          <h2 className="fluid-h2 mt-4 font-display font-extrabold text-foreground">
            Built for serious aspirants, whichever exam you're tackling.
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
              className="clay-btn inline-flex items-center gap-2 justify-self-start px-7 py-4 text-base font-bold transition-transform duration-200 hover:-translate-y-0.5 md:justify-self-end"
            >
              Try Free Mock Test <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MarketplaceBanner() {
  // This banner is a deliberately dark card (dark gradient + white text)
  // regardless of site theme — it's meant to stand out as a distinct,
  // premium-feeling block on the page even in light mode. Left as-is
  // intentionally; it already reads correctly in dark mode too since
  // it never relied on the background theme in the first place.
  return (
    <section id="marketplace" className="px-4 pb-20 sm:px-6 lg:pb-28">
      <Reveal className="mx-auto max-w-6xl">
        <div className="clay relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white md:p-14">
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-teal-300 backdrop-blur-sm">
              <UserCheck className="h-3.5 w-3.5" />
              Cracked NEET, JEE, CUET, or IPMAT? Turn that into a business.
            </div>
            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Monetize your expertise. Run your own mentorship store on EDURACK.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Stop dealing with unorganized tracking spreadsheets, structural setup barriers, or manual
              group entry confirmations. Set your fixed price tiers, deliver premium guidance
              schedules for your exam, and let our automated payment configuration process your
              withdrawals seamlessly.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/join-mentor"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-teal-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-md transition-transform duration-200 hover:-translate-y-0.5 hover:opacity-95"
              >
                Create Mentor Space <Cpu className="h-4 w-4" />
              </Link>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold transition-colors duration-200 hover:bg-white/10"
              >
                Follow Corporate Updates <TrendingUp className="h-4 w-4" />
              </a>
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
                src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
                alt="EDURACK"
                className="h-10 w-auto shrink-0 object-contain sm:h-12"
              />
              <span className="font-display text-lg font-bold text-foreground">EDURACK</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              The CBT testing and mentorship platform for NEET, JEE, CUET & IPMAT.
            </p>
          </div>
          {footerColumns.map((col) => (
            <FooterCol key={col.title} title={col.title} links={col.links} />
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} EDURACK. All rights reserved.</span>
          <span>Built for India's toughest entrance exams.</span>
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