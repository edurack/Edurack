import { Link } from "@tanstack/react-router";
import {
  IconArrowRight as ArrowRight,
  IconInfinity as Infinity,
  IconAdjustmentsHorizontal as Sliders,
  IconRepeat as Repeat,
  IconStopwatch as Stopwatch,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { FESTIVAL_SALE, THEMES, festivalEndLabel, isFestivalActive } from "@/lib/festival";
import { useFestivalSettings } from "./use-festival-settings";
import type { ProFeatureKey } from "@/lib/pro";
import { track } from "@/lib/analytics";

import { Sparkles, Tape } from "./festival-decor";
import { OfferHeadline, PriceLine } from "./sale-offer";
import { SaleCountdown } from "./sale-countdown";
import "./festival-fonts";

const EASE = [0.22, 1, 0.36, 1] as const;

// Short, scannable versions of the Pro features for the tiles (the long descriptions live on /pro).
const TILES: { key: ProFeatureKey; icon: typeof Infinity; title: string; body: string }[] = [
  { key: "unlimitedDrills", icon: Infinity, title: "Unlimited mocks", body: "No daily cap on timed PYQ drills" },
  { key: "customDrillBuilder", icon: Sliders, title: "Your own drill", body: "Chapter, difficulty, year, length" },
  { key: "mistakeRevision", icon: Repeat, title: "Fix mistakes", body: "Old wrong answers come back" },
  { key: "timeAnalysis", icon: Stopwatch, title: "Time analysis", body: "Spot rushed guesses fast" },
];

/**
 * The homepage festival sale (Diwali or Christmas, whichever the admin has switched on). Drop it between any two sections; it renders nothing outside the sale window,
 * so it can stay in the page without ever showing up late. Built phone-first: one centred column that
 * becomes a two-column layout from the lg breakpoint.
 */
export function FestivalSaleSection() {
  const settings = useFestivalSettings();
  if (!isFestivalActive(settings)) return null;
  const theme = settings.theme;
  const t = THEMES[theme];
  const p = t.prefix;
  const pct = settings.discountPercent;
  const endLabel = festivalEndLabel(settings.endsAt);

  return (
    <section id="festival-sale" aria-labelledby="festival-sale-heading" className={`${p}-section relative isolate overflow-hidden text-[#fff3dc]`}>
      <div aria-hidden="true" className={`${p}-section-bg absolute inset-0 -z-10`} />
      <Sparkles theme={theme} />
      <span aria-hidden="true" className={`${p}-bigword -z-10 hidden sm:block`}>{t.bigWord}</span>

      <Tape theme={theme} percent={pct} />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-12 lg:items-center lg:gap-14">
        {/* left: the offer */}
        <div className="text-center lg:col-span-7 lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className={`${p}-pill mb-6`}
          >
            <span className={`${p}-kicker-dot`} /> {t.kicker} · Ends {endLabel.split(",")[0]}
          </motion.p>

          <h2 id="festival-sale-heading">
            <span className="sr-only">{t.label} sale: flat {pct}% off {FESTIVAL_SALE.productName}</span>
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.9, ease: EASE }}
              className="block"
            >
              <OfferHeadline theme={theme} percent={pct} size="section" />
            </motion.span>
          </h2>

          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[#f3dfb8]/80 lg:mx-0 lg:text-lg">
            {t.pitch} {pct}% off on every {FESTIVAL_SALE.productName} plan, till the sale ends.
          </p>

          <PriceLine theme={theme} className="mt-4 justify-center lg:justify-start" />

          <SaleCountdown theme={theme} className="mx-auto mt-7 max-w-sm lg:mx-0" />

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
            <Link to={FESTIVAL_SALE.ctaPath} onClick={() => track("festival_cta_click", { theme, from: "landing_section" })} className={`${p}-btn-gold`}>
              Claim {pct}% off
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/auth" search={{ tab: "signup" }} className={`${p}-btn-ghost`}>
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
              className={`${p}-glass flex flex-col p-4 sm:p-5 ${i % 2 === 1 ? "lg:translate-y-6" : ""}`}
            >
              <span className={`${p}-icon mb-4 grid h-10 w-10 place-items-center rounded-full`}>
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
