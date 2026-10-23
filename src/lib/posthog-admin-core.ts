// Reads Edurack's own numbers back out of PostHog for the admin "Analytics" tab, so nobody has to log in to
// PostHog just to look at them. Pure logic (config, queries, shaping, insights), so it can be tested without a server.
//
// Only aggregate counts leave PostHog: no person records, no emails, no replays.
// The personal API key stays on the server; the browser only ever receives the shaped numbers.

export type Days = 7 | 30;
export const clampDays = (d: unknown): Days => (d === 30 ? 30 : 7);

export type HogEnv = Partial<Record<"POSTHOG_PERSONAL_API_KEY" | "POSTHOG_PROJECT_ID" | "POSTHOG_APP_HOST" | "POSTHOG_EMBED_URL" | "VITE_PUBLIC_POSTHOG_HOST", string | undefined>>;
export type HogConfig = { key: string; projectId: string; appHost: string; embedUrl: string | null };

/** The events this app sends (see the callers of track() in the app). Order doesn't matter. */
export const TRACKED_EVENTS = [
  "login_completed",
  "drill_started",
  "drill_submitted",
  "test_submitted",
  "session_viewed",
  "session_booking_started",
  "session_booked",
  "session_booking_failed",
  "pro_checkout_started",
  "pro_purchased",
] as const;

/**
 * Sending events and reading them back use different hosts: the browser posts to us.i.posthog.com, while the API
 * lives on us.posthog.com. Derive one from the other for the standard cloud hosts; a custom proxy or a
 * self-hosted PostHog has to say where its API is.
 */
function deriveAppHost(env: HogEnv): { host: string } | { missing: string } {
  const explicit = (env.POSTHOG_APP_HOST ?? "").trim().replace(/\/+$/, "");
  if (explicit) return /^https:\/\/[a-z0-9.-]+$/i.test(explicit) ? { host: explicit } : { missing: "POSTHOG_APP_HOST (must look like https://us.posthog.com)" };
  const ingest = (env.VITE_PUBLIC_POSTHOG_HOST ?? "").trim();
  if (!ingest) return { host: "https://us.posthog.com" };
  try {
    const h = new URL(ingest).hostname;
    if (h.endsWith(".i.posthog.com")) return { host: `https://${h.replace(".i.posthog.com", ".posthog.com")}` };
    if (h === "us.posthog.com" || h === "eu.posthog.com" || h === "app.posthog.com") return { host: `https://${h}` };
  } catch {
    // fall through to asking for it explicitly
  }
  return { missing: "POSTHOG_APP_HOST" };
}

// Only PostHog's own embed pages may be framed inside the admin, so a typo can't put an arbitrary site there.
const EMBED_URL = /^https:\/\/(us|eu|app)\.posthog\.com\/embedded\/[A-Za-z0-9_-]+(\?[A-Za-z0-9_=&.%-]*)?$/;

export function resolveConfig(env: HogEnv): { ok: true; config: HogConfig } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const key = (env.POSTHOG_PERSONAL_API_KEY ?? "").trim();
  if (!key) missing.push("POSTHOG_PERSONAL_API_KEY");
  const projectId = (env.POSTHOG_PROJECT_ID ?? "").trim();
  if (!/^\d{1,12}$/.test(projectId)) missing.push("POSTHOG_PROJECT_ID");
  const host = deriveAppHost(env);
  if ("missing" in host) missing.push(host.missing);
  if (missing.length > 0 || "missing" in host) return { ok: false, missing };
  const embed = (env.POSTHOG_EMBED_URL ?? "").trim();
  return { ok: true, config: { key, projectId, appHost: host.host, embedUrl: EMBED_URL.test(embed) ? embed : null } };
}

// ─── Queries ────────────────────────────────────────────────────────────────────────────────────────
// Every card has its own query, so one failing never blanks the page. "cur"/"prev" are this period and the
// equal-length period before it, which is how every number gets its "vs previous" comparison.
const win = (days: Days) => ({
  cur: `timestamp >= now() - INTERVAL ${days} DAY`,
  prev: `timestamp < now() - INTERVAL ${days} DAY`,
  both: `timestamp >= now() - INTERVAL ${days * 2} DAY`,
  since: `timestamp >= now() - INTERVAL ${days} DAY`,
});
const eventList = TRACKED_EVENTS.map((e) => `'${e}'`).join(", ");

