import { useEffect, useState } from "react";
import {
  Loader2,
  Users2,
  ImageIcon,
  Inbox,
  AlertCircle,
  RefreshCw,
  Tag,
  CheckCircle2,
  Clock,
  ListChecks,
  ArrowLeft,
} from "lucide-react";
import { listPromotableBatches, requestCoupon, listMyCouponRequests } from "@/server-functions/promoter-portal";
import type { PromotableBatchView, PromoterCouponRequest } from "@/lib/promoter-types";

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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PromoterSelectBatchesModule({ getToken }: { getToken: () => string }) {
  const [view, setView] = useState<"browse" | "opted">("browse");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Select Batches</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {view === "browse" ? "Batches open for promotion right now." : "Batches you've requested a coupon for."}
          </p>
        </div>
        {view === "browse" ? (
          <button
            onClick={() => setView("opted")}
            className="clay-btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Opted batches
          </button>
        ) : (
          <button
            onClick={() => setView("browse")}
            className="clay-btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to batches
          </button>
        )}
      </div>

      {view === "browse" ? <BrowseBatches getToken={getToken} /> : <OptedBatches getToken={getToken} />}
    </div>
  );
}

function BrowseBatches({ getToken }: { getToken: () => string }) {
  const [batches, setBatches] = useState<PromotableBatchView[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [requestingId, setRequestingId] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const result = await listPromotableBatches({ data: { token: getToken() } });
      setBatches(result.batches);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequest(batchId: string) {
    setRequestingId(batchId);
    try {
      await requestCoupon({ data: { token: getToken(), batchId } });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not request a coupon. Try again.");
    } finally {
      setRequestingId(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="clay-inset h-64 animate-pulse rounded-2xl bg-foreground/5" />
        ))}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="clay p-5">
        <ErrorState message="Couldn't load batches. Try again." onRetry={load} />
      </div>
    );
  }
  if (!batches || batches.length === 0) {
    return (
      <div className="clay p-5">
        <EmptyState message="No batches are open for promotion right now — check back soon." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {batches.map((b) => (
        <div key={b.batchId} className="clay flex flex-col p-4">
          <div className="mb-3 h-32 w-full overflow-hidden rounded-2xl bg-foreground/5">
            {b.thumbnailUrl ? (
              <img src={b.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-foreground/20">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </div>

          <p className="truncate text-sm font-bold text-foreground">{b.batchName}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            {b.studentDiscountPercent > 0 && (
              <span className="rounded-full bg-[var(--mint-soft)]/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                {b.studentDiscountPercent}% student off
              </span>
            )}
            <span className="rounded-full bg-[var(--mint-soft)]/60 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              You earn {b.promoterEarningPercent}%
            </span>
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground/50">
            <Users2 className="h-3.5 w-3.5" />
            {b.studentCount} student{b.studentCount !== 1 ? "s" : ""} enrolled
          </p>

          <div className="mt-auto pt-4">
            {b.requestStatus === "none" && (
              <button
                onClick={() => handleRequest(b.batchId)}
                disabled={requestingId === b.batchId}
                className="clay-btn flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold disabled:opacity-70"
              >
                {requestingId === b.batchId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
                Request Coupon
              </button>
            )}
            {b.requestStatus === "pending" && (
              <div className="clay-inset flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold text-foreground/60">
                <Clock className="h-3.5 w-3.5" />
                Pending approval
              </div>
            )}
            {b.requestStatus === "approved" && (
              <div className="clay-inset flex items-center justify-center gap-1.5 rounded-full bg-[var(--mint-soft)]/50 px-4 py-2.5 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Code: {b.couponCode}
              </div>
            )}
            {b.requestStatus === "rejected" && (
              <div className="clay-inset flex items-center justify-center gap-1.5 rounded-full bg-[var(--coral-soft)]/40 px-4 py-2.5 text-xs font-semibold text-foreground/70">
                Request declined
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptedBatches({ getToken }: { getToken: () => string }) {
  const [requests, setRequests] = useState<PromoterCouponRequest[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const result = await listMyCouponRequests({ data: { token: getToken() } });
      setRequests(result.requests);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="clay-inset h-16 animate-pulse rounded-2xl bg-foreground/5" />
        ))}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="clay p-5">
        <ErrorState message="Couldn't load your opted batches." onRetry={load} />
      </div>
    );
  }
  if (!requests || requests.length === 0) {
    return (
      <div className="clay p-5">
        <EmptyState message="You haven't requested a coupon on any batch yet." />
      </div>
    );
  }

  return (
    <div className="clay p-5 sm:p-6">
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="clay-inset flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{r.batchName}</p>
              <p className="text-xs text-foreground/50">
                Requested {formatDate(r.requestedAt)} · Predicted earning {r.predictedEarningPercent}%
              </p>
            </div>
            <div className="shrink-0">
              {r.status === "pending" && (
                <span className="clay-chip inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-foreground/60">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
              {r.status === "approved" && (
                <span className="rounded-full bg-[var(--mint-soft)]/60 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                  {r.couponCode}
                </span>
              )}
              {r.status === "rejected" && (
                <span className="rounded-full bg-[var(--coral-soft)]/40 px-3 py-1.5 text-[11px] font-bold text-foreground/60">
                  Declined
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}