// Email health at a glance, shown at the top of Admin → Outreach.
import { useEffect, useState } from "react";
import { getDeliverability, removeSuppression, type DeliverabilityView } from "@/server-functions/deliverability";

type AdminUser = { getIdToken: () => Promise<string> };
const REASON: Record<string, string> = { complaint: "Reported spam", hard_bounce: "Address doesn't exist", repeated_bounce: "Kept bouncing", manual: "Blocked manually" };
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

export function DeliverabilityCard({ adminUser }: { adminUser: AdminUser }) {
  const [v, setV] = useState<DeliverabilityView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try { setV(await getDeliverability({ data: { token: await adminUser.getIdToken() } })); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (err) return <p className="mb-4 text-xs text-red-500">Deliverability: {err}</p>;
  if (!v) return <div className="clay-inset mb-4 h-14 animate-pulse rounded-2xl" />;

  const connected = v.webhookConfigured && v.lastEventAt !== null;
  const bounceRate = pct(v.bounces30d, v.sent30d);
  const complaintRate = pct(v.complaints30d, v.sent30d);
  // Rule of thumb, not an official limit: well under 2% bounces and 0.1% complaints is healthy.
  const watch = connected && (bounceRate >= 2 || complaintRate >= 0.1);

  return (
    <div className="mb-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${!connected ? "bg-amber-400" : watch ? "bg-red-500" : "bg-emerald-500"}`} aria-hidden />
          <p className="text-sm font-bold text-foreground">Email health</p>
          <p className="text-xs text-foreground/60">
            {!v.webhookConfigured ? "Webhook not set up yet" : !connected ? "Waiting for the first event from Resend" : watch ? "Needs attention" : "Looking healthy"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-foreground/70">
          <span><b className="tabular-nums text-foreground">{v.suppressedTotal}</b> blocked</span>
          <span><b className="tabular-nums text-foreground">{v.bounces30d}</b> bounces (30d)</span>
          <span><b className="tabular-nums text-foreground">{v.complaints30d}</b> spam reports (30d)</span>
          <button type="button" onClick={() => setOpen(!open)} className="font-semibold text-primary">{open ? "Hide" : "Details"}</button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs text-foreground/70">
          {!connected && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              Until the Resend webhook is connected, bounced and complained addresses are NOT being blocked. In Resend → Webhooks add
              <code className="mx-1 rounded bg-white/60 px-1">/api/resend-webhook</code> with events <b>email.bounced</b> and <b>email.complained</b>, then set
              <code className="mx-1 rounded bg-white/60 px-1">RESEND_WEBHOOK_SECRET</code>.
            </p>
          )}
          {v.sent30d > 0 && <p>Of {v.sent30d.toLocaleString("en-IN")} emails sent in 30 days: {bounceRate.toFixed(2)}% bounced, {complaintRate.toFixed(2)}% reported spam. (Rule of thumb: keep bounces under about 2% and spam reports under about 0.1%.)</p>}
          {v.recent.length === 0 ? <p>No blocked addresses yet.</p> : (
            <ul className="space-y-1.5">
              {v.recent.map((r) => (
                <li key={r.email} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate"><b className="text-foreground">{r.email}</b> · {REASON[r.reason] ?? r.reason}</span>
                  <button type="button" className="shrink-0 font-semibold text-foreground/50 hover:text-foreground" onClick={async () => { await removeSuppression({ data: { token: await adminUser.getIdToken(), email: r.email } }); load(); }}>Unblock</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
