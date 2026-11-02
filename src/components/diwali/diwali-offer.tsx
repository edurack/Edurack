import { useEffect, useState } from "react";
import { getPublicProOffer } from "@/server-functions/pro-public";
import "./diwali-fonts";

/** "Diwali" in a tall italic serif over a giant gold "50" with a stacked "% off". Decorative: the heading carries sr-only text. */
export function OfferHeadline({ percent, size, center = false }: { percent: number; size: "section" | "popup"; center?: boolean }) {
  const big = size === "section" ? "text-[clamp(7rem,40vw,16rem)]" : "text-[clamp(6.4rem,32vw,9rem)]";
  const script = size === "section" ? "text-[clamp(3.6rem,17vw,8rem)]" : "text-[clamp(3.2rem,16vw,4.8rem)]";
  const align = center ? "justify-center" : "justify-center lg:justify-start";
  return (
    <span aria-hidden="true" className="block select-none">
      <span className={`dw-serif relative z-10 block italic leading-[0.85] text-[#ffe9b8] ${script}`}>Diwali</span>
      <span className={`relative -mt-[0.1em] flex items-start ${align} ${big}`}>
        <span className="dw-num dw-gold-text font-extrabold leading-[0.82] tracking-[-0.07em]">{percent}</span>
        <span className="ml-[0.04em] mt-[0.06em] flex flex-col items-start">
          <span className="dw-num dw-gold-text text-[0.42em] font-extrabold leading-[0.9]">%</span>
          <span className="dw-serif -mt-[0.01em] text-[0.3em] italic leading-none text-[#fff3dc]">off</span>
        </span>
      </span>
    </span>
  );
}

type SalePlan = { price: number; listPrice?: number; days: number };
let pending: Promise<SalePlan | null> | null = null;

/** The cheapest live Pro plan with its sale price, shared by the section, popup and ticker (one request). Null until known or if nothing is for sale. */
export function useDiwaliPlan(): SalePlan | null {
  const [plan, setPlan] = useState<SalePlan | null>(null);
  useEffect(() => {
    let alive = true;
    pending ??= getPublicProOffer()
      .then((o) => {
        const p = [...o.plans].sort((a, b) => a.price - b.price)[0];
        return p ? { price: p.price, listPrice: p.listPrice, days: p.durationDays } : null;
      })
      .catch(() => null);
    pending.then((p) => alive && setPlan(p));
    return () => {
      alive = false;
    };
  }, []);
  return plan;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** "Pro from ₹99 ₹199 · 30 days": real numbers from the live plans, so it can never disagree with checkout. Renders nothing until known. */
export function PriceLine({ className = "" }: { className?: string }) {
  const plan = useDiwaliPlan();
  if (!plan) return null;
  const off = plan.listPrice !== undefined && plan.listPrice > plan.price;
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e9c98a]/70">Pro from</span>
      <span className="dw-num text-2xl font-extrabold text-[#fff3dc]">{rupees(plan.price)}</span>
      {off && <span className="text-base font-semibold text-[#e9c98a]/55 line-through decoration-[#ff7a18]/80">{rupees(plan.listPrice!)}</span>}
      <span className="text-xs text-[#e9c98a]/60">for {plan.days} days</span>
    </p>
  );
}
