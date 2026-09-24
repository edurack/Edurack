import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import {
  IconArrowRight as ArrowRight,
  IconChartBar as ChartBar,
  IconChecks as Checks,
  IconClock as Clock,
  IconPlayerPlayFilled as Play,
  IconUsers as Users,
  IconVideo as Video,
} from "@tabler/icons-react";

// Shared premium primary button (sapphire, soft sheen). Exported so the header
// and mobile dock use the exact same look as the hero CTA.
export const PREMIUM_BTN =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground " +
  "transition-all duration-200 hover:gap-3 hover:bg-primary/90 active:scale-[.97]";

export const GHOST_BTN =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-foreground/20 px-6 " +
  "text-[15px] font-semibold text-foreground transition-colors duration-200 active:scale-[.97] hover:border-foreground hover:bg-foreground/5";

// ─── Live-mock phone: loops the Edurack prep loop (test → analyse → fix) ───
const SCENES = ["Take a real-format test", "See what the score hides", "Fix what matters"] as const;
const PALETTE = ["a", "a", "r", "n", "c", "v", "a", "r", "n", "v", "v", "a"];
const paletteTone: Record<string, string> = {
  a: "bg-emerald-500 text-white",
  n: "bg-rose-500 text-white",
  r: "bg-violet-500 text-white",
  c: "bg-primary text-primary-foreground ring-4 ring-primary/20",
  v: "bg-secondary text-muted-foreground",
};

