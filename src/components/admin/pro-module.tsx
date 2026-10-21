// src/components/admin/pro-module.tsx
//
// The "Edurack Pro" tab in admin.dashboard.tsx: create and edit the plans students can buy, set the free
// plan's rules (daily drill limit, which features are Pro-only), gift Pro, and watch sales.
// New Pro features appear here automatically once they're added to PRO_FEATURES in lib/pro.ts.
import { useEffect, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconPencil as Pencil,
  IconCircleCheck as CheckCircle2,
  IconAlertCircle as AlertCircle,
  IconX as X,
} from "@tabler/icons-react";
import { getProAdmin, saveProSettings, saveProPlan, deleteProPlan, giftPro } from "@/server-functions/pro-admin";
import type { ProAdminOverview, ProAdminPlan } from "@/server-functions/pro-admin";
import { MAX_FREE_DRILLS_PER_DAY, PRO_FEATURES, PRO_FEATURE_KEYS } from "@/lib/pro";
import type { ProFeatureKey, ProSettings } from "@/lib/pro";

type AdminUser = { getIdToken: () => Promise<string> };
type PlanForm = { id: string | null; name: string; price: string; durationDays: string; blurb: string; features: ProFeatureKey[]; active: boolean };

const EMPTY_FORM: PlanForm = { id: null, name: "", price: "", durationDays: "30", blurb: "", features: [...PRO_FEATURE_KEYS], active: true };
const DURATION_PRESETS = [30, 90, 180, 365];
const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="clay-inset min-w-[130px] flex-1 rounded-2xl p-3.5">
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
    </div>
  );
}