export function overviewQueries(days: Days) {
  const w = win(days);
  return {
    totals: `SELECT count(DISTINCT if(${w.cur}, distinct_id, NULL)) AS visitors, countIf(${w.cur}) AS pageviews, count(DISTINCT if(${w.prev}, distinct_id, NULL)) AS prev_visitors, countIf(${w.prev}) AS prev_pageviews FROM events WHERE event = '$pageview' AND ${w.both}`,
    daily: `SELECT toString(toDate(timestamp)) AS day, countIf(event = '$pageview') AS pageviews, count(DISTINCT if(event = '$pageview', distinct_id, NULL)) AS visitors, count(DISTINCT if(event = 'login_completed' AND toString(properties.needs_onboarding) = 'true', distinct_id, NULL)) AS signups FROM events WHERE event IN ('$pageview', 'login_completed') AND ${w.since} GROUP BY day ORDER BY day`,
    events: `SELECT event, count(DISTINCT if(${w.cur}, distinct_id, NULL)) AS people, countIf(${w.cur}) AS total, sum(if(${w.cur}, toFloat(properties.price), 0)) AS value, count(DISTINCT if(${w.prev}, distinct_id, NULL)) AS prev_people, countIf(${w.prev}) AS prev_total, sum(if(${w.prev}, toFloat(properties.price), 0)) AS prev_value FROM events WHERE event IN (${eventList}) AND ${w.both} GROUP BY event`,
    signups: `SELECT count(DISTINCT if(${w.cur}, distinct_id, NULL)) AS now_n, count(DISTINCT if(${w.prev}, distinct_id, NULL)) AS prev_n FROM events WHERE event = 'login_completed' AND toString(properties.needs_onboarding) = 'true' AND ${w.both}`,
    errors: `SELECT countIf(${w.cur}) AS now_n, countIf(${w.prev}) AS prev_n FROM events WHERE event = '$exception' AND ${w.both}`,
    pages: `SELECT properties.$pathname AS path, count() AS views FROM events WHERE event = '$pageview' AND ${w.since} GROUP BY path ORDER BY views DESC LIMIT 10`,
    sources: `SELECT if(properties.$referring_domain IS NULL OR properties.$referring_domain IN ('', '$direct'), 'Direct', properties.$referring_domain) AS source, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${w.since} GROUP BY source ORDER BY visitors DESC LIMIT 8`,
    devices: `SELECT ifNull(properties.$device_type, 'Unknown') AS device, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${w.since} GROUP BY device ORDER BY visitors DESC`,
  } as const;
}

