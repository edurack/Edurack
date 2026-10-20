// The start screen of the timed drill: the standard drill, today's free allowance, and — for Edurack Pro —
// the custom drill builder. Limits are enforced on the server (startPyqDrill); this screen only explains
// them and takes the student to checkout. While no plan is published nothing is limited and the builder is open to all.
import { useCallback, useEffect, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Lock, Sparkles, Timer } from "lucide-react";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/server-functions/payments";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getDrillAccess, getDrillBuilderYears } from "@/server-functions/pro";
import { CUSTOM_DRILL_COUNTS, DRILL_LIMIT_PREFIX, drillsLeft, type CustomDrillInput, type DrillAccess, type ProPlanPublic } from "@/lib/pro";
import { DRILL_MARKS, DRILL_MINUTES, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import type { Difficulty, PyqTree } from "@/lib/pyq-types";

type LauncherUser = { getIdToken: () => Promise<string>; email?: string | null };
export type StartOptions = { custom?: CustomDrillInput; subject?: string };

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

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function UpgradePanel({ user, plans, onPurchased, headline }: { user: LauncherUser; plans: ProPlanPublic[]; onPurchased: () => Promise<void>; headline: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function buy(plan: ProPlanPublic) {
    if (busy) return;
    setErr(null);
    setBusy(plan.id);
    try {
      const token = await user.getIdToken();
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
            await onPurchased();
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

  return (
    <div className="clay-inset mt-5 rounded-2xl p-4 text-left">
      <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
        <Sparkles className="h-4 w-4 text-[var(--sky-deep)]" aria-hidden /> {headline}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-foreground/70">
        <li>• Unlimited timed drills, every day</li>
        <li>• Build your own drill: chapter, topic, difficulty, paper years, length</li>
        <li>• Everything you use free today stays free</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {plans.map((p) => (
          <button key={p.id} type="button" disabled={busy !== null} onClick={() => void buy(p)} className="clay-btn inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60">
            {busy === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
            {p.name} · {rupees(p.price)} · {p.durationDays} days
          </button>
        ))}
      </div>
      {plans.some((p) => p.blurb) && <p className="mt-2 text-[11px] text-foreground/55">{plans.find((p) => p.blurb)?.blurb}</p>}
      {err && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{err}</p>}
    </div>
  );
}

const field = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

function CustomDrillBuilder({ user, exam, starting, onStart }: { user: LauncherUser; exam?: string; starting: boolean; onStart: (o: StartOptions) => void }) {
  const [tree, setTree] = useState<PyqTree | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState<number>(DRILL_QUESTIONS);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const [t, y] = await Promise.all([getPyqTree({ data: { token, exam } }), getDrillBuilderYears({ data: { token, exam } })]);
        if (alive) {
          setTree(t);
          setYears(y);
        }
      } catch {
        // the builder just stays empty; the standard drill above still works
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, exam]);

  const subjectNode = tree?.subjects.find((s) => s.subject === subject);
  const chapterNode = subjectNode?.chapters.find((c) => c.chapter === chapter);
  const toggleYear = (y: string) => setPicked((p) => (p.includes(y) ? p.filter((x) => x !== y) : [...p, y]));

  const start = () =>
    onStart({
      subject: subject || undefined,
      custom: { chapter: chapter || undefined, topic: topic || undefined, difficulty: difficulty || undefined, years: picked.length ? picked : undefined, count },
    });

  return (
    <div className="mt-5 space-y-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-foreground/70">
          Subject
          <select className={`${field} mt-1`} value={subject} onChange={(e) => { setSubject(e.target.value); setChapter(""); setTopic(""); }}>
            <option value="">All subjects</option>
            {tree?.subjects.map((s) => <option key={s.subject} value={s.subject}>{s.subject}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-foreground/70">
          Chapter
          <select className={`${field} mt-1`} value={chapter} disabled={!subjectNode} onChange={(e) => { setChapter(e.target.value); setTopic(""); }}>
            <option value="">{subjectNode ? "Any chapter" : "Pick a subject first"}</option>
            {subjectNode?.chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-foreground/70">
          Topic
          <select className={`${field} mt-1`} value={topic} disabled={!chapterNode} onChange={(e) => setTopic(e.target.value)}>
            <option value="">{chapterNode ? "Any topic" : "Pick a chapter first"}</option>
            {chapterNode?.topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-foreground/70">
          Difficulty
          <select className={`${field} mt-1`} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
            <option value="">Any</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </label>
      </div>

      {years.length > 0 && (
        <fieldset>
          <legend className="text-xs font-bold text-foreground/70">Paper years {picked.length === 0 && <span className="font-medium text-foreground/45">(all)</span>}</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {years.map((y) => (
              <button key={y} type="button" aria-pressed={picked.includes(y)} onClick={() => toggleYear(y)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${picked.includes(y) ? "bg-foreground text-background" : "border border-border text-foreground/70"}`}>
                {y}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-xs font-bold text-foreground/70">Number of questions</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CUSTOM_DRILL_COUNTS.map((n) => (
            <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${count === n ? "bg-foreground text-background" : "border border-border text-foreground/70"}`}>
              {n} · {Math.round(n * 1.5)} min
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" onClick={start} disabled={starting} className="clay-btn inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
        {starting && <Loader2 className="h-4 w-4 animate-spin" />}
        Start my drill
      </button>
    </div>
  );
}

export function DrillLauncher({ user, exam, starting, error, onStart }: { user: LauncherUser; exam?: string; starting: boolean; error: string | null; onStart: (o: StartOptions) => void }) {
  const [access, setAccess] = useState<DrillAccess | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAccess(await getDrillAccess({ data: { token: await user.getIdToken() } }));
    } catch {
      // leave access unknown: the page still works and the server enforces the limits
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const limitMessage = error?.startsWith(DRILL_LIMIT_PREFIX) ? error.slice(DRILL_LIMIT_PREFIX.length).replace(/^:\s*/, "") : null;
  useEffect(() => {
    if (limitMessage) void refresh(); // the server said no: make sure the screen shows why
  }, [limitMessage, refresh]);

  const left = access ? drillsLeft(access) : Infinity;
  const blocked = left === 0;
  const canBuild = access ? !access.gatingOn || access.isPro : false;
  const locked = access ? access.gatingOn && !access.isPro : false;

  return (
    <div className="clay p-6 text-center sm:p-8">
      <div className="clay-inset mx-auto grid h-14 w-14 place-items-center rounded-2xl">
        <Timer className="h-6 w-6 text-[var(--sky-deep)]" aria-hidden />
      </div>
      <h1 className="font-display mt-4 text-2xl font-bold text-foreground">Timed PYQ drill</h1>
      <p className="mt-2 text-sm text-foreground/60">Practise under exam pressure, not at your own pace.</p>

      {access?.isPro && access.proUntil && (
        <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Edurack Pro · until {dateLabel(access.proUntil)}
        </p>
      )}
      {access && locked && (
        <p className="mt-3 text-xs font-semibold text-foreground/70">
          {blocked ? "No free drills left today" : `${left} of ${access.freeLimit} free drills left today`}
        </p>
      )}

      <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-foreground/80">
        <li>• {DRILL_QUESTIONS} previous year questions, mixed across subjects</li>
        <li>• {DRILL_MINUTES} minutes — the clock runs on our server, so a refresh won't reset it</li>
        <li>• +{DRILL_MARKS.correct} for right, {DRILL_MARKS.wrongMcq} for a wrong MCQ, no penalty for skipping</li>
        <li>• Questions you haven't seen come first; every wrong answer goes to your notebook</li>
      </ul>

      {error && !limitMessage && <p className="mt-4 text-xs font-semibold text-destructive">{error}</p>}
      {limitMessage && <p className="mt-4 text-sm font-semibold text-foreground/80">{limitMessage}</p>}

      <button type="button" onClick={() => onStart({})} disabled={starting || blocked} className="clay-btn mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
        {starting && <Loader2 className="h-4 w-4 animate-spin" />}
        Start drill
      </button>

      {access && locked && (blocked || limitMessage) && <UpgradePanel user={user} plans={access.plans} onPurchased={refresh} headline="Keep going with Edurack Pro" />}

      <div className="mt-8 border-t border-border pt-5 text-left">
        {canBuild ? (
          <>
            <button type="button" aria-expanded={showBuilder} onClick={() => setShowBuilder((v) => !v)} className="flex w-full items-center justify-between text-sm font-bold text-foreground">
              <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[var(--sky-deep)]" aria-hidden /> Build your own drill</span>
              <span className="text-xs font-semibold text-foreground/50">{showBuilder ? "Hide" : "Open"}</span>
            </button>
            {showBuilder && <CustomDrillBuilder user={user} exam={exam} starting={starting} onStart={onStart} />}
          </>
        ) : locked ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Lock className="h-4 w-4 text-foreground/50" aria-hidden /> Build your own drill
            </p>
            <p className="mt-1 text-xs text-foreground/60">Pick a chapter or topic, difficulty, paper years and length. Included in Edurack Pro.</p>
            {!(blocked || limitMessage) && access && <UpgradePanel user={user} plans={access.plans} onPurchased={refresh} headline="Unlock custom drills" />}
          </>
        ) : null}
      </div>
    </div>
  );
}
