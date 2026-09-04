import { createFileRoute, FileRoutesByPath, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Timer, Users2, BadgeCheck, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { getPublicSoldTestDetail, hasPurchased } from "@/server-functions/batch-hub";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/server-functions/payments";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout script")));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
    document.body.appendChild(script);
  });
}

export const Route = createFileRoute("/sold-test/$id")({
  component: SoldTestDetailPage,
});

type SoldTestDetail = {
  id: string;
  name: string;
  mentorName: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  price: number;
};

function SoldTestDetailPage() {
  const { id } = Route.useParams() as { id: string };
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<SoldTestDetail | null>(null);
  const [purchased, setPurchased] = useState<boolean | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [{ test: t }, { isPurchased }] = await Promise.all([
        getPublicSoldTestDetail({ data: { token, testId: id } }),
        hasPurchased({ data: { token, itemType: "mentorTest", itemId: id } }),
      ]);
      setTest(t as SoldTestDetail | null);
      setPurchased(isPurchased);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function handlePurchase() {
    if (!user) return;
    setError(null);
    setPurchasing(true);
    try {
      const token = await user.getIdToken();
      const order = await createRazorpayOrder({ data: { token, itemType: "mentorTest", itemId: id } });
      await loadRazorpayScript();

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: order.itemTitle,
        prefill: { email: user.email ?? undefined },
        theme: { color: "#0284c7" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const freshToken = await user.getIdToken();
            await verifyRazorpayPayment({
              data: {
                token: freshToken,
                itemType: "mentorTest",
                itemId: id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            setPurchased(true);
          } catch {
            setError("Payment succeeded but verification failed. Contact support with your payment ID.");
          } finally {
            setPurchasing(false);
          }
        },
        modal: { ondismiss: () => setPurchasing(false) },
      });
      razorpay.open();
    } catch (err) {
      console.error("Checkout start error:", err);
      setError("Could not start checkout. Please try again.");
      setPurchasing(false);
    }
  }

  if (loading || !user || test === null || purchased === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
      </div>
      <AppHeader user={user} />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="clay p-5 sm:p-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">Individual Test</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{test.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/60">
            <Users2 className="h-3.5 w-3.5" /> By {test.mentorName}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="clay-inset px-3.5 py-3">
              <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                <ClipboardList className="h-3 w-3" /> Questions
              </p>
              <p className="text-sm font-semibold text-foreground">{test.totalQuestions}</p>
            </div>
            <div className="clay-inset px-3.5 py-3">
              <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                <Timer className="h-3 w-3" /> Duration
              </p>
              <p className="text-sm font-semibold text-foreground">{test.durationMinutes} min</p>
            </div>
            <div className="clay-inset px-3.5 py-3">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Subjects</p>
              <p className="truncate text-sm font-semibold text-foreground">{test.subjects.join(", ")}</p>
            </div>
          </div>

          {error && (
            <div className="clay-inset mt-4 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-center text-xs font-medium text-foreground">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {purchased ? (
              <button
                onClick={() => navigate({ to: "/test/$testId", params: { testId: id } })}
                className="clay-btn inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold"
              >
                <BadgeCheck className="h-4 w-4" /> Start Test
              </button>
            ) : (
              <>
                <span className="font-display text-xl font-bold text-foreground">₹{test.price.toLocaleString()}</span>
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="clay-btn inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
                >
                  {purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : `Buy for ₹${test.price}`}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}