export function detailQueries(days: Days) {
  const w = win(days);
  return {
    hours: `SELECT toHour(toTimeZone(timestamp, 'Asia/Kolkata')) AS hr, count() AS views FROM events WHERE event = '$pageview' AND ${w.since} GROUP BY hr ORDER BY hr`,
    places: `SELECT ifNull(properties.$geoip_subdivision_1_name, 'Unknown') AS state, ifNull(properties.$geoip_country_name, 'Unknown') AS country, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${w.since} GROUP BY state, country ORDER BY visitors DESC LIMIT 8`,
    drills: `SELECT ifNull(properties.exam, 'unknown') AS exam, ifNull(properties.subject, 'Any subject') AS subject, count() AS started, countIf(toString(properties.custom) = 'true') AS custom FROM events WHERE event = 'drill_started' AND ${w.since} GROUP BY exam, subject ORDER BY started DESC LIMIT 8`,
    sessions: `SELECT properties.offering_id AS id, countIf(event = 'session_viewed') AS views, countIf(event = 'session_booking_started') AS started, countIf(event = 'session_booked') AS booked FROM events WHERE event IN ('session_viewed', 'session_booking_started', 'session_booked') AND ${w.since} GROUP BY id ORDER BY views DESC LIMIT 8`,
    plans: `SELECT properties.plan_id AS id, countIf(event = 'pro_checkout_started') AS checkouts, countIf(event = 'pro_purchased') AS purchases, sum(if(event = 'pro_purchased', toFloat(properties.price), 0)) AS value FROM events WHERE event IN ('pro_checkout_started', 'pro_purchased') AND ${w.since} GROUP BY id ORDER BY checkouts DESC LIMIT 6`,
    vitals: `SELECT ifNull(properties.$device_type, 'Unknown') AS device, count() AS samples, quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp, quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp, quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls FROM events WHERE event = '$web_vitals' AND ${w.since} GROUP BY device ORDER BY samples DESC`,
    errorList: `SELECT properties.$exception_types AS types, properties.$exception_values AS msgs, count() AS n FROM events WHERE event = '$exception' AND ${w.since} GROUP BY types, msgs ORDER BY n DESC LIMIT 5`,
  } as const;
}
export type OverviewCard = keyof ReturnType<typeof overviewQueries>;
export type DetailCard = keyof ReturnType<typeof detailQueries>;
export const OVERVIEW_QUERY_COUNT = Object.keys(overviewQueries(7)).length;
export const DETAIL_QUERY_COUNT = Object.keys(detailQueries(7)).length;

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one HogQL query. Throws a short, admin-readable message on any failure. */
export async function runHogQL(
  cfg: HogConfig,
  sql: string,
  name: string,
  fetchImpl: Fetch = fetch,
  opts: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<unknown[][]> {
  const { timeoutMs = 9_000, retryDelayMs = 1_500 } = opts;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${cfg.appHost}/api/projects/${cfg.projectId}/query/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql, name: `edurack-admin-${name}` } }),
        signal: ctrl.signal,
      });
      if (res.status === 429 && attempt === 0) {
        await sleep(retryDelayMs); // PostHog limits concurrent/hourly queries: wait a moment and try once more
        continue;
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("PostHog refused the key. Check it is a personal API key with the Query: Read scope, and that the project ID is right.");
        if (res.status === 404) throw new Error("PostHog couldn't find that project. Check POSTHOG_PROJECT_ID and the region (US/EU).");
        if (res.status === 429) throw new Error("PostHog is rate-limiting requests. Wait a few minutes and refresh.");
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(`PostHog error ${res.status}${body?.detail ? `: ${String(body.detail).slice(0, 160)}` : ""}`);
      }
      const json = (await res.json()) as { results?: unknown[][] };
      return Array.isArray(json.results) ? json.results : [];
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("PostHog took too long to answer.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Run tasks with at most `limit` in flight (PostHog restricts concurrent queries), never rejecting. */
async function settleLimited<T>(tasks: (() => Promise<T>)[], limit = 3): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await tasks[i]() };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

async function runAll<K extends string>(cfg: HogConfig, queries: Record<K, string>, fetchImpl: Fetch, opts?: { retryDelayMs?: number }) {
  const names = Object.keys(queries) as K[];
  const settled = await settleLimited(names.map((n) => () => runHogQL(cfg, queries[n], n, fetchImpl, opts)));
  const rows = {} as Record<K, unknown[][]>;
  const failures: { card: K; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") rows[names[i]] = r.value;
    else failures.push({ card: names[i], message: r.reason instanceof Error ? r.reason.message : "Unknown error" });
  });
  return { rows, failures };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** For measurements where "no data" must stay distinct from zero (page speed). */
const numOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ─── Shapes ─────────────────────────────────────────────────────────────────────────────────────────
export type EventStat = { people: number; total: number; value: number; prevPeople: number; prevTotal: number; prevValue: number };
export type Overview = {
  days: Days;
  fetchedAt: string;
  appUrl: string;
  embedUrl: string | null;
  totals: { visitors: number; pageviews: number; prevVisitors: number; prevPageviews: number } | null;
  daily: { day: string; pageviews: number; visitors: number; signups: number }[] | null;
  events: Record<string, EventStat> | null;
  signups: { now: number; prev: number } | null;
  errors: { now: number; prev: number } | null;
  topPages: { path: string; views: number }[] | null;
  sources: { source: string; visitors: number }[] | null;
  devices: { device: string; visitors: number }[] | null;
  /** Cards that couldn't load, with a plain reason. Everything else still renders. */
  failures: { card: OverviewCard; message: string }[];
};
export type Details = {
  days: Days;
  fetchedAt: string;
  hours: number[] | null; // pageviews for each hour 0-23, India time
  places: { label: string; visitors: number }[] | null;
  drills: { exam: string; subject: string; started: number; custom: number }[] | null;
  sessions: { id: string; title: string | null; views: number; started: number; booked: number }[] | null;
  plans: { id: string; name: string | null; checkouts: number; purchases: number; value: number }[] | null;
  vitals: { device: string; samples: number; lcp: number | null; inp: number | null; cls: number | null }[] | null;
  errorList: { label: string; count: number }[] | null;
  failures: { card: DetailCard; message: string }[];
};
export type PostHogNotConfigured = { configured: false; missing: string[] };
export type PostHogResult = PostHogNotConfigured | { configured: true; section: "overview"; overview: Overview } | { configured: true; section: "details"; details: Details };