export function ProModule({ adminUser }: { adminUser: AdminUser }) {
  const [data, setData] = useState<ProAdminOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [settings, setSettings] = useState<ProSettings | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftPlan, setGiftPlan] = useState("");
  const [giftDays, setGiftDays] = useState("30");

  async function load() {
    try {
      const token = await adminUser.getIdToken();
      const d = await getProAdmin({ data: { token } });
      setData(d);
      setSettings(d.settings);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One place for "call the server, show the result, refresh the numbers".
  async function run(action: (token: string) => Promise<unknown>, okText: string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      await action(await adminUser.getIdToken());
      setMsg({ kind: "ok", text: okText });
      after?.();
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  function editPlan(p: ProAdminPlan) {
    setForm({ id: p.id, name: p.name, price: String(p.price), durationDays: String(p.durationDays), blurb: p.blurb, features: p.features, active: p.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFormFeature(k: ProFeatureKey) {
    setForm((f) => (f ? { ...f, features: f.features.includes(k) ? f.features.filter((x) => x !== k) : [...f.features, k] } : f));
  }

  function savePlan() {
    if (!form) return;
    const f = form;
    void run(
      (token) => saveProPlan({ data: { token, id: f.id ?? undefined, plan: { name: f.name, price: Number(f.price), durationDays: Number(f.durationDays), blurb: f.blurb, features: f.features, active: f.active } } }),
      f.id ? "Plan updated." : "Plan created.",
      () => setForm(null),
    );
  }

  function setPlanActive(p: ProAdminPlan, active: boolean) {
    void run((token) => saveProPlan({ data: { token, id: p.id, plan: { name: p.name, price: p.price, durationDays: p.durationDays, blurb: p.blurb, features: p.features, active } } }), active ? "Plan switched on." : "Plan switched off.");
  }

  function removePlan(p: ProAdminPlan) {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    void run((token) => deleteProPlan({ data: { token, id: p.id } }), "Plan deleted.");
  }

  function gift() {
    void run(
      (token) => giftPro({ data: { token, email: giftEmail, planId: giftPlan || undefined, durationDays: Number(giftDays) } }),
      "Pro added for that student.",
      () => setGiftEmail(""),
    );
  }

  if (status === "loading" && !data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (!data || !settings) {
    return (
      <div className="clay p-8 text-center text-sm text-foreground/60">
        Couldn't load Edurack Pro.{" "}
        <button onClick={() => void load()} className="font-semibold underline">
          Retry
        </button>
      </div>
    );
  }

  const liveCount = data.plans.filter((p) => p.active && p.valid).length;
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(data.settings);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Edurack Pro</h2>
        <p className="text-xs text-foreground/60">Decide what's free, what's Pro, and what students can buy.</p>
      </div>

      <div className={`clay flex items-start gap-2 border p-3 text-xs font-medium ${liveCount > 0 ? "border-emerald-300/40 text-emerald-700" : "border-amber-300/50 text-amber-700"}`}>
        {liveCount > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
        <span>
          {liveCount > 0
            ? `Pro is live: ${liveCount} plan${liveCount === 1 ? " is" : "s are"} on sale, so the Pro-only features below are locked for free students.`
            : "Pro is OFF: no plan is on sale, so every feature is free for everyone. Switch on a plan below to start limiting the Pro-only features."}
        </span>
      </div>

      {msg && (
        <div className={`clay flex items-start gap-2 border p-3 text-xs font-medium ${msg.kind === "ok" ? "border-emerald-300/40 text-emerald-700" : "border-rose-300/40 text-rose-600"}`}>
          {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Tile label="Pro students now" value={data.stats.activeStudents} />
        <Tile label="Periods sold or gifted" value={data.stats.totalSales} />
        <Tile label="Revenue" value={rupees(data.stats.revenue)} />
      </div>

      {/* Free plan rules */}
      <section className="clay space-y-3 p-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Free plan rules</h3>
          <p className="text-xs text-foreground/60">Tick "Pro only" to lock a feature behind a plan. Untick it to make it free for everyone. Only applies while a plan is on sale.</p>
        </div>
        <ul className="space-y-2">
          {PRO_FEATURE_KEYS.map((k) => (
            <li key={k} className="clay-inset flex items-start gap-3 rounded-2xl p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.proOnly[k]}
                onChange={(e) => setSettings({ ...settings, proOnly: { ...settings.proOnly, [k]: e.target.checked } })}
                aria-label={`${PRO_FEATURES[k].label} is Pro only`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">
                  {PRO_FEATURES[k].label} <span className="text-[11px] font-semibold text-foreground/50">{settings.proOnly[k] ? "· Pro only" : "· free for everyone"}</span>
                </p>
                <p className="text-xs text-foreground/60">{PRO_FEATURES[k].description}</p>
                {k === "unlimitedDrills" && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground/70">
                    Free timed drills per day
                    <input
                      type="number"
                      min={0}
                      max={MAX_FREE_DRILLS_PER_DAY}
                      value={settings.freeDrillsPerDay}
                      onChange={(e) => setSettings({ ...settings, freeDrillsPerDay: Math.max(0, Math.min(MAX_FREE_DRILLS_PER_DAY, Math.floor(Number(e.target.value) || 0))) })}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                    />
                    <span className="font-normal text-foreground/50">(0 = no free drills; each drill is 20 questions)</span>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button
          onClick={() => void run((token) => saveProSettings({ data: { token, settings } }), "Free plan rules saved.")}
          disabled={busy || !settingsDirty}
          className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Save rules
        </button>
      </section>

      {/* Plans */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">Plans</h3>
          {!form && (
            <button onClick={() => setForm({ ...EMPTY_FORM })} className="clay-btn inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-bold text-white">
              <Plus className="h-3.5 w-3.5" /> New plan
            </button>
          )}
        </div>

        {form && (
          <div className="clay space-y-3 p-4">
            <p className="text-sm font-bold text-foreground">{form.id ? "Edit plan" : "New plan"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-foreground/70">
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Edurack Pro · 1 month" className={field} maxLength={60} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-foreground/70">
                Price (₹)
                <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="199" className={field} />
              </label>
              <div className="space-y-1 text-xs font-semibold text-foreground/70">
                <label htmlFor="pro-plan-days">Length (days)</label>
                <input id="pro-plan-days" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={field} />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DURATION_PRESETS.map((d) => (
                    <button key={d} type="button" onClick={() => setForm({ ...form, durationDays: String(d) })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${form.durationDays === String(d) ? "bg-foreground text-background" : "clay-chip text-foreground/60"}`}>
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <label className="space-y-1 text-xs font-semibold text-foreground/70">
                One-line note shown to students (optional)
                <input value={form.blurb} onChange={(e) => setForm({ ...form, blurb: e.target.value })} placeholder="Best for the last month before the exam" className={field} maxLength={160} />
              </label>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-foreground/70">Includes</legend>
              {PRO_FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-start gap-2 text-sm text-foreground/80">
                  <input type="checkbox" className="mt-1" checked={form.features.includes(k)} onChange={() => toggleFormFeature(k)} />
                  <span>
                    <b className="text-foreground">{PRO_FEATURES[k].label}</b> <span className="text-xs text-foreground/55">{PRO_FEATURES[k].description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              On sale to students
            </label>
            <div className="flex gap-2">
              <button onClick={savePlan} disabled={busy} className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
                {busy ? "Saving…" : form.id ? "Save changes" : "Create plan"}
              </button>
              <button onClick={() => setForm(null)} disabled={busy} className="clay-chip rounded-full px-4 py-2 text-xs font-bold text-foreground/70">
                Cancel
              </button>
            </div>
          </div>
        )}

        {data.plans.length === 0 && !form ? (
          <div className="clay p-6 text-center text-sm text-foreground/60">No plans yet. Create one to turn Pro on.</div>
        ) : (
          <ul className="space-y-2.5">
            {data.plans.map((p) => (
              <li key={p.id} className="clay flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">{p.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${!p.valid ? "bg-rose-100 text-rose-700" : p.active ? "bg-emerald-100 text-emerald-700" : "bg-foreground/10 text-foreground/60"}`}>
                      {!p.valid ? "Can't be sold" : p.active ? "On sale" : "Off"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/60">
                    {rupees(p.price)} · {p.durationDays} days · {p.features.map((k) => PRO_FEATURES[k].label).join(", ")}
                  </p>
                  {!p.valid && <p className="text-[11px] font-semibold text-rose-600">Edit it: the price needs to be at least ₹1 and the length a whole number of days.</p>}
                  {p.blurb && <p className="text-[11px] text-foreground/50">{p.blurb}</p>}
                  <p className="mt-1 text-[11px] text-foreground/50">
                    {p.sold} sold or gifted · {rupees(p.revenue)} revenue
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5 text-foreground/50">
                  <button onClick={() => setPlanActive(p, !p.active)} disabled={busy} className="clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/70 disabled:opacity-50">
                    {p.active ? "Switch off" : "Switch on"}
                  </button>
                  <button onClick={() => editPlan(p)} title="Edit plan" className="hover:text-foreground/80">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => removePlan(p)} disabled={busy} title="Delete plan" className="hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gift Pro */}
      <section className="clay space-y-3 p-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Give Pro to a student</h3>
          <p className="text-xs text-foreground/60">For scholarships, giveaways or fixing a payment problem. It stacks on top of any Pro they already have.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-foreground/70 sm:col-span-1">
            Student email
            <input value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} type="email" placeholder="student@example.com" className={field} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-foreground/70">
            Features
            <select
              value={giftPlan}
              onChange={(e) => {
                setGiftPlan(e.target.value);
                const p = data.plans.find((x) => x.id === e.target.value);
                if (p && p.valid) setGiftDays(String(p.durationDays));
              }}
              className={field}
            >
              <option value="">Everything Pro offers</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  Same as "{p.name}"
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-foreground/70">
            Days
            <input value={giftDays} onChange={(e) => setGiftDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} />
          </label>
        </div>
        <button onClick={gift} disabled={busy || !giftEmail.trim() || !giftDays} className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
          Give Pro
        </button>
      </section>

      {/* Recent activity */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-foreground">Recent Pro periods</h3>
        {data.recent.length === 0 ? (
          <p className="text-xs text-foreground/50">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.recent.map((g) => (
              <li key={g.id} className="clay-inset flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-3 py-2 text-xs text-foreground/70">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${g.source === "gift" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{g.source === "gift" ? "Gift" : "Paid"}</span>
                <span className="font-semibold text-foreground">{g.planName}</span>
                <span>{g.email ?? `student …${g.uid.slice(-6)}`}</span>
                <span>{g.source === "gift" ? "free" : rupees(g.amount)}</span>
                <span className="text-foreground/50">
                  {fmtDate(g.startsAt)} → {fmtDate(g.endsAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
