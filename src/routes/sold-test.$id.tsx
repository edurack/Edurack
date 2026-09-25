import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconUsersGroup as Users2, IconRosetteDiscountCheck as BadgeCheck, IconClipboardList as ClipboardList, IconPlayerPlayFilled as PlayCircle, IconTag as Tag, IconFileText as FileText } from "@tabler/icons-react";
import { Timer, BarChart3 } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { getPublicSoldTestDetail, hasPurchased } from "@/server-functions/batch-hub";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/server-functions/payments";
import { listMyAttemptsForTest } from "@/server-functions/test-results";

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
  instructions: string;
  price: number;
};

type AttemptSummary = {
  id: string;
  attemptNumber: number;
  score: number;
  totalMarks: number;
  timeTakenMinutes: number;
  submittedAt: string | null;
};

function SoldTestDetailPage() {
  const { id } = Route.useParams() as { id: string };
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<SoldTestDetail | null>(null);
  const [purchased, setPurchased] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function loadAttempts(token: string) {
    const { attempts: rows } = await listMyAttemptsForTest({ data: { token, testId: id } });
    setAttempts(rows as AttemptSummary[]);
  }

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
      if (isPurchased) await loadAttempts(token);
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
        theme: { color: "#2b4ea8" },
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
            await loadAttempts(freshToken);
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

  const bestAttempt = attempts && attempts.length > 0
    ? attempts.reduce((max, a) => (a.score > max.score ? a : max), attempts[0])
    : null;

  const pct = (a: AttemptSummary) => (a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0);
  const hasAttempts = !!attempts && attempts.length > 0;
  const start = () => navigate({ to: "/test/$testId", params: { testId: id } });

  const action = purchased ? (
    <div className="space-y-3">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400"><BadgeCheck className="h-3.5 w-3.5" />You own this test</span>
      {bestAttempt && <p className="text-sm text-muted-foreground">Best so far: <b className="text-foreground">{bestAttempt.score}/{bestAttempt.totalMarks}</b></p>}
      <button onClick={start} className="clay-btn inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 text-[15px]"><PlayCircle className="h-4 w-4" />{hasAttempts ? "Retake test" : "Start test"}</button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="font-display text-4xl font-extrabold tracking-tight">₹{test.price.toLocaleString()}</p>
      <p className="text-sm text-muted-foreground">One-time payment. The test unlocks right after payment.</p>
      <button onClick={handlePurchase} disabled={purchasing} className="clay-btn inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 text-[15px]">
        {purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : `Buy for ₹${test.price.toLocaleString()}`}
      </button>
    </div>
  );

  const mobileAction = purchased ? (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">You own this test</p>
        {bestAttempt && <p className="text-xs text-muted-foreground">Best {bestAttempt.score}/{bestAttempt.totalMarks}</p>}
      </div>
      <button onClick={start} className="clay-btn inline-flex min-h-12 shrink-0 items-center gap-2 px-6 text-[15px]"><PlayCircle className="h-4 w-4" />{hasAttempts ? "Retake" : "Start test"}</button>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <p className="font-display text-2xl font-extrabold tracking-tight">₹{test.price.toLocaleString()}</p>
      <button onClick={handlePurchase} disabled={purchasing} className="clay-btn ml-auto inline-flex min-h-12 items-center gap-2 px-8 text-[15px]">{purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy now"}</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 sm:px-6 lg:pb-14">
        <Link to="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground">← Dashboard</Link>

        <div className="mt-2 grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            {/* Hero */}
            <section className="ink-section rounded-3xl p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Individual test</p>
              <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{test.name}</h1>
              <p className="mt-3 flex items-center gap-1.5 text-white/70"><Users2 className="h-4 w-4" />By {test.mentorName}</p>
              <dl className="mt-7 grid grid-cols-3 divide-x divide-white/15 rounded-2xl border border-white/15">
                {[[<ClipboardList key="q" className="h-3.5 w-3.5" />, "Questions", test.totalQuestions], [<Timer key="t" className="h-3.5 w-3.5" />, "Minutes", test.durationMinutes], [<Tag key="s" className="h-3.5 w-3.5" />, "Subjects", test.subjects.length]].map(([icon, label, v]) => (
                  <div key={label as string} className="px-3 py-4 sm:px-5">
                    <dd className="font-display text-2xl font-extrabold sm:text-3xl">{v as number}</dd>
                    <dt className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-white/60 sm:text-xs">{icon}{label as string}</dt>
                  </div>
                ))}
              </dl>
            </section>

            {/* What's inside */}
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <h2 className="font-display text-base font-extrabold">What's inside</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {test.subjects.map((s) => <span key={s} className="rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-wide">{s}</span>)}
              </div>
              {test.instructions.trim() && (
                <div className="mt-5 border-t border-border pt-5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" />Instructions</p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{test.instructions}</p>
                </div>
              )}
            </section>

            {error && <div className="rounded-2xl border border-destructive/30 px-4 py-3 text-center text-sm font-medium">{error}</div>}

            {/* Attempts */}
            {purchased && (
              <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 whitespace-nowrap font-display text-base font-extrabold"><BarChart3 className="h-4 w-4" />Your attempts</h2>
                  {hasAttempts && bestAttempt && <span className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-bold">{attempts!.length} attempt{attempts!.length === 1 ? "" : "s"} · best {pct(bestAttempt)}%</span>}
                </div>
                {attempts === null ? (
                  <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
                ) : !hasAttempts ? (
                  <p className="py-4 text-sm text-muted-foreground">You haven't attempted this test yet. Your score and analysis will show up here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {attempts.map((a) => (
                      <li key={a.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-bold">Attempt {a.attemptNumber}{bestAttempt?.id === a.id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Best</span>}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{a.score}/{a.totalMarks} · {a.timeTakenMinutes} min{a.submittedAt ? ` · ${new Date(a.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</p>
                          </div>
                          <span className="font-display text-2xl font-extrabold leading-none">{pct(a)}%</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${pct(a)}%` }} /></div>
                        <button onClick={() => navigate({ to: "/test-result/$attemptId", params: { attemptId: a.id } })} className="clay-btn-ghost mt-3 inline-flex min-h-10 items-center gap-1.5 px-4 text-sm"><BarChart3 className="h-4 w-4" />View analysis</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* Desktop action card */}
          <aside className="hidden lg:block"><div className="sticky top-24 rounded-3xl border border-border bg-card p-6">{action}</div></aside>
        </div>
      </main>

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-md">{mobileAction}</div>
      </div>
    </div>
  );
}