/** Fill days with no traffic so the charts have a bar (an empty one) for every day. */
function fillDays(rows: NonNullable<Overview["daily"]>, days: Days) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const last = rows.length ? rows[rows.length - 1].day : new Date().toISOString().slice(0, 10);
  const out: typeof rows = [];
  const end = new Date(`${last}T00:00:00Z`).getTime();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, pageviews: 0, visitors: 0, signups: 0 });
  }
  return out;
}

export async function buildOverview(cfg: HogConfig, days: Days, fetchImpl: Fetch = fetch, opts?: { retryDelayMs?: number }): Promise<Overview> {
  const { rows, failures } = await runAll(cfg, overviewQueries(days), fetchImpl, opts);
  const ok = (n: OverviewCard) => rows[n] !== undefined;
  return {
    days,
    fetchedAt: new Date().toISOString(),
    appUrl: `${cfg.appHost}/project/${cfg.projectId}`,
    embedUrl: cfg.embedUrl,
    totals: ok("totals") ? { visitors: num(rows.totals[0]?.[0]), pageviews: num(rows.totals[0]?.[1]), prevVisitors: num(rows.totals[0]?.[2]), prevPageviews: num(rows.totals[0]?.[3]) } : null,
    daily: ok("daily") ? fillDays(rows.daily.map((r) => ({ day: String(r[0]), pageviews: num(r[1]), visitors: num(r[2]), signups: num(r[3]) })), days) : null,
    events: ok("events")
      ? Object.fromEntries(rows.events.map((r) => [String(r[0]), { people: num(r[1]), total: num(r[2]), value: num(r[3]), prevPeople: num(r[4]), prevTotal: num(r[5]), prevValue: num(r[6]) }]))
      : null,
    signups: ok("signups") ? { now: num(rows.signups[0]?.[0]), prev: num(rows.signups[0]?.[1]) } : null,
    errors: ok("errors") ? { now: num(rows.errors[0]?.[0]), prev: num(rows.errors[0]?.[1]) } : null,
    topPages: ok("pages") ? rows.pages.filter((r) => r[0]).map((r) => ({ path: String(r[0]), views: num(r[1]) })) : null,
    sources: ok("sources") ? rows.sources.map((r) => ({ source: String(r[0]), visitors: num(r[1]) })) : null,
    devices: ok("devices") ? rows.devices.map((r) => ({ device: String(r[0]), visitors: num(r[1]) })) : null,
    failures,
  };
}

/** PostHog stores exception types/messages as JSON arrays inside a property; make that one readable line. */
export function exceptionLabel(types: unknown, msgs: unknown): string {
  const first = (v: unknown) => {
    if (Array.isArray(v)) return v[0] == null ? "" : String(v[0]);
    if (typeof v === "string") {
      try {
        const p = JSON.parse(v);
        if (Array.isArray(p)) return p[0] == null ? "" : String(p[0]);
      } catch {
        // not JSON: treat as plain text
      }
      return v;
    }
    return "";
  };
  const t = first(types).trim();
  const m = first(msgs).replace(/\s+/g, " ").trim();
  const label = [t, m].filter(Boolean).join(": ");
  return (label || "Unknown error").slice(0, 160);
}