function MockScene() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t < PALETTE.length ? t + 1 : t)), 230);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-foreground">NEET (UG) · Mock 07</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono">
          <Clock className="h-3.5 w-3.5" /> 02:47:12
        </span>
      </div>
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="h-2 w-3/4 rounded bg-foreground/15" />
        <div className="mt-2 h-2 w-1/2 rounded bg-foreground/10" />
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-7 rounded-lg border ${i === 1 ? "border-primary bg-primary/10" : "border-border"}`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {PALETTE.map((s, i) => (
          <motion.div
            key={i}
            animate={{ scale: i < tick ? [0.7, 1] : 1 }}
            className={`grid h-7 place-items-center rounded-md text-[11px] font-bold ${
              i < tick ? paletteTone[s] : "bg-secondary text-muted-foreground"
            }`}
          >
            {i + 1}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnalysisScene() {
  const rows = [
    { s: "Physics", v: 46, c: "bg-rose-500", t: "Needs attention" },
    { s: "Chemistry", v: 78, c: "bg-emerald-500", t: "Strong" },
    { s: "Biology", v: 61, c: "bg-amber-500", t: "Moderate" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-3xl font-extrabold text-foreground">
          400<span className="text-base font-semibold text-muted-foreground"> / 720</span>
        </div>
        <p className="text-xs text-muted-foreground">The score is only the start</p>
      </div>
      {rows.map((r, i) => (
        <div key={r.s}>
          <div className="mb-1 flex justify-between text-xs font-semibold">
            <span>{r.s}</span>
            <span className="text-muted-foreground">{r.t}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className={`h-full rounded-full ${r.c}`}
              initial={{ width: 0 }}
              animate={{ width: `${r.v}%` }}
              transition={{ duration: 0.9, delay: 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FixScene() {
  const items = ["Physics → Mechanics", "Biology → Plant Physiology"];
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Fix these two first</p>
      {items.map((t, i) => (
        <motion.div
          key={t}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 * i, duration: 0.45 }}
          className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold"
        >
          <Checks className="h-4 w-4 text-primary" /> {t}
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-3 rounded-xl bg-primary/10 p-3"
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
          <Users className="h-4 w-4" />
        </div>
        <div className="text-xs">
          <div className="font-bold text-foreground">Mentors who cleared it</div>
          <div className="text-muted-foreground">Matched to your weak topics</div>
        </div>
      </motion.div>
    </div>
  );
}

function PhoneDemo() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % SCENES.length), 4600);
    return () => clearInterval(id);
  }, [reduce]);
  const scene = [<MockScene key="m" />, <AnalysisScene key="a" />, <FixScene key="f" />][i];

  return (
    <div className="w-[260px] rounded-[2.2rem] border border-border bg-card p-3 shadow-sm sm:w-[290px]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-secondary" />
      <div className="h-[330px] overflow-hidden px-1 sm:h-[350px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35 }}
          >
            {scene}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-foreground">{SCENES[i]}</span>
        <div className="flex gap-1">
          {SCENES.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
          ))}
        </div>
      </div>
      <p className="mt-1 px-1 text-[10px] text-muted-foreground">Sample data for illustration</p>
    </div>
  );
}

// ─── Toast stack overlay: shows what the platform does right now ───────────
const TOASTS = [
  { icon: Checks, title: "Mock submitted", sub: "Score, accuracy and speed are ready" },
  { icon: ChartBar, title: "Weak topic found", sub: "Physics → Mechanics needs work" },
  { icon: Users, title: "Mentor match", sub: "Mentors who cleared your exam" },
  { icon: Video, title: "Free mentor session open", sub: "Book a slot, no sign-in to browse" },
];

function ToastStack() {
  const [head, setHead] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setHead((h) => (h + 1) % TOASTS.length), 2800);
    return () => clearInterval(id);
  }, [reduce]);
  const visible = [0, 1, 2].map((d) => ({ d, t: TOASTS[(head + d) % TOASTS.length], k: head + d }));

  return (
    <div className="relative h-[86px] w-[268px] sm:w-[300px]" aria-live="off">
      <AnimatePresence initial={false}>
        {visible
          .slice()
          .reverse()
          .map(({ d, t, k }) => (
            <motion.div
              key={k}
              layout
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{ opacity: 1 - d * 0.28, y: d * -12, scale: 1 - d * 0.05 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              style={{ zIndex: 10 - d, transformOrigin: "bottom center" }}
              className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-3.5 py-3 shadow-md backdrop-blur"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <t.icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-foreground">{t.title}</div>
                <div className="truncate text-xs text-muted-foreground">{t.sub}</div>
              </div>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────
const rise = (i: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as const },
});

export function HeroMotion({ ctaRef }: { ctaRef?: React.RefObject<HTMLDivElement | null> }): ReactNode {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end start"] });
  const yGlow = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const yPhone = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -50]);
  const yToast = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -110]);

  return (
    <section ref={root} className="relative overflow-hidden px-4 pb-16 pt-8 sm:px-6 lg:pb-24 lg:pt-16">
      <motion.div aria-hidden style={{ y: yGlow }} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-[22rem] w-[22rem] rounded-full bg-[var(--sky-soft)] blur-3xl" />
      </motion.div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> For NEET, JEE, CUET and IPMAT
          </motion.p>
          <motion.h1 {...rise(1)} className="mt-5 font-display text-[2.4rem] leading-[1.06] tracking-tight text-foreground sm:text-6xl">
            <span className="block font-light">Take the mock.</span>
            <span className="block font-extrabold">Fix what costs you marks.</span>
          </motion.h1>
          <motion.p {...rise(2)} className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Exam-format tests, a clear read on where you lose marks, and mentors who have cleared the
            same exam. Not more preparation. Better-aimed preparation.
          </motion.p>

          <motion.div {...rise(3)} ref={ctaRef} className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link to="/simulator/live" className={`${PREMIUM_BTN} sm:min-w-[220px]`}>
              <Play className="h-4 w-4" /> Take a free mock
            </Link>
            <Link to="/auth" search={{ tab: "signup" }} className={GHOST_BTN}>
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
          <motion.p {...rise(4)} className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth" search={{ tab: "signin" }} className="inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </motion.p>
        </div>

        <div className="relative mx-auto flex flex-col items-center gap-5 lg:min-h-[520px] lg:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 40, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ y: yPhone }}
          >
            <PhoneDemo />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            style={{ y: yToast }}
            className="lg:absolute lg:-left-10 lg:bottom-6"
          >
            <ToastStack />
          </motion.div>
        </div>
      </div>
    </section>
  );
}