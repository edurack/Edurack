import { useEffect, useState } from "react";
import { Layers3, IndianRupee, Ticket, Inbox, AlertCircle, RefreshCw } from "lucide-react";
import { getMyOverviewStats } from "@/server-functions/promoter-portal";
import type { PromoterOverviewStats } from "@/lib/promoter-types";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  icon: typeof Layers3;
  accent: "sky" | "mint" | "coral";
  loading: boolean;
}) {
  const accentVar = { sky: "var(--sky-soft)", mint: "var(--mint-soft)", coral: "var(--coral-soft)" }[accent];
  return (
    <div className="clay p-5 transition-transform duration-300 hover:-translate-y-1">
      <div
        className="clay-inset mb-3 flex h-10 w-10 items-center justify-center rounded-2xl"
        style={{ background: accentVar }}
      >
        <Icon className="h-5 w-5 text-foreground/60" />
      </div>
      {loading ? (
        <div className="h-8 w-20 animate-pulse rounded-full bg-foreground/10" />
      ) : (
        <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
      )}
      <p className="mt-1 text-xs font-medium text-foreground/60">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <Inbox className="h-5 w-5 text-foreground/30" />
      </div>
      <p className="text-sm text-foreground/60">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <AlertCircle className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="max-w-sm text-sm text-foreground/60">{message}</p>
      <button
        onClick={onRetry}
        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

export function PromoterOverviewModule({ getToken }: { getToken: () => string }) {
  const [stats, setStats] = useState<PromoterOverviewStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const result = await getMyOverviewStats({ data: { token: getToken() } });
      setStats(result.stats);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = status === "loading";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-foreground/60">Your promotion activity at a glance.</p>
      </div>

      {status === "error" ? (
        <div className="clay p-5">
          <ErrorState message="Couldn't load your overview. Check your connection and try again." onRetry={load} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              icon={Layers3}
              accent="sky"
              label="Batches opted"
              loading={loading}
              value={stats ? String(stats.totalBatchesOpted) : "—"}
            />
            <MetricCard
              icon={IndianRupee}
              accent="mint"
              label="Total earned"
              loading={loading}
              value={stats ? currency.format(stats.totalEarned) : "—"}
            />
            <MetricCard
              icon={Ticket}
              accent="coral"
              label="Coupon uses"
              loading={loading}
              value={stats ? String(stats.couponUsesCount) : "—"}
            />
          </div>

          <div className="clay mt-6 p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Recent purchases via your coupon
            </h2>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="clay-inset h-20 animate-pulse rounded-2xl bg-foreground/5" />
                ))}
              </div>
            ) : !stats || stats.recentSales.length === 0 ? (
              <EmptyState message="No purchases yet — once someone uses your coupon, it'll show up here." />
            ) : (
              <ul className="space-y-2">
                {stats.recentSales.map((s) => (
                  <li key={s.id} className="clay-inset rounded-2xl px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{s.studentName}</p>
                      <span className="shrink-0 text-xs text-foreground/40">{formatDate(s.purchasedAt)}</span>
                    </div>
                    <p className="mb-2 truncate text-xs text-foreground/60">{s.batchName}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <Stat label="Batch price" value={currency.format(s.batchPrice)} />
                      <Stat label="Student off" value={`-${currency.format(s.studentDiscountAmount)}`} />
                      <Stat label="Total paid" value={currency.format(s.totalPaid)} />
                      <Stat label="You earned" value={currency.format(s.promoterEarning)} highlight />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
      <p className={`font-semibold ${highlight ? "text-emerald-700" : "text-foreground/80"}`}>{value}</p>
    </div>
  );
}