export async function buildDetails(cfg: HogConfig, days: Days, fetchImpl: Fetch = fetch, opts?: { retryDelayMs?: number }): Promise<Details> {
  const { rows, failures } = await runAll(cfg, detailQueries(days), fetchImpl, opts);
  const ok = (n: DetailCard) => rows[n] !== undefined;
  return {
    days,
    fetchedAt: new Date().toISOString(),
    hours: ok("hours")
      ? (() => {
          const h = new Array(24).fill(0) as number[];
          for (const r of rows.hours) {
            const i = num(r[0]);
            if (i >= 0 && i < 24) h[i] = num(r[1]);
          }
          return h;
        })()
      : null,
    places: ok("places") ? rows.places.map((r) => ({ label: String(r[0]) === "Unknown" ? "Unknown location" : `${r[0]}${r[1] && r[1] !== "India" ? `, ${r[1]}` : ""}`, visitors: num(r[2]) })) : null,
    drills: ok("drills") ? rows.drills.map((r) => ({ exam: String(r[0]), subject: String(r[1]), started: num(r[2]), custom: num(r[3]) })) : null,
    sessions: ok("sessions") ? rows.sessions.filter((r) => r[0]).map((r) => ({ id: String(r[0]), title: null, views: num(r[1]), started: num(r[2]), booked: num(r[3]) })) : null,
    plans: ok("plans") ? rows.plans.filter((r) => r[0]).map((r) => ({ id: String(r[0]), name: null, checkouts: num(r[1]), purchases: num(r[2]), value: num(r[3]) })) : null,
    vitals: ok("vitals") ? rows.vitals.map((r) => ({ device: String(r[0]), samples: num(r[1]), lcp: numOrNull(r[2]), inp: numOrNull(r[3]), cls: numOrNull(r[4]) })) : null,
    errorList: ok("errorList") ? rows.errorList.map((r) => ({ label: exceptionLabel(r[0], r[1]), count: num(r[2]) })) : null,
    failures,
  };
}

// ─── Page speed ratings (Google's Core Web Vitals thresholds) ───────────────────────────────────────
export type Rating = "good" | "needs" | "poor";
export const VITAL_LIMITS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] } as const;
export function rateVital(metric: keyof typeof VITAL_LIMITS, value: number | null): Rating | null {
  if (value === null) return null;
  const [good, poor] = VITAL_LIMITS[metric];
  return value <= good ? "good" : value <= poor ? "needs" : "poor";
}

// ─── Funnels and plain-language takeaways ───────────────────────────────────────────────────────────
export const FUNNELS: { title: string; steps: { event: string; label: string }[] }[] = [
  { title: "Practice", steps: [{ event: "login_completed", label: "Signed in or signed up" }, { event: "drill_started", label: "Started a drill" }, { event: "drill_submitted", label: "Finished a drill" }] },
  { title: "Mentor sessions", steps: [{ event: "session_viewed", label: "Viewed a session" }, { event: "session_booking_started", label: "Started booking" }, { event: "session_booked", label: "Booked" }] },
  { title: "Edurack Pro", steps: [{ event: "pro_checkout_started", label: "Opened checkout" }, { event: "pro_purchased", label: "Bought Pro" }] },
];

export type Insight = { tone: "good" | "watch" | "info"; text: string };
const pctStr = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;
const inr = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/**
 * Turns the numbers into a few plain sentences. Each rule needs enough data to mean something, so a quiet week
 * doesn't produce alarming percentages from three visitors.
 */
