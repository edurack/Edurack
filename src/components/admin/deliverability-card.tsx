// Email health at a glance, shown at the top of Admin → Outreach. Lists every recent bounce with WHO it was,
// WHICH email, WHY it bounced and WHAT to do, so a number on the card is never a mystery.
import { useEffect, useState } from "react";
import { getDeliverability, removeSuppression, type BounceRow, type DeliverabilityView } from "@/server-functions/deliverability";

type AdminUser = { getIdToken: () => Promise<string> };
const REASON: Record<string, string> = { complaint: "Reported spam", hard_bounce: "Address doesn't exist", repeated_bounce: "Kept bouncing", manual: "Blocked manually" };
/** Below this many emails a percentage means little: 2 bounces out of 55 is 3.6%, but it is only 2 emails. */
const MIN_SAMPLE = 200;
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function BounceItem({ b, onUnblock }: { b: BounceRow; onUnblock: () => void }) {
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="break-all text-foreground">{b.email}</b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${b.help.permanent ? "bg-red-500/15 text-red-600" : "bg-amber-400/20 text-amber-700"}`}>{b.help.headline}</span>
        {b.blocked && <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-bold text-foreground/70">Blocked</span>}
        <span className="ml-auto text-[11px] text-foreground/50">{when(b.at)} IST</span>
      </div>

      <p className="mt-1.5 text-foreground/80">
        {b.student ? <>Student: <b>{b.student.name}</b></> : "Not matched to a student account."}
        {b.subject ? <> · Email: “{b.subject}”</> : null}
      </p>

      {b.typoFix && (
        <p className="mt-1.5 rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-amber-800">
          Looks like a typo. Did they mean <b>{b.typoFix}</b>? Ask them to fix it on their profile.
        </p>
      )}

      <p className="mt-1.5"><b className="text-foreground">Why:</b> {b.help.cause}</p>
      <p className="mt-1"><b className="text-foreground">What to do:</b> {b.help.fix}</p>
      {b.providerMessage && <p className="mt-1 break-words text-[11px] text-foreground/45">Mail server said: {b.providerMessage}</p>}
      {b.blocked && (
        <button type="button" onClick={onUnblock} className="mt-1.5 text-[11px] font-semibold text-primary hover:underline">Unblock this address</button>
      )}
    </li>
  );
}

export function DeliverabilityCard({ adminUser }: { adminUser: AdminUser }) {
  const [v, setV] = useState<DeliverabilityView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);

  async function load() {
    try { setV(await getDeliverability({ data: { token: await adminUser.getIdToken() } })); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function unblock(email: string) {
    await removeSuppression({ data: { token: await adminUser.getIdToken(), email } });
    load();
  }

  if (err) return <p className="mb-4 text-xs text-red-500">Deliverability: {err}</p>;
  if (!v) return <div className="clay-inset mb-4 h-14 animate-pulse rounded-2xl" />;

  const connected = v.webhookConfigured && v.lastEventAt !== null;
  const enough = v.sent30d >= MIN_SAMPLE;
  const bounceRate = pct(v.bounces30d, v.sent30d);
  const complaintRate = pct(v.complaints30d, v.sent30d);
  // Rule of thumb, not an official limit. Only judged once there are enough emails for a percentage to mean anything.
  const over = enough && (bounceRate >= 2 || complaintRate >= 0.1);
  const review = v.bounces30d > 0 || v.complaints30d > 0;

  const tone = !connected ? "amber" : over ? "red" : review ? "amber" : "green";
  const label = !v.webhookConfigured ? "Webhook not set up yet"
    : !connected ? "Waiting for the first event from Resend"
    : over ? "Needs attention"
    : review ? `${v.bounces30d + v.complaints30d} to review below`
    : "Looking healthy";
  const isOpen = open ?? (v.bounces.length > 0 || !connected);

  return (
    <div className="mb-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-400" : "bg-emerald-500"}`} aria-hidden />
          <p className="text-sm font-bold text-foreground">Email health</p>
          <p className="text-xs text-foreground/60">{label}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-foreground/70">
          <span><b className="tabular-nums text-foreground">{v.suppressedTotal}</b> blocked</span>
          <span><b className="tabular-nums text-foreground">{v.bounces30d}</b> bounces (30d)</span>
          <span><b className="tabular-nums text-foreground">{v.complaints30d}</b> spam reports (30d)</span>
          <button type="button" onClick={() => setOpen(!isOpen)} className="font-semibold text-primary">{isOpen ? "Hide" : "Details"}</button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs text-foreground/70">
          {!connected && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              Until the Resend webhook is connected, bounced and complained addresses are NOT being blocked. In Resend → Webhooks add
              <code className="mx-1 rounded bg-white/60 px-1">/api/resend-webhook</code> with events <b>email.bounced</b> and <b>email.complained</b>, then set
              <code className="mx-1 rounded bg-white/60 px-1">RESEND_WEBHOOK_SECRET</code>.
            </p>
          )}

          {v.sent30d > 0 && (
            <p>
              {v.sent30d.toLocaleString("en-IN")} campaign and streak emails were sent in 30 days.{" "}
              {enough
                ? `${bounceRate.toFixed(2)}% bounced and ${complaintRate.toFixed(2)}% were reported as spam (rule of thumb: stay under about 2% and 0.1%).`
                : `That's too few to judge a percentage yet (a rate means little under ${MIN_SAMPLE} emails), so look at the individual bounces instead.`}
              {" "}Bounces also include other emails sent through Resend, such as login codes, so the percentage is a rough guide.
            </p>
          )}

          {v.bounces.length > 0 && (
            <div>
              <p className="mb-2 font-bold text-foreground">Recent bounces</p>
              <ul className="space-y-2">
                {v.bounces.map((b, i) => <BounceItem key={`${b.email}-${b.at}-${i}`} b={b} onUnblock={() => unblock(b.email)} />)}
              </ul>
              <p className="mt-2 text-[11px] text-foreground/45">Bounces recorded before this update show "Details not recorded". New ones will include the reason.</p>
            </div>
          )}

          {v.recent.length > 0 && (
            <div>
              <p className="mb-2 font-bold text-foreground">Blocked addresses</p>
              <ul className="space-y-1.5">
                {v.recent.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate"><b className="text-foreground">{r.email}</b> · {REASON[r.reason] ?? r.reason}</span>
                    <button type="button" className="shrink-0 font-semibold text-foreground/50 hover:text-foreground" onClick={() => unblock(r.email)}>Unblock</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {v.bounces.length === 0 && v.recent.length === 0 && connected && <p>No bounces or blocked addresses in the last 30 days.</p>}
        </div>
      )}
    </div>
  );
}
