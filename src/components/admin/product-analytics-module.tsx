// Admin → Analytics. The numbers from PostHog, inside the admin, so nobody has to log in to PostHog to check
// how the site is doing. Read-only; the data comes from server-functions/posthog-admin.ts.
//
// Built to explain itself: every number says what it counts, arrows compare with the previous period, and a short
// "What stands out" list turns the figures into plain sentences.
import { useCallback, useEffect, useRef, useState } from "react";
import { getPostHogSnapshot } from "@/server-functions/posthog-admin";
import { FUNNELS, buildInsights, rateVital, type Days, type Details, type Insight, type Overview, type Rating } from "@/lib/posthog-admin-core";

type AdminUser = { getIdToken: () => Promise<string> };

const n = (x: number) => x.toLocaleString("en-IN");
const rupees = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;
const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

type Delta = { text: string; tone: "good" | "bad" | "flat" } | null;
/** "▲ 24%" against the previous period. Small bases show the raw old number instead of a misleading percentage. */
function delta(now: number, prev: number, higherIsBetter = true): Delta {
  if (now === 0 && prev === 0) return null;
  if (prev === 0) return { text: "new", tone: higherIsBetter ? "good" : "bad" };
  if (prev < 5) return { text: `was ${prev}`, tone: "flat" };
  const p = Math.round(((now - prev) / prev) * 100);
  if (p === 0) return { text: "no change", tone: "flat" };
  const up = p > 0;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(p)}%`, tone: (higherIsBetter ? up : !up) ? "good" : "bad" };
}

function Kpi({ label, hint, value, sub, change, bad }: { label: string; hint: string; value: string; sub?: string; change?: Delta; bad?: boolean }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p className="font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
        {change && <span className={`text-xs font-bold ${change.tone === "good" ? "text-emerald-600" : change.tone === "bad" ? "text-red-600" : "text-foreground/45"}`}>{change.text}</span>}
      </div>
      {sub && <p className={`text-xs ${bad ? "text-red-600" : "text-foreground/60"}`}>{sub}</p>}
      <p className="mt-1 text-[11px] leading-snug text-foreground/40">{hint}</p>
    </div>
  );
}

function Card({ title, hint, failed, loading, children }: { title: string; hint?: string; failed?: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="clay p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-foreground/45">{hint}</p>}
      </div>
      {failed ? <p className="text-sm text-red-600">Couldn't load this: {failed}</p> : loading ? <p className="text-sm text-foreground/45">Loading…</p> : children}
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

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-sm text-foreground/45">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-foreground/45">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`py-2 ${j > 0 ? "text-right tabular-nums" : "pr-2"} text-foreground`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Daily = NonNullable<Overview["daily"]>;
function DayBars({ data, pick, unit }: { data: Daily; pick: (d: Daily[number]) => number; unit: string }) {
  const max = Math.max(1, ...data.map(pick));
  return (
    <>
      <div className="flex h-28 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.day} title={`${short(d.day)}: ${pick(d)} ${unit}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(pick(d) ? 4 : 1.5, (pick(d) / max) * 100)}%`, opacity: pick(d) ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-foreground/40">
        <span>{data[0] ? short(data[0].day) : ""}</span>
        <span>{data.length ? short(data[data.length - 1].day) : ""}</span>
      </div>
    </>
  );
}

const TONE: Record<Insight["tone"], { dot: string; label: string }> = {
  good: { dot: "bg-emerald-500", label: "Good" },
  watch: { dot: "bg-amber-500", label: "Watch" },
  info: { dot: "bg-sky-500", label: "Note" },
};

const RATING_STYLE: Record<Rating, string> = { good: "bg-emerald-100 text-emerald-800", needs: "bg-amber-100 text-amber-900", poor: "bg-red-100 text-red-800" };
function Vital({ metric, value }: { metric: "lcp" | "inp" | "cls"; value: number | null }) {
  const r = rateVital(metric, value);
  if (value === null || r === null) return <span className="text-foreground/35">–</span>;
  const text = metric === "lcp" ? `${(value / 1000).toFixed(1)} s` : metric === "inp" ? `${Math.round(value)} ms` : value.toFixed(2);
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${RATING_STYLE[r]}`}>{text}</span>;
}

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
  overview,
  details: detailsIn,
  missing,
  days,
  onDays,
  onRefresh,
  busy,
  detailsBusy,
  detailsError,
  error,
}: {
  overview: Overview | null;
  details: Details | null;
  missing: string[] | null;
  days: Days;
  onDays: (d: Days) => void;
  onRefresh: () => void;
  busy: boolean;
  detailsBusy: boolean;
  detailsError?: string | null;
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
  if (missing) return <SetupHelp missing={missing} />;
  if (!overview) return <div className="clay p-6 text-sm text-foreground/50">Loading analytics…</div>;

  const s = overview;
  // Detail cards load separately; never show another period's detail next to this period's headline numbers.
  const details = detailsIn && detailsIn.days === s.days ? detailsIn : null;
  const failed = (card: string) => s.failures.find((f) => f.card === card)?.message;
  // If the whole detail request failed, say so on every detail card instead of showing a misleading "No data yet".
  const dfailed = (card: string) => details?.failures.find((f) => f.card === card)?.message ?? (!details && !detailsBusy && detailsError ? detailsError : undefined);
  const ev = (name: string) => s.events?.[name];
  const bookings = ev("session_booked");
  const pro = ev("pro_purchased");
  const drills = ev("drill_started");
  const updated = new Date(s.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const insights = buildInsights(s, details);
  const hours = details?.hours ?? null;
  const peak = hours && Math.max(...hours) > 0 ? hours.indexOf(Math.max(...hours)) : null;
  const maxHour = hours ? Math.max(1, ...hours) : 1;
  const t = s.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Analytics</h2>
          <p className="text-xs text-foreground/50">Last {s.days} days · arrows compare with the previous {s.days} days · updated {updated} IST (refreshes every 15 minutes)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {insights.length > 0 && (
        <div className="clay p-5">
          <h3 className="font-display text-sm font-bold text-foreground">What stands out</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((i, k) => (
              <li key={k} className="flex gap-3 text-sm text-foreground/85">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[i.tone].dot}`} aria-label={TONE[i.tone].label} />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Visitors" hint="Different browsers that opened any page." value={t ? n(t.visitors) : "–"} change={t ? delta(t.visitors, t.prevVisitors) : null} sub={failed("totals")} bad={!!failed("totals")} />
        <Kpi label="Pageviews" hint="Pages opened in total, repeat visits included." value={t ? n(t.pageviews) : "–"} change={t ? delta(t.pageviews, t.prevPageviews) : null} />
        <Kpi label="New accounts" hint="People who created an account." value={s.signups ? n(s.signups.now) : "–"} change={s.signups ? delta(s.signups.now, s.signups.prev) : null} sub={failed("signups")} bad={!!failed("signups")} />
        <Kpi label="Drills started" hint="Timed practice drills begun." value={drills ? n(drills.total) : "–"} sub={drills ? `${n(drills.people)} people` : undefined} change={drills ? delta(drills.total, drills.prevTotal) : null} />
        <Kpi label="Sessions booked" hint="Mentor sessions booked (free and paid)." value={bookings ? n(bookings.total) : "–"} sub={bookings && bookings.value > 0 ? `${rupees(bookings.value)} booking value` : undefined} change={bookings ? delta(bookings.total, bookings.prevTotal) : null} />
        <Kpi label="Pro purchases" hint="Edurack Pro plans bought." value={pro ? n(pro.total) : "–"} sub={pro && pro.value > 0 ? rupees(pro.value) : undefined} change={pro ? delta(pro.total, pro.prevTotal) : null} />
        <Kpi label="Errors" hint="Things that broke for a visitor." value={s.errors ? n(s.errors.now) : "–"} change={s.errors ? delta(s.errors.now, s.errors.prev, false) : null} bad={!!s.errors?.now} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Visitors per day" hint="Hover a bar for the exact number." failed={failed("daily")}>
          {s.daily && <DayBars data={s.daily} pick={(d) => d.visitors} unit="visitors" />}
        </Card>
        <Card title="New accounts per day" hint="People who signed up that day." failed={failed("daily")}>
          {s.daily && <DayBars data={s.daily} pick={(d) => d.signups} unit="new accounts" />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {FUNNELS.map((f) => {
          const first = ev(f.steps[0].event)?.people ?? 0;
          return (
            <Card key={f.title} title={f.title} hint="People who did each step. Not a strict order." failed={failed("events")}>
              <ul className="space-y-3">
                {f.steps.map((st, i) => {
                  const people = ev(st.event)?.people ?? 0;
                  const before = i > 0 ? (ev(f.steps[i - 1].event)?.people ?? 0) : 0;
                  const lost = i > 0 && before > 0 ? Math.max(0, Math.round((1 - people / before) * 100)) : null;
                  return (
                    <li key={st.event}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-foreground">{st.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {n(people)}
                          {i > 0 && <span className="ml-1 font-normal text-foreground/45">({pct(people, first)})</span>}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${first > 0 ? Math.max(people ? 3 : 0, (people / first) * 100) : 0}%` }} />
                      </div>
                      {lost !== null && lost > 0 && <p className="mt-0.5 text-[11px] text-red-600">{lost}% dropped off before this step</p>}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="When people visit" hint="Pageviews by hour, India time" failed={dfailed("hours")} loading={detailsBusy && !hours}>
          {hours && (
            <>
              <div className="flex h-24 items-end gap-[2px]">
                {hours.map((v, h) => (
                  <div key={h} title={`${hour12(h)}: ${v} pageviews`} className="flex h-full flex-1 flex-col justify-end">
                    <div className={`w-full rounded-t-sm ${h === peak ? "bg-primary" : "bg-primary/45"}`} style={{ height: `${Math.max(v ? 4 : 1.5, (v / maxHour) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-foreground/40">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>11 PM</span>
              </div>
              {peak !== null && <p className="mt-2 text-xs text-foreground/60">Busiest: {hour12(peak)}–{hour12((peak + 1) % 24)}</p>}
            </>
          )}
        </Card>
        <Card title="Where visitors are" hint="Visitors, by state" failed={dfailed("places")} loading={detailsBusy && !details?.places}>
          <Rows rows={(details?.places ?? []).map((p) => ({ label: p.label, n: p.visitors }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What students practise" hint="Drills started, by exam and subject. Custom = built with the Pro drill builder." failed={dfailed("drills")} loading={detailsBusy && !details?.drills}>
          <Table
            head={["Exam · subject", "Started", "Custom"]}
            rows={(details?.drills ?? []).map((d) => [`${d.exam.toUpperCase()} · ${d.subject}`, n(d.started), d.custom ? `${n(d.custom)} (${pct(d.custom, d.started)})` : "0"])}
          />
        </Card>
        <Card title="Mentor sessions: views to bookings" hint="Which sessions people look at, start booking, and finish booking." failed={dfailed("sessions")} loading={detailsBusy && !details?.sessions}>
          <Table
            head={["Session", "Views", "Started", "Booked"]}
            rows={(details?.sessions ?? []).map((x) => [<span key={x.id} className="line-clamp-2">{x.title ?? `Session …${x.id.slice(-4)}`}</span>, n(x.views), n(x.started), `${n(x.booked)}${x.views > 0 ? ` (${pct(x.booked, x.views)})` : ""}`])}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Edurack Pro plans" hint="Checkouts opened against purchases, per plan." failed={dfailed("plans")} loading={detailsBusy && !details?.plans}>
          <Table
            head={["Plan", "Opened checkout", "Bought", "Sales"]}
            rows={(details?.plans ?? []).map((p) => [p.name ?? `Plan …${p.id.slice(-4)}`, n(p.checkouts), n(p.purchases), p.value > 0 ? rupees(p.value) : "–"])}
          />
        </Card>
        <Card title="Page speed" hint="How fast pages feel for a typical visitor (Google's Core Web Vitals)." failed={dfailed("vitals")} loading={detailsBusy && !details?.vitals}>
          <Table
            head={["Device", "Visits measured", "Main content", "Tap response", "Layout shift"]}
            rows={(details?.vitals ?? []).map((v) => [v.device, n(v.samples), <Vital key="l" metric="lcp" value={v.lcp} />, <Vital key="i" metric="inp" value={v.inp} />, <Vital key="c" metric="cls" value={v.cls} />])}
          />
          <p className="mt-3 text-[11px] leading-snug text-foreground/45">Good is: main content under 2.5 s, tap response under 200 ms, layout shift under 0.1. Slower than that shows amber, then red.</p>
        </Card>
      </div>

      <Card title="Most common errors" hint="What broke for visitors, most frequent first." failed={dfailed("errorList")} loading={detailsBusy && !details?.errorList}>
        {(details?.errorList ?? []).length === 0 ? (
          <p className="text-sm text-foreground/45">No errors recorded in this period.</p>
        ) : (
          <>
            <Table head={["Error", "Times"]} rows={(details?.errorList ?? []).map((e) => [<span key={e.label} className="break-words">{e.label}</span>, n(e.count)])} />
            <a href={`${s.appUrl}/error_tracking`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Open Error tracking in PostHog ↗</a>
          </>
        )}
      </Card>

      <details className="clay px-5 py-4 text-sm text-foreground/75">
        <summary className="cursor-pointer font-display text-sm font-bold text-foreground">How to read this page</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Visitor</b> means one browser. Someone using a phone and a laptop counts twice, and clearing cookies counts again.</li>
          <li><b>Arrows</b> compare with the previous period of the same length. With very few people a percentage jumps around, so small numbers are shown as "was 3" instead.</li>
          <li><b>Funnels</b> count the people who did each step in the period, not strictly in order. They show where people fall away, not exact conversion rates.</li>
          <li><b>Booking value</b> is the listed price of booked sessions, not Edurack's commission. Pro sales use the plan price.</li>
          <li>Times are India time (IST). Numbers refresh at most every 15 minutes.</li>
          <li>Private pages (admin, mentor, promoter and intern dashboards, mentor onboarding) are never tracked, and screens are never recorded on sign-in, profile, purchases, booked sessions, tickets and application forms.</li>
        </ul>
      </details>

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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [days, setDays] = useState<Days>(7);
  const [busy, setBusy] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setDetailsBusy(true);
      setError(null);
      setDetailsError(null);
      setMissing(null);
      let token: string;
      try {
        token = await adminUser.getIdToken();
      } catch (e) {
        setError((e as Error).message || "Couldn't sign in to load analytics.");
        setBusy(false);
        setDetailsBusy(false);
        return;
      }
      // Two calls side by side: the headline numbers appear first, the detail cards fill in as they arrive.
      const first = getPostHogSnapshot({ data: { token, days, force, section: "overview" } })
        .then((r) => {
          if (!r.configured) setMissing(r.missing);
          else if (r.section === "overview") setOverview(r.overview);
        })
        .catch((e) => setError((e as Error).message || "Couldn't load analytics."))
        .finally(() => setBusy(false));
      const second = getPostHogSnapshot({ data: { token, days, force, section: "details" } })
        .then((r) => {
          if (r.configured && r.section === "details") setDetails(r.details);
        })
        .catch((e) => {
          setDetails(null);
          setDetailsError((e as Error).message || "Couldn't load the detail cards.");
        })
        .finally(() => setDetailsBusy(false));
      await Promise.all([first, second]);
    },
    [adminUser, days],
  );
  useEffect(() => {
    void load(false);
  }, [load]);

  return <ProductAnalyticsView overview={overview} details={details} missing={missing} days={days} onDays={setDays} onRefresh={() => void load(true)} busy={busy} detailsBusy={detailsBusy} detailsError={detailsError} error={error} />;
}
