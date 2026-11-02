// /pay/<token> : the page a parent opens from the link their child sent. No account, no sign-in: the parent
// sees what is being bought and for whom (first name only), pays through Razorpay, and Pro switches on for the
// student's account. Never indexed, and kept out of analytics (see lib/analytics-policy.ts) because the
// address holds the token.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Check, ShieldCheck } from "lucide-react";
import { noindexHead } from "@/lib/seo";
import { SiteFooter, SiteHeader, WRAP } from "@/components/landing/site-chrome";
import { createParentPayOrder, getParentPayLink, verifyParentPayment, type ParentPayView } from "@/server-functions/parent-pay";

export const Route = createFileRoute("/pay/$token")({
  loader: async ({ params }): Promise<{ view: ParentPayView }> => {
    try {
      return { view: await getParentPayLink({ data: { token: params.token } }) };
    } catch {
      return { view: { state: "invalid" } };
    }
  },
  head: () => noindexHead("Pay for Edurack Pro"),
  component: ParentPayPage,
});

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

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

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 max-w-xl rounded-3xl border border-border bg-card p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function ParentPayPage() {
  const { view } = Route.useLoaderData();
  const { token } = Route.useParams();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paidUntil, setPaidUntil] = useState<string | null>(null);

  const who = view.state === "ok" || view.state === "paid" ? view.studentName : null;

  async function pay() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const order = await createParentPayOrder({ data: { token } });
      await loadRazorpayScript();
      const rzp = new (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: order.itemTitle,
        theme: { color: "#2b4ea8" },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const res = await verifyParentPayment({ data: { token, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature } });
            setPaidUntil(res.proUntil);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Payment went through but we couldn't confirm it yet. If you were charged, Pro will switch on within a few minutes. Please don't pay again.");
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment. Please try again.");
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (paidUntil) {
    body = (
      <Notice title="Payment received. Thank you!">
        <p>
          Edurack Pro is now active{who ? ` on ${who}'s account` : ""} until <b className="text-foreground">{dateLabel(paidUntil)}</b>. You can close this page.
        </p>
      </Notice>
    );
  } else if (view.state === "paid") {
    body = (
      <Notice title="This link has already been paid">
        <p>{who ? `${who} already has Edurack Pro from this payment.` : "Edurack Pro has already been added from this payment."} Nothing more to do. Thank you!</p>
      </Notice>
    );
  } else if (view.state === "expired") {
    body = (
      <Notice title="This link has expired">
        <p>Payment links stop working after a few days. Please ask your child to open Edurack and send a new one.</p>
      </Notice>
    );
  } else if (view.state === "unavailable") {
    body = (
      <Notice title="This plan isn't available right now">
        <p>Please ask your child to open Edurack and pick a plan again.</p>
      </Notice>
    );
  } else if (view.state === "invalid") {
    body = (
      <Notice title="We couldn't find this payment link">
        <p>The link may have been copied incompletely. Please ask your child to send it again.</p>
      </Notice>
    );
  } else {
    body = (
      <div className="mt-8 max-w-xl">
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {who ? `${who} has asked you to pay for Edurack Pro` : "A student has asked you to pay for Edurack Pro"}
        </h1>
        <p className="mt-3 text-muted-foreground">Edurack is an exam-preparation platform for NEET and JEE. Pro adds extra practice features. You don't need an account to pay.</p>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6">
          <p className="font-display text-lg font-bold">{view.planName}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-display text-4xl font-extrabold tracking-tight">{rupees(view.price)}</span>
            <span className="text-sm text-muted-foreground">for {view.durationDays} days</span>
          </p>
          {view.features.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {view.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" disabled={busy} onClick={() => void pay()} className="clay-btn mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Pay {rupees(view.price)}
          </button>
          {err && (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {err}
            </p>
          )}
        </div>

        <ul className="mt-5 space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Secure payment by Razorpay (UPI, cards, net banking). Edurack never sees your card or UPI details.</span>
          </li>
          <li>Pro is added to {who ? `${who}'s` : "your child's"} Edurack account as soon as the payment is confirmed. The plan does not renew by itself.</li>
          <li>
            Questions about refunds? See the{" "}
            <Link to="/legal/refund" className="font-semibold text-foreground hover:underline">
              refund policy
            </Link>
            .
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pb-16">
        <div className={WRAP}>{body}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
