// Admin → Analytics. The numbers from PostHog, inside the admin, so nobody has to log in to PostHog to check
// how the site is doing. Read-only; the data comes from server-functions/posthog-admin.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { getPostHogSnapshot } from "@/server-functions/posthog-admin";
import type { Days, PostHogNotConfigured, PostHogSnapshot } from "@/lib/posthog-admin-core";

type AdminUser = { getIdToken: () => Promise<string> };
type Result = PostHogSnapshot | PostHogNotConfigured;

const n = (x: number) => x.toLocaleString("en-IN");
const rupees = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;
const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${bad ? "text-red-600" : "text-foreground/50"}`}>{sub}</p>}
    </div>
  );
}

function Card({ title, hint, failed, children }: { title: string; hint?: string; failed?: string; children: React.ReactNode }) {
  return (
    <div className="clay p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-foreground/45">{hint}</p>}
      </div>
      {failed ? <p className="text-sm text-red-600">Couldn't load this: {failed}</p> : children}
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="text-sm text-foreground/45">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-foreground">{r.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{n(r.n)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (r.n / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Each funnel is "how many people did this step in the period". It is not a strict ordered funnel: someone who
// only did step 2 still counts there. Good for spotting where people fall away, not for exact conversion rates.
const FUNNELS: { title: string; steps: { event: string; label: string }[] }[] = [
  { title: "Practice", steps: [{ event: "login_completed", label: "Signed in or signed up" }, { event: "drill_started", label: "Started a drill" }, { event: "drill_submitted", label: "Finished a drill" }] },
  { title: "Mentor sessions", steps: [{ event: "session_viewed", label: "Viewed a session" }, { event: "session_booking_started", label: "Started booking" }, { event: "session_booked", label: "Booked" }] },
  { title: "Edurack Pro", steps: [{ event: "pro_checkout_started", label: "Opened checkout" }, { event: "pro_purchased", label: "Bought Pro" }] },
];

function SetupHelp({ missing }: { missing: string[] }) {
  return (
    <div className="clay p-6">
      <h3 className="font-display text-lg font-bold text-foreground">Connect PostHog to see your numbers here</h3>
      <p className="mt-1 text-sm text-foreground/60">One-time setup, about five minutes. Still missing: <b>{missing.join(", ")}</b>.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground/80">
        <li>In PostHog open your profile (bottom left) → <b>Personal API keys</b> → <b>Create personal API key</b>. Give it the <b>Query: Read</b> scope only, and limit it to your project. Copy the key (it starts with <code>phx_</code>).</li>
        <li>In PostHog → <b>Settings → Project</b>, copy the numeric <b>Project ID</b>.</li>
        <li>In Vercel → your project → <b>Settings → Environment Variables</b>, add <code>POSTHOG_PERSONAL_API_KEY</code> and <code>POSTHOG_PROJECT_ID</code>. Also add <code>POSTHOG_APP_HOST</code> as <code>https://us.posthog.com</code> or <code>https://eu.posthog.com</code>, whichever you use.</li>
        <li>Redeploy, then reopen this tab.</li>
      </ol>
      <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-xs text-foreground/70">
        Keep the key secret: never put it in a variable that starts with <code>VITE_</code> (those are visible to every visitor) and never commit it. It is only ever used on the server.
      </p>
    </div>
  );
}

function EmbeddedDashboard({ url }: { url: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { event?: string; height?: number } | null;
      if (d?.event === "posthog:dimensions" && typeof d.height === "number" && d.height > 200) setHeight(Math.min(d.height, 4000));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <div className="clay overflow-hidden p-2">
      <iframe ref={ref} src={url} title="PostHog dashboard" width="100%" height={height} className="block rounded-xl border-0" loading="lazy" />
    </div>
  );
}

export function ProductAnalyticsView({
  result,
  days,
  onDays,
  onRefresh,
  busy,
  error,
}: {
  result: Result | null;
  days: Days;
  onDays: (d: Days) => void;
  onRefresh: () => void;
  busy: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="clay p-6">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" onClick={onRefresh} className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-semibold">Try again</button>
      </div>
    );
  }
  if (!result) return <div className="clay p-6 text-sm text-foreground/50">Loading analytics…</div>;
  if (!result.configured) return <SetupHelp missing={result.missing} />;

  const s = result;
  const failed = (card: string) => s.failures.find((f) => f.card === card)?.message;
  const ev = (name: string) => s.events?.[name];
  const bookings = ev("session_booked");
  const pro = ev("pro_purchased");
  const updated = new Date(s.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const maxDaily = Math.max(1, ...(s.daily ?? []).map((d) => d.visitors));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Analytics</h2>
          <p className="text-xs text-foreground/50">Last {s.days} days · from PostHog · updated {updated} IST (refreshes every 10 minutes)</p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30] as Days[]).map((d) => (
            <button key={d} type="button" onClick={() => onDays(d)} aria-pressed={days === d} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${days === d ? "border-foreground bg-foreground text-background" : "border-border"}`}>
              {d} days
            </button>
          ))}
          <button type="button" onClick={onRefresh} disabled={busy} className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold disabled:opacity-50">{busy ? "Loading…" : "Refresh"}</button>
          <a href={s.appUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold">Open PostHog ↗</a>
        </div>
      </div>

      {s.failures.length > 0 && <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">Some cards couldn't load, see the red notes below. The rest is fine.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Visitors" value={s.totals ? n(s.totals.visitors) : "–"} sub={failed("totals")} bad={!!failed("totals")} />
        <Kpi label="Pageviews" value={s.totals ? n(s.totals.pageviews) : "–"} />
        <Kpi label="Drills started" value={ev("drill_started") ? n(ev("drill_started")!.total) : "–"} sub={ev("drill_started") ? `${n(ev("drill_started")!.people)} people` : undefined} />
        <Kpi label="Sessions booked" value={bookings ? n(bookings.total) : "–"} sub={bookings && bookings.value > 0 ? `${rupees(bookings.value)} booking value` : undefined} />
        <Kpi label="Pro purchases" value={pro ? n(pro.total) : "–"} sub={pro && pro.value > 0 ? rupees(pro.value) : undefined} />
        <Kpi label="Errors" value={s.errors === null ? "–" : n(s.errors)} sub={s.errors ? "Open PostHog → Error tracking" : undefined} bad={!!s.errors} />
      </div>

      <Card title="Visitors per day" failed={failed("daily")}>
        <div className="flex h-32 items-end gap-[3px]">
          {(s.daily ?? []).map((d) => (
            <div key={d.day} title={`${short(d.day)}: ${d.visitors} visitors, ${d.pageviews} pageviews`} className="flex h-full flex-1 flex-col justify-end">
              <div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(d.visitors ? 4 : 1.5, (d.visitors / maxDaily) * 100)}%`, opacity: d.visitors ? 1 : 0.25 }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-foreground/40">
          <span>{s.daily?.[0] ? short(s.daily[0].day) : ""}</span>
          <span>{s.daily?.length ? short(s.daily[s.daily.length - 1].day) : ""}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {FUNNELS.map((f) => {
          const first = ev(f.steps[0].event)?.people ?? 0;
          return (
            <Card key={f.title} title={f.title} hint="People who did each step. Not a strict order." failed={failed("events")}>
              <ul className="space-y-3">
                {f.steps.map((st, i) => {
                  const people = ev(st.event)?.people ?? 0;
                  return (
                    <li key={st.event}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-foreground">{st.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">{n(people)}{i > 0 && <span className="ml-1 font-normal text-foreground/45">({pct(people, first)})</span>}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${first > 0 ? Math.max(people ? 3 : 0, (people / first) * 100) : 0}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top pages" hint="Pageviews" failed={failed("pages")}>
          <Rows rows={(s.topPages ?? []).map((p) => ({ label: p.path, n: p.views }))} />
        </Card>
        <Card title="Where visitors come from" hint="Visitors, by referring site" failed={failed("sources")}>
          <Rows rows={(s.sources ?? []).map((p) => ({ label: p.source, n: p.visitors }))} />
        </Card>
        <Card title="Devices" hint="Visitors" failed={failed("devices")}>
          <Rows rows={(s.devices ?? []).map((p) => ({ label: p.device, n: p.visitors }))} />
        </Card>
      </div>

      {s.embedUrl && (
        <div>
          <h3 className="mb-2 font-display text-sm font-bold text-foreground">Your PostHog dashboard</h3>
          <EmbeddedDashboard url={s.embedUrl} />
        </div>
      )}
    </div>
  );
}

export function ProductAnalyticsModule({ adminUser }: { adminUser: AdminUser }) {
  const [result, setResult] = useState<Result | null>(null);
  const [days, setDays] = useState<Days>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setError(null);
      try {
        setResult(await getPostHogSnapshot({ data: { token: await adminUser.getIdToken(), days, force } }));
      } catch (e) {
        setError((e as Error).message || "Couldn't load analytics.");
      }
      setBusy(false);
    },
    [adminUser, days],
  );
  useEffect(() => {
    void load(false);
  }, [load]);

  return <ProductAnalyticsView result={result} days={days} onDays={setDays} onRefresh={() => void load(true)} busy={busy} error={error} />;
}
