import { useDiwaliCountdown, pad2 } from "./use-countdown";
import "./diwali-fonts";

/** Four equal gilded tiles: Days · Hrs · Min · Sec. Stretches to the container so it fits any phone. */
export function DiwaliCountdown({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const left = useDiwaliCountdown();
  const cells: [string, string][] = [
    [left ? pad2(left.d) : "––", "Days"],
    [left ? pad2(left.h) : "––", "Hrs"],
    [left ? pad2(left.m) : "––", "Min"],
    [left ? pad2(left.s) : "––", "Sec"],
  ];
  return (
    <div role="timer" aria-label="Time left in the Diwali sale" className={`grid grid-cols-4 gap-2 sm:gap-3 ${className}`}>
      {cells.map(([v, label]) => (
        <div key={label} className={`dw-tile-box text-center ${compact ? "py-2.5" : "py-3.5 sm:py-4"}`}>
          <div className={`dw-num dw-gold-text font-extrabold tabular-nums leading-none ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>{v}</div>
          <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e9c98a]/65">{label}</div>
        </div>
      ))}
    </div>
  );
}
