// The site-wide Diwali layer. Mounted ONCE in routes/__root.tsx, before <Outlet />.
//
//   • ticker bar     — in-flow, top of marketing pages only (promoAllowed)
//   • lights + glow  — fixed overlays (garland, soft corner glow, diyas) on every page except exams/drills/portals (ambientAllowed)
//   • popup          — once per session on marketing pages (popupAllowed)
//   • data-diwali    — attribute on <html> that switches on the warm CSS touches at the bottom of styles.css
//
// It renders nothing unless the admin has switched the sale ON (Admin → Edurack Pro → Diwali sale) and the end time
// is still ahead, and it switches itself off when that time passes, even on an open tab.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { DIWALI_SALE, ambientAllowed, isDiwaliActive, popupAllowed, promoAllowed } from "@/lib/diwali";
import { track } from "@/lib/analytics";
import { DiwaliGarland, Diya } from "./diwali-decor";
import { DiwaliPopup } from "./diwali-popup";
import { useDiwaliCountdown, pad2 } from "./use-countdown";
import { useDiwaliSettings } from "./use-diwali-settings";
import "./diwali-fonts";

function DiwaliTicker({ percent }: { percent: number }) {
  const left = useDiwaliCountdown();
  return (
    <div className="dw-ticker relative z-[46]" role="region" aria-label="Diwali sale">
      <Link
        to={DIWALI_SALE.ctaPath}
        onClick={() => track("diwali_cta_click", { from: "ticker" })}
        className="mx-auto flex min-h-[2.75rem] max-w-6xl items-center justify-center gap-x-3 px-3 pt-3.5 text-center text-[12.5px] font-semibold tracking-wide text-[#ffe9b4] sm:text-[13.5px]"
      >
        <span className="dw-serif hidden text-[1.6rem] italic leading-none text-[#ffd978] sm:inline">Happy Diwali</span>
        <span className="hidden h-3 w-px bg-[#e8b04a]/40 sm:inline-block" aria-hidden="true" />
        <span>
          Flat <b className="dw-gold-text text-[1.05em] font-extrabold">{percent}% off</b> {DIWALI_SALE.productName}
        </span>
        {left && (
          <span className="hidden tabular-nums text-[#e9c98a]/80 min-[460px]:inline">
            · ends in {left.d > 0 ? `${left.d}d ` : ""}
            {pad2(left.h)}h {pad2(left.m)}m
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[#ffd978] underline decoration-[#e8b04a]/50 underline-offset-4">
          Claim <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </Link>
    </div>
  );
}

function DiwaliAmbient() {
  return (
    <>
      <div aria-hidden="true" className="dw-glow" />
      <DiwaliGarland />
      <Diya className="dw-corner-diya left-3" />
      <Diya className="dw-corner-diya right-3 -scale-x-100" />
    </>
  );
}

export function DiwaliLayer() {
  const settings = useDiwaliSettings();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = isDiwaliActive(settings);
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => setMounted(true), []);

  // Switch everything off the moment the sale ends, even if the tab stays open.
  useEffect(() => {
    if (!active) return;
    const ms = settings.endsAt - Date.now();
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.min(ms, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [active, settings.endsAt]);

  const ambient = active && ambientAllowed(path);
  useEffect(() => {
    const root = document.documentElement;
    if (ambient) root.setAttribute("data-diwali", "on");
    else root.removeAttribute("data-diwali");
    return () => root.removeAttribute("data-diwali");
  }, [ambient]);

  if (!active) return null;
  return (
    <>
      {promoAllowed(path) && <DiwaliTicker percent={settings.discountPercent} />}
      {mounted && ambient && <DiwaliAmbient />}
      {mounted && popupAllowed(path) && <DiwaliPopup />}
    </>
  );
}
