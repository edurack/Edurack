// The site-wide festival layer (Diwali or Christmas). Mounted ONCE in routes/__root.tsx, before <Outlet />.
//
//   • ticker bar     — in-flow, top of marketing pages only (promoAllowed)
//   • lights + glow  — fixed overlays (garland, soft corner glow, diyas / trees) on every page except exams/drills/portals (ambientAllowed)
//   • popup          — once per session on marketing pages (popupAllowed)
//   • data-festival  — attribute on <html> ("diwali" | "christmas") that switches on the matching warm CSS touches at the bottom of styles.css
//
// It renders nothing unless the admin has switched a sale ON (Admin → Edurack Pro → Festival sale) and the end time
// is still ahead, and it switches itself off when that time passes, even on an open tab.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { FESTIVAL_SALE, THEMES, ambientAllowed, isFestivalActive, popupAllowed, promoAllowed, type FestivalTheme } from "@/lib/festival";
import { track } from "@/lib/analytics";
import { Diya, Garland, Tree } from "./festival-decor";
import { FestivalPopup } from "./festival-popup";
import { useFestivalCountdown, pad2 } from "./use-countdown";
import { useFestivalSettings } from "./use-festival-settings";
import "./festival-fonts";

function Ticker({ theme, percent }: { theme: FestivalTheme; percent: number }) {
  const t = THEMES[theme];
  const p = t.prefix;
  const left = useFestivalCountdown();
  return (
    <div className={`${p}-ticker relative z-[46]`} role="region" aria-label={`${t.label} sale`}>
      <Link
        to={FESTIVAL_SALE.ctaPath}
        onClick={() => track("festival_cta_click", { theme, from: "ticker" })}
        className="mx-auto flex min-h-[2.75rem] max-w-6xl items-center justify-center gap-x-3 px-3 pt-3.5 text-center text-[12.5px] font-semibold tracking-wide text-[#ffe9b4] sm:text-[13.5px]"
      >
        <span className={`${p}-serif hidden text-[1.6rem] italic leading-none text-[#ffd978] sm:inline`}>{t.greeting}</span>
        <span className="hidden h-3 w-px bg-[#e8b04a]/40 sm:inline-block" aria-hidden="true" />
        <span>
          Flat <b className={`${p}-gold-text text-[1.05em] font-extrabold`}>{percent}% off</b> {FESTIVAL_SALE.productName}
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

function Ambient({ theme }: { theme: FestivalTheme }) {
  const p = THEMES[theme].prefix;
  return (
    <>
      <div aria-hidden="true" className={`${p}-glow`} />
      <Garland theme={theme} />
      {theme === "christmas" ? (
        <>
          <Tree className="xm-corner left-3" />
          <Tree className="xm-corner right-3 -scale-x-100" />
        </>
      ) : (
        <>
          <Diya className="dw-corner-diya left-3" />
          <Diya className="dw-corner-diya right-3 -scale-x-100" />
        </>
      )}
    </>
  );
}

export function FestivalLayer() {
  const settings = useFestivalSettings();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = isFestivalActive(settings);
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
    if (ambient) root.setAttribute("data-festival", settings.theme);
    else root.removeAttribute("data-festival");
    return () => root.removeAttribute("data-festival");
  }, [ambient, settings.theme]);

  if (!active) return null;
  return (
    <>
      {promoAllowed(path) && <Ticker theme={settings.theme} percent={settings.discountPercent} />}
      {mounted && ambient && <Ambient theme={settings.theme} />}
      {mounted && popupAllowed(path) && <FestivalPopup />}
    </>
  );
}
