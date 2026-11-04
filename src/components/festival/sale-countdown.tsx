import { useFestivalCountdown, pad2 } from "./use-countdown";
import { THEMES, type FestivalTheme } from "@/lib/festival";
import "./festival-fonts";

/** Four equal gilded tiles: Days · Hrs · Min · Sec. Stretches to the container so it fits any phone. */
export function SaleCountdown({ theme, compact = false, className = "" }: { theme: FestivalTheme; compact?: boolean; className?: string }) {
  const p = THEMES[theme].prefix;
  const left = useFestivalCountdown();
  const cells: [string, string][] = [
    [left ? pad2(left.d) : "––", "Days"],
    [left ? pad2(left.h) : "––", "Hrs"],
    [left ? pad2(left.m) : "––", "Min"],
    [left ? pad2(left.s) : "––", "Sec"],
  ];
  return (
    <div role="timer" aria-label={`Time left in the ${THEMES[theme].label} sale`} className={`grid grid-cols-4 gap-2 sm:gap-3 ${className}`}>
      {cells.map(([v, label]) => (
        <div key={label} className={`${p}-tile-box text-center ${compact ? "py-2.5" : "py-3.5 sm:py-4"}`}>
          <div className={`${p}-num ${p}-gold-text font-extrabold tabular-nums leading-none ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>{v}</div>
          <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e9c98a]/65">{label}</div>
        </div>
      ))}
    </div>
  );
}
