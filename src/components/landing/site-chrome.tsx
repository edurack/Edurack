import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { motion } from "motion/react";
import {
  IconArrowLeft as ArrowLeft,
  IconBrandInstagram as Instagram,
  IconBrandLinkedin as Linkedin,
  IconBrandX as Twitter,
  IconBrandYoutube as Youtube,
  IconAt as AtSign,
  IconMessageCircle as MessageSquare,
  IconMenu2 as Menu,
  IconX as X,
} from "@tabler/icons-react";
import { PREMIUM_BTN, GHOST_BTN } from "@/components/landing/HeroMotion";

// ────────────────────────────────────────────────────────────────────────
// Everything in this file is lifted straight out of routes/index.tsx so
// that every secondary page (legal docs, join-mentor, join-intern) shares
// exactly the same shell — sticky blurred header, ink-navy banner sections,
// scroll-reveal motion, and the full site footer — instead of each page
// rolling its own lighter-weight header/footer.
// ────────────────────────────────────────────────────────────────────────

export const EASE = [0.22, 1, 0.36, 1] as const;
export const INK = "bg-[#141b2b] text-white";
export const WRAP = "mx-auto max-w-6xl px-4 sm:px-6";

const LAUNCH_DATE_LABEL = "Launched 10 September 2026";

export function Rise({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
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

export function Title({
  light,
  bold,
  dark = false,
}: {
  light: string;
  bold: string;
  dark?: boolean;
}) {
  return (
    <h2
      className={`font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl ${
        dark ? "text-white" : "text-foreground"
      }`}
    >
      <span className="block font-light">{light}</span>
      <span className="block font-extrabold">{bold}</span>
    </h2>
  );
}

// ── Header ──────────────────────────────────────────────────────────────
// Same sticky, blurred header as the homepage. Secondary pages don't have
// on-page anchor sections to link to, so the middle nav is swapped for a
// single "Back to home" link — everything else (logo, auth buttons, mobile
// menu behaviour) matches routes/index.tsx exactly.
export function SiteHeader({ backLabel = "Back to home" }: { backLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className={`${WRAP} flex h-16 items-center justify-between gap-2`}>
        <Link to="/" className="flex items-center gap-2">
          <img
            src="https://www.edurack.in/edurack-logo.webp"
            alt="EDURACK"
            width={160}
            height={160}
            className="h-9 w-auto object-contain"
          />
          <span className="font-display text-xl font-extrabold tracking-tight text-foreground max-[350px]:hidden">
            edurack
          </span>
        </Link>
        <nav className="hidden items-center lg:flex">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link
            to="/auth"
            search={{ tab: "signin" }}
            className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-bold text-foreground/80 hover:text-foreground"
          >
            Log in
          </Link>
          <Link to="/auth" search={{ tab: "signup" }} className={`${PREMIUM_BTN} !min-h-11 !px-5 text-sm`}>
            Sign up
          </Link>
          <button
            className="grid h-11 w-11 place-items-center rounded-full active:scale-90 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <div
        className={`overflow-hidden border-border transition-all duration-300 lg:hidden ${
          open ? "max-h-96 border-t" : "max-h-0"
        }`}
      >
        <nav className={`${WRAP} flex flex-col py-2`}>
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────
// Identical to the homepage footer (same columns, same socials, same ink
// band) so every secondary page ends the same way the homepage does.
type FooterLink = { label: string; to: string };
const footerColumns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "CBT Simulator", to: "/simulator/live" },
      { label: "Dashboard", to: "/dashboard" },
      { label: "Become a mentor", to: "/join-mentor" },
      { label: "Internships", to: "/join-intern" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Help centre", to: "/help" },
      { label: "Contact us", to: "/contact" },
      { label: "Verify certificate", to: "/verify" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", to: "/legal/terms" },
      { label: "Privacy", to: "/legal/privacy" },
      { label: "Refund", to: "/legal/refund" },
    ],
  },
];

const socialLinks = [
  { name: "LinkedIn", href: "https://www.linkedin.com/company/edurack", icon: Linkedin },
  { name: "Threads", href: "https://threads.net/@edurack.in", icon: AtSign },
  { name: "YouTube", href: "https://youtube.com/@edurack", icon: Youtube },
  { name: "Instagram", href: "https://instagram.com/edurack.in", icon: Instagram },
  { name: "X (Twitter)", href: "https://x.com/edurack_", icon: Twitter },
  { name: "Reddit", href: "https://www.reddit.com/user/Edurack/", icon: MessageSquare },
];

export function SiteFooter() {
  return (
    <footer className={`${INK} pb-10 pt-16`}>
      <div className={WRAP}>
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <img
                src="https://www.edurack.in/edurack-logo.webp"
                alt="EDURACK"
                width={160}
                height={160}
                className="h-10 w-auto object-contain"
              />
              <span className="font-display text-xl font-extrabold">edurack</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              <strong className="text-white">edurack.in</strong> is an independent platform for
              exam-format CBT practice and mentorship for NEET, JEE, CUET and IPMAT aspirants.
            </p>
            <p className="mt-2 max-w-xs text-sm text-white/40">
              Founded by Vishal Sharma, Tarun Yadav and Archita Priyadarshinee. {LAUNCH_DATE_LABEL}.
            </p>
            <div className="mt-5 flex gap-2">
              {socialLinks.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <s.icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>
          {footerColumns.map((c) => (
            <div key={c.title}>
              <p className="font-display text-sm font-bold">{c.title}</p>
              <ul className="mt-3 space-y-1">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="inline-flex min-h-9 items-center text-sm text-white/60 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-white/40">
          © {new Date().getFullYear()} EDURACK (edurack.in). All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export { PREMIUM_BTN, GHOST_BTN };
