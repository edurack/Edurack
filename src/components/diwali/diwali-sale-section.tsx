import { Link } from "@tanstack/react-router";
import {
  IconArrowRight as ArrowRight,
  IconInfinity as Infinity,
  IconAdjustmentsHorizontal as Sliders,
  IconRepeat as Repeat,
  IconStopwatch as Stopwatch,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { DIWALI_SALE, diwaliEndLabel, isDiwaliActive } from "@/lib/diwali";
import { useDiwaliSettings } from "./use-diwali-settings";
import type { ProFeatureKey } from "@/lib/pro";
import { track } from "@/lib/analytics";
import { DiwaliCountdown } from "./diwali-countdown";
import { Sparkles, Tape } from "./diwali-decor";
import { OfferHeadline, PriceLine } from "./diwali-offer";
import "./diwali-fonts";

const EASE = [0.22, 1, 0.36, 1] as const;

// Short, scannable versions of the Pro features for the tiles (the long descriptions live on /pro).
const TILES: { key: ProFeatureKey; icon: typeof Infinity; title: string; body: string }[] = [
  { key: "unlimitedDrills", icon: Infinity, title: "Unlimited mocks", body: "No daily cap on timed PYQ drills" },
  { key: "customDrillBuilder", icon: Sliders, title: "Your own drill", body: "Chapter, difficulty, year, length" },
  { key: "mistakeRevision", icon: Repeat, title: "Fix mistakes", body: "Old wrong answers come back" },
  { key: "timeAnalysis", icon: Stopwatch, title: "Time analysis", body: "Spot rushed guesses fast" },
];

/**
 * The homepage Diwali sale. Drop it between any two sections; it renders nothing outside the sale window,
 * so it can stay in the page without ever showing up late. Built phone-first: one centred column that
 * becomes a two-column layout from the lg breakpoint.
 */
export function DiwaliSaleSection() {
  const settings = useDiwaliSettings();
  if (!isDiwaliActive(settings)) return null;
  const pct = settings.discountPercent;
  const endLabel = diwaliEndLabel(settings.endsAt);

  return (
    <section id="diwali-sale" aria-labelledby="diwali-sale-heading" className="dw-section relative isolate overflow-hidden text-[#fff3dc]">
      <div aria-hidden="true" className="dw-section-bg absolute inset-0 -z-10" />
      <Sparkles />
      <span aria-hidden="true" className="dw-bigword -z-10 hidden sm:block">Diwali</span>

      <Tape percent={pct} />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-12 lg:items-center lg:gap-14">
        {/* left: the offer */}
        <div className="text-center lg:col-span-7 lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="dw-pill mb-6"
          >
            <span className="dw-kicker-dot" /> Festival of Lights · Ends {endLabel.split(",")[0]}
          </motion.p>

          <h2 id="diwali-sale-heading">
            <span className="sr-only">Diwali sale: flat {pct}% off {DIWALI_SALE.productName}</span>
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.9, ease: EASE }}
              className="block"
            >
              <OfferHeadline percent={pct} size="section" />
            </motion.span>
          </h2>

          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[#f3dfb8]/80 lg:mx-0 lg:text-lg">
            Light up your prep. {pct}% off on every {DIWALI_SALE.productName} plan, till Diwali ends.
          </p>

          <PriceLine className="mt-4 justify-center lg:justify-start" />

          <DiwaliCountdown className="mx-auto mt-7 max-w-sm lg:mx-0" />

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
            <Link to={DIWALI_SALE.ctaPath} onClick={() => track("diwali_cta_click", { from: "landing_section" })} className="dw-btn-gold">
              Claim {pct}% off
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/auth" search={{ tab: "signup" }} className="dw-btn-ghost">
              Start free
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#e9c98a]/50">Applied automatically at checkout · valid till {endLabel} IST</p>
        </div>

        {/* right: bento of what the offer unlocks (2×2 on every screen) */}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-5">
          {TILES.map(({ key, icon: Icon, title, body }, i) => (
            <motion.li
              key={key}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.7, delay: i * 0.08, ease: EASE }}
              className={`dw-glass flex flex-col p-4 sm:p-5 ${i % 2 === 1 ? "lg:translate-y-6" : ""}`}
            >
              <span className="dw-icon mb-4 grid h-10 w-10 place-items-center rounded-full">
                <Icon className="h-5 w-5" stroke={1.8} aria-hidden="true" />
              </span>
              <b className="text-[15px] font-semibold leading-tight text-[#fff3dc]">{title}</b>
              <span className="mt-1 text-xs leading-snug text-[#f3dfb8]/65 sm:text-[13px]">{body}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
