// The Edurack Pro plan cards, visible to everyone. Signed-in students buy right here (same Razorpay order +
// verify calls as the upgrade card on the mock drill page); signed-out visitors are sent to create an account
// and come straight back to this page.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/server-functions/payments";
import { PRO_FEATURES, PRO_FEATURE_KEYS, type ProFeatureKey, type ProPlanPublic } from "@/lib/pro";

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const perDay = (p: ProPlanPublic) => p.price / Math.max(1, p.durationDays);
/** The plan with the lowest price per day, but only when there is a choice to make. */
export const bestValueId = (plans: ProPlanPublic[]) => (plans.length > 1 ? [...plans].sort((a, b) => perDay(a) - perDay(b))[0]?.id : null);

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

export function ProPlanCards({ plans, proOnly }: { plans: ProPlanPublic[]; proOnly: Record<ProFeatureKey, boolean> }) {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bought, setBought] = useState(false);
  const bestId = bestValueId(plans);

  async function buy(plan: ProPlanPublic) {
    if (!user || busy) return;
    setErr(null);
    setBusy(plan.id);
    try {
      const token = await user.getIdToken();
      track("pro_checkout_started", { plan_id: plan.id, price: plan.price, from: "pro_page" });
      const order = await createRazorpayOrder({ data: { token, itemType: "proPlan", itemId: plan.id } });
      await loadRazorpayScript();
      const rzp = new (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: order.itemTitle,
        prefill: { email: user.email ?? undefined },
        theme: { color: "#2b4ea8" },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyRazorpayPayment({
              data: { token: await user.getIdToken(), itemType: "proPlan", itemId: plan.id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature },
            });
            track("pro_purchased", { plan_id: plan.id, price: plan.price, from: "pro_page" });
            setBought(true);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Payment went through but we couldn't confirm it yet. If you were charged, Pro will switch on within a few minutes — please don't pay again.");
          } finally {
            setBusy(null);
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
      setBusy(null);
    }
  }

  if (plans.length === 0) return null;

  return (
    <div>
      {bought && (
        <div role="status" className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <b>You're on Edurack Pro.</b> Open{" "}
          <Link to="/pyq" className="font-bold underline">
            PYQ practice
          </Link>{" "}
          to start a drill.
        </div>
      )}
      <ul className={`grid grid-cols-1 gap-4 ${plans.length === 2 ? "sm:grid-cols-2" : plans.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "max-w-md"}`}>
        {plans.map((p) => {
          const included = PRO_FEATURE_KEYS.filter((k) => proOnly[k] && p.features.includes(k));
          const featured = p.id === bestId;
          return (
            <li key={p.id} className={`flex flex-col rounded-3xl border bg-card p-5 sm:p-6 ${featured ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-bold">{p.name}</h3>
                {featured && <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">Best value</span>}
              </div>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-display text-4xl font-extrabold tracking-tight">{rupees(p.price)}</span>
                <span className="text-sm text-muted-foreground">for {p.durationDays} days</span>
              </p>
              {p.durationDays >= 7 && perDay(p) >= 1 && <p className="text-xs text-muted-foreground">about {rupees(Math.round(perDay(p)))} a day</p>}
              {p.blurb && <p className="mt-3 text-sm text-muted-foreground">{p.blurb}</p>}
              <ul className="mt-4 space-y-2 text-sm">
                {included.map((k) => (
                  <li key={k} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>{PRO_FEATURES[k].label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                {user ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void buy(p)}
                    className="clay-btn inline-flex min-h-11 w-full items-center justify-center gap-2 px-5 text-sm disabled:opacity-60"
                  >
                    {busy === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Get {p.name}
                  </button>
                ) : (
                  <Link
                    to="/auth"
                    search={{ tab: "signup", redirect: "/pro" } as any}
                    className={`clay-btn inline-flex min-h-11 w-full items-center justify-center px-5 text-sm ${loading ? "pointer-events-none opacity-60" : ""}`}
                  >
                    Sign up to get {p.name}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!user && !loading && <p className="mt-3 text-xs text-muted-foreground">Already have an account? <Link to="/auth" search={{ tab: "signin", redirect: "/pro" } as any} className="font-semibold text-foreground hover:underline">Log in</Link> to buy.</p>}
      {err && (
        <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">
          {err}
        </p>
      )}
    </div>
  );
}
