// Reads Edurack's own numbers back out of PostHog for the admin "Analytics" tab, so nobody has to log in to
// PostHog just to look at them. Pure logic (config, queries, shaping), so it can be tested without a server.
//
// Only aggregate counts leave PostHog: no person records, no emails, no replays.
// The personal API key stays on the server; the browser only ever receives the shaped numbers.

export type Days = 7 | 30;
export const clampDays = (d: unknown): Days => (d === 30 ? 30 : 7);

export type HogEnv = Partial<Record<"POSTHOG_PERSONAL_API_KEY" | "POSTHOG_PROJECT_ID" | "POSTHOG_APP_HOST" | "POSTHOG_EMBED_URL" | "VITE_PUBLIC_POSTHOG_HOST", string | undefined>>;
export type HogConfig = { key: string; projectId: string; appHost: string; embedUrl: string | null };

/** The events this app sends (see lib/analytics.ts callers). Order doesn't matter. */
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

const since = (days: Days) => `timestamp >= now() - INTERVAL ${days} DAY`;
const eventList = TRACKED_EVENTS.map((e) => `'${e}'`).join(", ");

/** One independent query per card, so one failing never blanks the whole page. */
export function buildQueries(days: Days) {
  return {
    totals: `SELECT count(DISTINCT distinct_id) AS visitors, count() AS pageviews FROM events WHERE event = '$pageview' AND ${since(days)}`,
    daily: `SELECT toString(toDate(timestamp)) AS day, count() AS pageviews, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${since(days)} GROUP BY day ORDER BY day`,
    events: `SELECT event, count(DISTINCT distinct_id) AS people, count() AS total, sum(toFloat(properties.price)) AS value FROM events WHERE event IN (${eventList}) AND ${since(days)} GROUP BY event`,
    pages: `SELECT properties.$pathname AS path, count() AS views FROM events WHERE event = '$pageview' AND ${since(days)} GROUP BY path ORDER BY views DESC LIMIT 10`,
    sources: `SELECT if(properties.$referring_domain IS NULL OR properties.$referring_domain IN ('', '$direct'), 'Direct', properties.$referring_domain) AS source, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${since(days)} GROUP BY source ORDER BY visitors DESC LIMIT 8`,
    devices: `SELECT ifNull(properties.$device_type, 'Unknown') AS device, count(DISTINCT distinct_id) AS visitors FROM events WHERE event = '$pageview' AND ${since(days)} GROUP BY device ORDER BY visitors DESC`,
    errors: `SELECT count() AS errors FROM events WHERE event = '$exception' AND ${since(days)}`,
  } as const;
}
export type QueryName = keyof ReturnType<typeof buildQueries>;
export const QUERY_COUNT = Object.keys(buildQueries(7)).length;

type Fetch = typeof fetch;

/** Run one HogQL query. Throws a short, admin-readable message on any failure. */
export async function runHogQL(cfg: HogConfig, sql: string, name: string, fetchImpl: Fetch = fetch, timeoutMs = 20_000): Promise<unknown[][]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.appHost}/api/projects/${cfg.projectId}/query/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql, name: `edurack-admin-${name}` } }),
      signal: ctrl.signal,
    });
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

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type PostHogSnapshot = {
  configured: true;
  fetchedAt: string;
  days: Days;
  appUrl: string;
  embedUrl: string | null;
  totals: { visitors: number; pageviews: number } | null;
  daily: { day: string; pageviews: number; visitors: number }[] | null;
  events: Record<string, { people: number; total: number; value: number }> | null;
  topPages: { path: string; views: number }[] | null;
  sources: { source: string; visitors: number }[] | null;
  devices: { device: string; visitors: number }[] | null;
  errors: number | null;
  /** Cards that couldn't load, with a plain reason. Everything else still renders. */
  failures: { card: QueryName; message: string }[];
};
export type PostHogNotConfigured = { configured: false; missing: string[] };

/** Fill days with no traffic so the chart has a bar (an empty one) for every day. */
function fillDays(rows: { day: string; pageviews: number; visitors: number }[], days: Days) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const last = rows.length ? rows[rows.length - 1].day : new Date().toISOString().slice(0, 10);
  const out: typeof rows = [];
  const end = new Date(`${last}T00:00:00Z`).getTime();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, pageviews: 0, visitors: 0 });
  }
  return out;
}

export async function buildSnapshot(cfg: HogConfig, days: Days, fetchImpl: Fetch = fetch): Promise<PostHogSnapshot> {
  const queries = buildQueries(days);
  const names = Object.keys(queries) as QueryName[];
  const settled = await Promise.allSettled(names.map((n) => runHogQL(cfg, queries[n], n, fetchImpl)));
  const rows = {} as Record<QueryName, unknown[][]>;
  const failures: PostHogSnapshot["failures"] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") rows[names[i]] = r.value;
    else failures.push({ card: names[i], message: r.reason instanceof Error ? r.reason.message : "Unknown error" });
  });

  const ok = (n: QueryName) => rows[n] !== undefined;
  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    days,
    appUrl: `${cfg.appHost}/project/${cfg.projectId}`,
    embedUrl: cfg.embedUrl,
    totals: ok("totals") ? { visitors: num(rows.totals[0]?.[0]), pageviews: num(rows.totals[0]?.[1]) } : null,
    daily: ok("daily") ? fillDays(rows.daily.map((r) => ({ day: String(r[0]), pageviews: num(r[1]), visitors: num(r[2]) })), days) : null,
    events: ok("events") ? Object.fromEntries(rows.events.map((r) => [String(r[0]), { people: num(r[1]), total: num(r[2]), value: num(r[3]) }])) : null,
    topPages: ok("pages") ? rows.pages.filter((r) => r[0]).map((r) => ({ path: String(r[0]), views: num(r[1]) })) : null,
    sources: ok("sources") ? rows.sources.map((r) => ({ source: String(r[0]), visitors: num(r[1]) })) : null,
    devices: ok("devices") ? rows.devices.map((r) => ({ device: String(r[0]), visitors: num(r[1]) })) : null,
    errors: ok("errors") ? num(rows.errors[0]?.[0]) : null,
    failures,
  };
}
