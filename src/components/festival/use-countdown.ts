import { useEffect, useState } from "react";
import { splitCountdown, type Countdown } from "@/lib/festival";
import { useFestivalSettings } from "./use-festival-settings";

/** Time left in the sale. null until mounted, so server HTML and first client paint match. */
export function useFestivalCountdown(): Countdown | null {
  const { endsAt } = useFestivalSettings();
  const [left, setLeft] = useState<Countdown | null>(null);
  useEffect(() => {
    const tick = () => setLeft(splitCountdown(endsAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return left;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
