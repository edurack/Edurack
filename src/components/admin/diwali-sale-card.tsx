// src/components/admin/diwali-sale-card.tsx
//
// The Diwali sale switch, shown at the top of the "Edurack Pro" tab. ON: the Diwali look appears site-wide AND every
// active Pro plan is charged at the discount (whatever its normal price). OFF: the site and prices are exactly normal.
// It also switches itself off when the end time passes. Normal plan prices are still edited below, never the sale prices.
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { IconLoader2 as Loader2, IconFlame as Flame, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { getDiwaliSettings, saveDiwaliSettings } from "@/server-functions/diwali";
import { DEFAULT_DIWALI_SETTINGS, MAX_DIWALI_DISCOUNT, MIN_DIWALI_DISCOUNT, diwaliEndLabel, isDiwaliActive, type DiwaliSettings } from "@/lib/diwali";

type AdminUser = { getIdToken: () => Promise<string> };

const IST_OFFSET_MS = 330 * 60_000;
/** epoch ms → "YYYY-MM-DDTHH:mm" in India time, for <input type="datetime-local"> */
const toIstInput = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 16);
/** "YYYY-MM-DDTHH:mm" read as India time → epoch ms (NaN if empty) */
const fromIstInput = (v: string) => Date.parse(`${v}:00+05:30`);

export function DiwaliSaleCard({ adminUser }: { adminUser: AdminUser }) {
  const router = useRouter();
  const [saved, setSaved] = useState<DiwaliSettings | null>(null);
  const [pct, setPct] = useState(String(DEFAULT_DIWALI_SETTINGS.discountPercent));
  const [end, setEnd] = useState(toIstInput(DEFAULT_DIWALI_SETTINGS.endsAt));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function adopt(s: DiwaliSettings) {
    setSaved(s);
    setPct(String(s.discountPercent));
    setEnd(toIstInput(s.endsAt));
  }

  useEffect(() => {
    getDiwaliSettings()
      .then(adopt)
      .catch(() => setErr("Couldn't load the Diwali sale status."));
  }, []);

  async function save(enabled: boolean) {
    const discountPercent = Number(pct);
    const endsAt = fromIstInput(end);
    if (!Number.isInteger(discountPercent) || discountPercent < MIN_DIWALI_DISCOUNT || discountPercent > MAX_DIWALI_DISCOUNT) {
      setErr(`Discount must be a whole number between ${MIN_DIWALI_DISCOUNT} and ${MAX_DIWALI_DISCOUNT}.`);
      return;
    }
    if (!Number.isFinite(endsAt)) {
      setErr("Pick an end date and time.");
      return;
    }
    if (enabled && !saved?.enabled && !confirm(`Start the Diwali sale?\n\nEvery active Pro plan will be charged at ${discountPercent}% off until ${diwaliEndLabel(endsAt)} IST, and the Diwali look will show across the site.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const { settings } = await saveDiwaliSettings({ data: { token: await adminUser.getIdToken(), settings: { enabled, discountPercent, endsAt } } });
      adopt(settings);
      void router.invalidate(); // refresh this tab's own view of the site too
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!saved && !err) {
    return (
      <div className="clay flex justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  const live = isDiwaliActive(saved);
  const expired = !!saved?.enabled && !live;
  const dirty = !!saved && (Number(pct) !== saved.discountPercent || fromIstInput(end) !== saved.endsAt);

  return (
    <section className={`clay space-y-3 border p-4 ${live ? "border-amber-400/60" : "border-transparent"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${live ? "bg-amber-400 text-amber-950" : "bg-foreground/10 text-foreground/50"}`}>
          <Flame className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">
            Diwali sale{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? "bg-amber-100 text-amber-800" : "bg-foreground/10 text-foreground/60"}`}>{live ? "LIVE" : "OFF"}</span>
          </h3>
          <p className="text-xs text-foreground/60">
            {live
              ? `The Diwali look is showing site-wide and every active Pro plan is ${saved!.discountPercent}% off until ${diwaliEndLabel(saved!.endsAt)} IST.`
              : expired
                ? "The end time has passed, so the sale stopped by itself. The site is back to normal. Pick a new end time to run it again."
                : "The site and all Pro prices are normal. Start the sale to show the Diwali look and discount every active Pro plan."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-foreground/70">
          Discount %
          <input type="number" min={MIN_DIWALI_DISCOUNT} max={MAX_DIWALI_DISCOUNT} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 block w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" />
        </label>
        <label className="text-xs font-semibold text-foreground/70">
          Sale ends (India time)
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" />
        </label>
        {live ? (
          <>
            <button onClick={() => void save(true)} disabled={busy || !dirty} className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => void save(false)} disabled={busy} className="rounded-full border border-rose-300/60 px-5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              Stop sale
            </button>
          </>
        ) : (
          <button onClick={() => void save(true)} disabled={busy} className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
            {busy ? "Starting…" : "Start Diwali sale"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-foreground/50">
        Keep the normal prices in the plans below; the discount is applied on top automatically, at checkout too. Visitors see a change within about 30 seconds.
      </p>

      {err && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </p>
      )}
    </section>
  );
}
