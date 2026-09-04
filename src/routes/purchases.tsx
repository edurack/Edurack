import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, BookOpen, Users2, Tag, ArrowRight, CalendarDays, PackageOpen } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getMyPurchases } from "@/server-functions/student-data";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/purchases")({
  component: PurchasesPage,
});

type Purchase = {
  itemType: "bundle" | "mentorship" | "mentorTest";
  itemId: string;
  title: string;
  track: string | null;
  thumbnailUrl: string | null;
  amount: number;
  razorpayPaymentId: string;
  purchasedAt: string | null;
};

type Filter = "all" | "bundle" | "mentorship" | "mentorTest";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PurchasesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const { purchases: rows } = await getMyPurchases({ data: { token } });
      setPurchases(rows as Purchase[]);
    })();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const bundleCount = purchases?.filter((p) => p.itemType === "bundle").length ?? 0;
  const mentorshipCount = purchases?.filter((p) => p.itemType === "mentorship").length ?? 0;
  const mentorTestCount = purchases?.filter((p) => p.itemType === "mentorTest").length ?? 0;
  const filtered = (purchases ?? []).filter((p) => filter === "all" || p.itemType === filter);

  // A Sold Test has no /course/$kind/$id page — it goes to its own
  // dedicated detail/purchase page. Bundles and mentorship batches keep
  // using the existing course hub.
  function goToPurchase(p: Purchase) {
    if (p.itemType === "mentorTest") {
      navigate({ to: "/sold-test/$id", params: { id: p.itemId } });
    } else {
      navigate({ to: "/course/$kind/$id", params: { kind: p.itemType, id: p.itemId } });
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              My Purchases
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Every test series, mentorship batch, and individual test you've bought, in one place.
            </p>
          </div>

          {purchases && purchases.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="All"
                count={purchases.length}
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              <FilterChip
                label="Test Series"
                count={bundleCount}
                active={filter === "bundle"}
                onClick={() => setFilter("bundle")}
              />
              <FilterChip
                label="Mentorship"
                count={mentorshipCount}
                active={filter === "mentorship"}
                onClick={() => setFilter("mentorship")}
              />
              <FilterChip
                label="Individual Tests"
                count={mentorTestCount}
                active={filter === "mentorTest"}
                onClick={() => setFilter("mentorTest")}
              />
            </div>
          )}
        </div>

        {purchases === null ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="clay overflow-hidden p-3">
                <div className="clay-inset h-32 animate-pulse rounded-2xl bg-foreground/5" />
                <div className="p-3 pt-4">
                  <div className="h-4 w-3/4 animate-pulse rounded-full bg-foreground/10" />
                  <div className="mt-3 h-3 w-1/2 animate-pulse rounded-full bg-foreground/10" />
                </div>
              </div>
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="clay p-10 text-center sm:p-14">
            <div className="clay-inset mx-auto grid h-16 w-16 place-items-center rounded-2xl">
              <PackageOpen className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="font-display mt-5 text-lg font-bold text-foreground">Nothing purchased yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-foreground/60">
              Browse test series and mentorship batches from your dashboard to get started.
            </p>
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="clay-btn mt-6 rounded-full px-6 py-2.5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
            >
              Go to dashboard
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="clay p-10 text-center">
            <p className="text-sm text-foreground/60">Nothing in this category yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={`${p.itemType}-${p.itemId}`}
                onClick={() => goToPurchase(p)}
                className="clay group flex flex-col overflow-hidden p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-deep)]"
              >
                <div className="clay-inset relative flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-[var(--sky-soft)]">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : p.itemType === "bundle" ? (
                    <BookOpen className="h-9 w-9 text-foreground/30" strokeWidth={1.5} />
                  ) : p.itemType === "mentorship" ? (
                    <Users2 className="h-9 w-9 text-foreground/30" strokeWidth={1.5} />
                  ) : (
                    <Tag className="h-9 w-9 text-foreground/30" strokeWidth={1.5} />
                  )}
                  <span
                    className={`absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
                      p.itemType === "bundle"
                        ? "bg-[var(--mint-soft)] text-foreground"
                        : p.itemType === "mentorship"
                          ? "bg-[var(--sky-deep)] text-white"
                          : "bg-foreground/80 text-white"
                    }`}
                  >
                    {p.itemType === "bundle" ? (
                      <BookOpen className="h-3 w-3" />
                    ) : p.itemType === "mentorship" ? (
                      <Users2 className="h-3 w-3" />
                    ) : (
                      <Tag className="h-3 w-3" />
                    )}
                    {p.itemType === "bundle" ? "Test Series" : p.itemType === "mentorship" ? "Mentorship" : "Individual Test"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-3 pt-4">
                  <h3 className="mb-1 font-display text-base font-bold leading-snug tracking-tight text-foreground">
                    {p.title}
                  </h3>
                  {p.track && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                      {p.track}
                    </p>
                  )}
                  <div className="mb-3 flex items-center gap-1.5 text-xs text-foreground/50">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {formatDate(p.purchasedAt)} · {currency.format(p.amount)}
                    </span>
                  </div>
                  <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-[var(--sky-deep)]">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
        active ? "clay-btn text-white" : "clay-chip text-foreground/70"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? "bg-white/20" : "bg-foreground/10"
        }`}
      >
        {count}
      </span>
    </button>
  );
}