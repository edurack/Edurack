// The start screen of the timed drill: the standard drill, today's free allowance, and — for Edurack Pro —
// the custom drill builder. Limits are enforced on the server (startPyqDrill); this screen only explains
// them and takes the student to checkout. While no plan is published nothing is limited and the builder is open to all.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Check, ChevronDown, Lock, RotateCcw, Sparkles, Timer } from "lucide-react";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/server-functions/payments";
import { track, trackOnce } from "@/lib/analytics";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getMistakeCount } from "@/server-functions/practice-extras";
import { InviteCard } from "@/components/referral/invite-card";
import { getDrillAccess, getDrillBuilderYears } from "@/server-functions/pro";
import { CUSTOM_DRILL_COUNTS, DRILL_LIMIT_PREFIX, PRO_FEATURES, PRO_FEATURE_KEYS, drillsLeft, hasFeature, type CustomDrillInput, type DrillAccess, type ProFeatureKey, type ProPlanPublic } from "@/lib/pro";
import { DRILL_MARKS, DRILL_MINUTES, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { quickMockCopy, quickMockName, quickMockStatus, type QuickMockSource } from "@/lib/quick-mock";
import type { Difficulty, PyqTree } from "@/lib/pyq-types";
import type { ExamKey } from "@/lib/admin-types";

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

const ProTag = () => <span className="rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--sky-deep)]">Pro</span>;

// One number with a caption, for the drill facts grid.
function Fact({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="clay-inset rounded-xl px-3 py-2.5">
      <p className="font-display text-lg font-bold leading-tight text-foreground">{value}</p>
      <p className="text-[11px] leading-snug text-foreground/55">{label}</p>
    </div>
  );
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// The always-visible Edurack Pro card: what Pro includes, where this student stands, and (for students
// who don't have it yet and when plans are on sale) the buy buttons. `canBuy` false = show the features only.
function UpgradePanel({
  user,
  plans,
  onPurchased,
  headline,
  badge,
  badgeTone = "muted",
  freeLimit,
  proOnly,
  owned,
  canBuy = true,
  source,
}: {
  user: LauncherUser;
  plans: ProPlanPublic[];
  onPurchased: () => Promise<void>;
  headline: string;
  badge?: string;
  badgeTone?: "green" | "muted";
  freeLimit?: number;
  /** Which features are Pro-only right now (admin setting); only those are listed as benefits. */
  proOnly: Record<ProFeatureKey, boolean>;
  /** Features this student's Pro already includes (shown ticked). */
  owned: ProFeatureKey[];
  canBuy?: boolean;
  /** Which entry point brought the student to the Quick Mock page (analytics label). */
  source?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Funnel step between "saw a Pro prompt" and "started checkout": how many students actually see the plans, and from where.
  const canShowPlans = canBuy && plans.length > 0;
  useEffect(() => {
    if (canShowPlans) trackOnce(`pro-panel-viewed:${source ?? "direct"}`, "pro_panel_viewed", { source: source ?? "direct", plans: plans.length });
  }, [canShowPlans, plans.length, source]);

  // Many students are under 18 and a parent pays: let them send the plans, prices and what's included in one tap.
  function shareWithParent() {
    track("pro_share_parent_clicked", { source: source ?? "direct" });
    const text = "I want to get Edurack Pro to keep practising for my exam. Here are the plans, prices and what's included: https://www.edurack.in/pro?utm_source=share_parent";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      navigator.share({ title: "Edurack Pro", text }).catch(() => undefined);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }
  }

  async function buy(plan: ProPlanPublic) {
    if (busy) return;
    setErr(null);
    setBusy(plan.id);
    try {
      const token = await user.getIdToken();
      track("quick_mock_upgrade_clicked", { action: "buy", plan_id: plan.id, source: source ?? "direct" });
      track("pro_checkout_started", { plan_id: plan.id, price: plan.price, from: "drill_launcher" });
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
            track("pro_purchased", { plan_id: plan.id, price: plan.price, from: "drill_launcher" });
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

  // The plan with the lowest price per day gets a "Best value" tag, but only when there is a choice.
  const perDay = (p: ProPlanPublic) => p.price / Math.max(1, p.durationDays);
  const bestId = plans.length > 1 ? [...plans].sort((x, y) => perDay(x) - perDay(y))[0]?.id : null;
  const hasPro = owned.length > 0;

  return (
    <section className="ink-section rounded-2xl p-5 text-left sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Edurack Pro
        </p>
        {badge && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeTone === "green" ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-white/70"}`}>{badge}</span>}
      </div>
      <h2 className="font-display mt-2 text-xl font-bold text-white">{headline}</h2>

      <ul className="mt-4 space-y-3">
        {PRO_FEATURE_KEYS.filter((k) => proOnly[k]).map((k) => (
          <li key={k} className="flex gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${owned.includes(k) ? "bg-emerald-400/20" : "bg-white/10"}`}>
              {owned.includes(k) ? <Check className="h-4 w-4 text-emerald-300" aria-hidden /> : k === "unlimitedDrills" ? <Timer className="h-4 w-4 text-sky-300" aria-hidden /> : <Sparkles className="h-4 w-4 text-sky-300" aria-hidden />}
            </span>
            <span className="min-w-0 text-sm">
              <b className="block text-white">{PRO_FEATURES[k].label}</b>
              <span className="text-white/65">
                {PRO_FEATURES[k].description}
                {k === "unlimitedDrills" && freeLimit !== undefined ? (freeLimit === 0 ? " Not part of the free plan." : ` Free plan: ${freeLimit} a day.`) : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-white/50">Everything you use free today (practice, answers, solutions, notebook, the standard drill) stays free.</p>

      {canBuy && plans.length > 0 && (
        <div className={`mt-5 grid gap-3 ${plans.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {plans.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-white">{p.name}</p>
                {p.id === bestId && <span className="shrink-0 rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">Best value</span>}
              </div>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-display text-3xl font-bold text-white">{rupees(p.price)}</span>
                <span className="text-xs text-white/55">for {p.durationDays} days</span>
              </p>
              {p.durationDays >= 7 && perDay(p) >= 1 && <p className="text-[11px] text-white/45">about {rupees(Math.round(perDay(p)))} a day</p>}
              {plans.length > 1 && (
                <p className="mt-2 text-[11px] text-white/55">Includes: {PRO_FEATURE_KEYS.filter((k) => proOnly[k] && p.features.includes(k)).map((k) => PRO_FEATURES[k].label).join(", ") || "—"}</p>
              )}
              {p.blurb && <p className="mt-2 text-xs text-white/60">{p.blurb}</p>}
              <button type="button" disabled={busy !== null} onClick={() => void buy(p)} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-60">
                {busy === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {hasPro ? `Add ${p.durationDays} days` : "Get Pro"}
              </button>
            </div>
          ))}
        </div>
      )}
      {canShowPlans && (
        <button type="button" onClick={shareWithParent} className="mt-4 text-xs font-semibold text-white/70 underline underline-offset-2 hover:text-white">
          Need a parent's go-ahead? Share the plans with them
        </button>
      )}
      {err && <p role="alert" className="mt-3 text-xs font-semibold text-rose-300">{err}</p>}
    </section>
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

export function DrillLauncher({ user, exam, source, preset, starting, error, onStart }: { user: LauncherUser; exam?: string; source?: QuickMockSource; /** A weak chapter sent from a test result. */ preset?: { chapter: string; subject?: string }; starting: boolean; error: string | null; onStart: (o: StartOptions) => void }) {
  const [access, setAccess] = useState<DrillAccess | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  // The Pro plans are one tap away, not the first thing on the page: the free Quick Mock is the point of this screen.
  const [showPro, setShowPro] = useState(false);

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
  const canBuild = access ? hasFeature(access, "customDrillBuilder") : false;
  const canRevise = access ? hasFeature(access, "mistakeRevision") : false;
  // How many questions they got wrong: shown to everyone, because seeing "37 mistakes to revise" is what makes the feature concrete.
  const [mistakes, setMistakes] = useState<number | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const r = await getMistakeCount({ data: { token, exam } });
        if (!off) setMistakes(r.count);
      } catch {
        /* the card simply stays hidden */
      }
    })();
    return () => {
      off = true;
    };
  }, [user, exam]);
  const locked = access ? access.gatingOn && !access.isPro : false;
  // Something Pro-only is still out of reach for this student (free plan, or a plan that doesn't include everything).
  const missing = access ? access.gatingOn && PRO_FEATURE_KEYS.some((k) => access.proOnly[k] && !access.features.includes(k)) : false;

  const mockStatus = quickMockStatus(
    access ? { gatingOn: access.gatingOn, isPro: access.isPro, unlimited: hasFeature(access, "unlimitedDrills"), usedToday: access.usedToday, freeLimit: access.freeLimit, running: access.running } : null,
  );
  const mockCopy = quickMockCopy(mockStatus);
  const proOnlyMock = mockStatus.kind === "pro_only";
  // A student who arrives from a test result for a chapter the free plan can't drill sees the plans straight away:
  // that is the moment they know what Pro would do for them. Otherwise the plans stay one tap away.
  const presetLocked = !!preset && !!access && !canBuild;
  const proOpen = showPro || proOnlyMock || presetLocked; // when the free plan has no Quick Mock at all, the plans are the only way forward
  useEffect(() => {
    if (preset && access) trackOnce("result-drill-preset-shown", "result_drill_preset_shown", { can_build: canBuild, source: source ?? "direct" });
  }, [preset, access, canBuild, source]);

  const limitedFree = access ? access.gatingOn && !hasFeature(access, "unlimitedDrills") : false;
  const builderIsPro = access ? access.gatingOn && access.proOnly.customDrillBuilder : false;

  return (
    <div className="space-y-4">
      {preset && access && (
        <div className="clay p-5 sm:p-6" data-testid="preset-drill-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/50">Your weak chapter</p>
          <h2 className="font-display mt-1 text-xl font-bold text-foreground">{preset.chapter}</h2>
          <p className="mt-1 text-sm text-foreground/60">
            {preset.subject ? `${preset.subject} · ` : ""}
            {DRILL_QUESTIONS} previous year questions on exactly this chapter, timed.
          </p>
          {canBuild ? (
            <button
              type="button"
              disabled={starting}
              onClick={() => {
                track("result_drill_started", { source: source ?? "direct" });
                onStart({ subject: preset.subject, custom: { chapter: preset.chapter, count: DRILL_QUESTIONS } });
              }}
              className="clay-btn mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-60"
            >
              {starting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start chapter drill
            </button>
          ) : (
            <>
              <p className="mt-3 rounded-xl bg-[var(--sky-soft)] px-3.5 py-3 text-sm font-semibold text-foreground/80">
                A timed drill on one chapter is part of Edurack Pro. The plans are just below.
              </p>
              <Link
                to="/pyq"
                search={{ subject: preset.subject, chapter: preset.chapter, practice: true, exam: exam as ExamKey | undefined }}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sky-deep)] hover:underline"
              >
                Or practise this chapter free, untimed
              </Link>
            </>
          )}
        </div>
      )}

      <div className="clay p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
            <Timer className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold text-foreground">{quickMockName(exam)}</h1>
            <p className="text-sm text-foreground/60">{DRILL_QUESTIONS} previous year questions, {DRILL_MINUTES} minutes. Practise under exam pressure, not at your own pace.</p>
          </div>
          {access?.isPro && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-800">
              <Sparkles className="h-3 w-3" aria-hidden /> Pro
            </span>
          )}
        </div>

        {access && (
          <p data-testid="quick-mock-status" className={`mt-4 rounded-xl px-3.5 py-3 text-sm font-bold ${mockStatus.kind === "exhausted" || proOnlyMock ? "bg-[var(--sky-soft)] text-foreground/80" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"}`}>
            {mockCopy.headline}
            {mockCopy.detail && <span className="ml-1.5 text-xs font-semibold opacity-75">{mockCopy.detail}</span>}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Fact value={DRILL_QUESTIONS} label="previous year questions" />
          <Fact value={`${DRILL_MINUTES} min`} label="on a server-side clock" />
          <Fact value={`+${DRILL_MARKS.correct} / ${DRILL_MARKS.wrongMcq}`} label="right / wrong MCQ" />
          <Fact value="New first" label="unseen questions lead" />
        </div>
        <p className="mt-3 text-xs text-foreground/55">A refresh won't reset the clock, skipping costs nothing, and every wrong answer goes to your notebook.</p>
        {access?.bonusUntil && new Date(access.bonusUntil).getTime() > Date.now() && (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Friend bonus: +1 free Quick Mock a day until {new Date(access.bonusUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
          </p>
        )}

        {access && limitedFree && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground/70">
              <span>{access.freeLimit === 0 ? "Quick Mock is part of Edurack Pro" : blocked ? "No free Quick Mocks left today" : `${left} of ${access.freeLimit} free Quick Mock${access.freeLimit === 1 ? "" : "s"} left today`}</span>
              {access.freeLimit > 0 && <span className="text-foreground/40">resets at midnight</span>}
            </div>
            {access.freeLimit > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10" role="presentation">
                <div className="h-full rounded-full bg-[var(--sky-deep)] transition-all" style={{ width: `${Math.max(0, Math.min(100, (Number(left) / access.freeLimit) * 100))}%` }} />
              </div>
            )}
          </div>
        )}

        {error && !limitMessage && <p className="mt-4 text-xs font-semibold text-destructive">{error}</p>}
        {/* The server refused (limit reached): say it in the same words as the banner above, once. */}
        {limitMessage && mockStatus.kind !== "exhausted" && <p className="mt-4 rounded-xl bg-[var(--sky-soft)] px-3 py-2 text-sm font-semibold text-foreground/80">{limitMessage}</p>}

        {/* An unfinished Quick Mock can always be resumed (the server resumes it without using another free one), so "blocked" doesn't apply then. */}
        <button type="button" onClick={() => onStart({})} disabled={starting || (blocked && mockStatus.kind !== "resume") || proOnlyMock} data-testid="quick-mock-start" className="clay-btn mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50">
          {starting && <Loader2 className="h-4 w-4 animate-spin" />}
          {mockStatus.kind === "resume" ? "Resume Quick Mock" : blocked ? "Come back tomorrow for your next one" : proOnlyMock ? "Part of Edurack Pro" : "Start Quick Mock"}
        </button>
      </div>

      {access && mistakes !== null && mistakes >= 5 && (
        <div className="clay p-5 sm:p-6" data-testid="mistake-revision-card">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
              <RotateCcw className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                Revise your mistakes {access.gatingOn && access.proOnly.mistakeRevision && <ProTag />}
              </h2>
              <p className="mt-0.5 text-xs text-foreground/60">
                You have {mistakes} question{mistakes === 1 ? "" : "s"} you got wrong. This builds a timed drill from the oldest ones first, so the mistakes you made longest ago come back before you forget them.
              </p>
            </div>
          </div>
          {canRevise ? (
            <button
              type="button"
              disabled={starting}
              onClick={() => {
                track("mistake_revision_started", { source: source ?? "direct" });
                onStart({ custom: { mistakes: true, count: DRILL_QUESTIONS } });
              }}
              className="clay-btn mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-60"
            >
              {starting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start revision drill
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowPro(true);
                trackOnce(`mistake-revision-upgrade:${source ?? "direct"}`, "mistake_revision_upgrade_clicked", { source: source ?? "direct", mistakes });
              }}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-bold text-foreground hover:bg-foreground/5"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Revise with Edurack Pro
            </button>
          )}
        </div>
      )}

      {access && !access.isPro && access.gatingOn && access.freeLimit > 0 && <InviteCard user={user} source="quick_mock" />}

      {access && !proOpen && (
        <div className="text-center">
          <button
            type="button"
            aria-expanded={false}
            data-testid="explore-pro"
            onClick={() => {
              setShowPro(true);
              trackOnce(`qm-upgrade-explore:${source ?? "direct"}`, "quick_mock_upgrade_clicked", { action: "explore", source: source ?? "direct", state: mockStatus.kind });
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {access.isPro ? "Your Edurack Pro" : "Explore Edurack Pro"} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {access && proOpen && (
        <UpgradePanel
          source={source}
          user={user}
          plans={access.plans}
          onPurchased={refresh}
          freeLimit={access.freeLimit}
          proOnly={access.proOnly}
          owned={access.features}
          canBuy={missing}
          headline={access.isPro ? "You're on Edurack Pro" : presetLocked ? "Drill your weak chapters" : blocked || limitMessage ? "Keep going with Edurack Pro" : missing ? "Practise without limits" : "What Edurack Pro adds"}
          badge={access.isPro ? (access.proUntil ? `Active until ${dateLabel(access.proUntil)}` : "Active") : locked ? "Free plan" : "Free for everyone right now"}
          badgeTone={access.isPro ? "green" : "muted"}
        />
      )}

      {(canBuild || missing) && (
        <div className="clay p-5 sm:p-6">
          {canBuild ? (
            <>
              <button type="button" aria-expanded={showBuilder} onClick={() => setShowBuilder((v) => !v)} className="flex w-full items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
                  <Sparkles className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground">Build your own drill {builderIsPro && <ProTag />}</span>
                  <span className="block text-xs text-foreground/60">Pick the chapter or topic, difficulty, paper years and length.</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${showBuilder ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {showBuilder && (
                <div className="mt-4 border-t border-border pt-4">
                  <CustomDrillBuilder user={user} exam={exam} starting={starting} onStart={onStart} />
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/5">
                <Lock className="h-5 w-5 text-foreground/50" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">Build your own drill <ProTag /></span>
                <span className="block text-xs text-foreground/60">Pick the chapter or topic, difficulty, paper years and length. Included in Edurack Pro: tap "Explore Edurack Pro" above.</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