export function buildInsights(o: Overview, d: Details | null): Insight[] {
  const out: Insight[] = [];
  const days = o.days;
  const ev = (name: string) => o.events?.[name];

  const t = o.totals;
  if (t && t.visitors < 10) {
    out.push({ tone: "info", text: `Only ${t.visitors} visitor${t.visitors === 1 ? "" : "s"} in the last ${days} days so far. Numbers this small swing a lot, so give it more time before drawing conclusions.` });
  } else if (t && t.prevVisitors >= 20) {
    const change = (t.visitors - t.prevVisitors) / t.prevVisitors;
    if (Math.abs(change) >= 0.15) {
      out.push({ tone: change > 0 ? "good" : "watch", text: `Visitors are ${change > 0 ? "up" : "down"} ${Math.round(Math.abs(change) * 100)}% compared with the previous ${days} days (${t.visitors.toLocaleString("en-IN")} vs ${t.prevVisitors.toLocaleString("en-IN")}).` });
    } else {
      out.push({ tone: "info", text: `Traffic is steady: ${t.visitors.toLocaleString("en-IN")} visitors, about the same as the previous ${days} days.` });
    }
  }

  const devTotal = (o.devices ?? []).reduce((a, x) => a + x.visitors, 0);
  const mobile = (o.devices ?? []).find((x) => x.device.toLowerCase() === "mobile");
  if (mobile && devTotal >= 20 && mobile.visitors / devTotal >= 0.6) {
    out.push({ tone: "info", text: `${pctStr(mobile.visitors, devTotal)} of visitors are on a phone, so check every new page on a phone first.` });
  }

  // The weakest step across all funnels that have enough people to judge.
  let worst: { title: string; from: string; to: string; a: number; b: number } | null = null;
  for (const f of FUNNELS) {
    for (let i = 1; i < f.steps.length; i++) {
      const a = ev(f.steps[i - 1].event)?.people ?? 0;
      const b = ev(f.steps[i].event)?.people ?? 0;
      if (a >= 10 && (!worst || b / a < worst.b / worst.a)) worst = { title: f.title, from: f.steps[i - 1].label.toLowerCase(), to: f.steps[i].label.toLowerCase(), a, b };
    }
  }
  if (worst) {
    const rate = worst.b / worst.a;
    out.push({ tone: rate < 0.5 ? "watch" : "info", text: `${worst.title}: of ${worst.a.toLocaleString("en-IN")} people who ${worst.from}, ${worst.b.toLocaleString("en-IN")} ${worst.to} (${pctStr(worst.b, worst.a)}). This is the biggest drop-off right now.` });
  }

  const co = ev("pro_checkout_started");
  const pur = ev("pro_purchased");
  if (pur && pur.total > 0) out.push({ tone: "good", text: `${pur.total} Pro purchase${pur.total === 1 ? "" : "s"} (${inr(pur.value)}) in the last ${days} days.` });
  else if (co && co.people >= 3) out.push({ tone: "watch", text: `${co.people} people opened Pro checkout but nobody has bought yet.` });

  const failedBookings = ev("session_booking_failed");
  if (failedBookings && failedBookings.total > 0) out.push({ tone: "watch", text: `${failedBookings.total} session booking attempt${failedBookings.total === 1 ? "" : "s"} failed. Worth a look in PostHog session replays.` });

  if (o.errors) {
    if (o.errors.now === 0) out.push({ tone: "good", text: "No errors were recorded." });
    else out.push({ tone: "watch", text: `${o.errors.now} error${o.errors.now === 1 ? "" : "s"} recorded (${o.errors.prev} in the previous ${days} days). The most common ones are listed further down.` });
  }

  const top = o.sources?.[0];
  const srcTotal = (o.sources ?? []).reduce((a, x) => a + x.visitors, 0);
  if (top && srcTotal >= 20) out.push({ tone: "info", text: `The biggest source of visitors is ${top.source} (${pctStr(top.visitors, srcTotal)}).` });

  if (d) {
    const m = d.vitals?.find((v) => v.device.toLowerCase() === "mobile");
    const lcp = m ? rateVital("lcp", m.lcp) : null;
    if (m && m.samples >= 20 && m.lcp !== null && lcp === "poor") out.push({ tone: "watch", text: `Pages are slow to load on phones (the main content takes about ${(m.lcp / 1000).toFixed(1)} seconds for a typical visitor; under 2.5 seconds is good).` });
    else if (m && m.samples >= 20 && m.lcp !== null && lcp === "good") out.push({ tone: "good", text: `Pages load quickly on phones (about ${(m.lcp / 1000).toFixed(1)} seconds).` });

    const views = (d.hours ?? []).reduce((a, x) => a + x, 0);
    if (d.hours && views >= 50) {
      const peak = d.hours.indexOf(Math.max(...d.hours));
      out.push({ tone: "info", text: `Traffic peaks around ${hourLabel(peak)}–${hourLabel((peak + 1) % 24)} India time, a good time to publish or send reminders.` });
    }
  }

  const order = { watch: 0, good: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 8);
}
