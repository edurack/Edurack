// Client-side tracker for the question-page funnel (see server-functions/funnel.ts).
// Fire-and-forget: it never blocks the UI, never throws, and does nothing when the
// browser sends Do Not Track.
import { recordFunnelEvent } from "@/server-functions/funnel";
import { track } from "@/lib/analytics";

export type FunnelEvent = "question_view" | "answer_checked" | "gate_shown" | "gate_signup_click" | "gate_login_click" | "auth_return";

const SESSION_KEY = "edurack_funnel_src";
const SEARCH_ENGINES: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\./, "yahoo"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)yandex\./, "yandex"],
];

const clean = (s: string, max: number) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, max);

/** Where this visit came from: a search engine, "direct", a utm_source, another site, or "internal". */
function classify(): string {
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  if (utm) return `utm:${clean(utm, 24)}`;
  if (!document.referrer) return "direct";
  let host: string;
  try {
    host = new URL(document.referrer).hostname.replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (host === window.location.hostname.replace(/^www\./, "")) return "internal";
  const engine = SEARCH_ENGINES.find(([re]) => re.test(host));
  return engine ? engine[1] : `ref:${clean(host, 34)}`;
}

/** The tab's first external source sticks for the whole session, so a later click is credited to how the visitor arrived. */
function sessionSource(): { source: string; landing: boolean } {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return { source: stored, landing: false };
    const source = classify();
    if (source !== "internal") window.sessionStorage.setItem(SESSION_KEY, source);
    return { source, landing: source !== "internal" };
  } catch {
    return { source: classify(), landing: false };
  }
}

export function trackEvent(event: FunnelEvent, opts: { path?: string; detail?: string } = {}): void {
  if (typeof window === "undefined" || navigator.doNotTrack === "1") return;
  try {
    const { source, landing } = sessionSource();
    track(event, { path: opts.path ?? window.location.pathname, source, landing, detail: opts.detail }); // same events, also in PostHog
    void recordFunnelEvent({ data: { event, path: opts.path ?? window.location.pathname, source, landing, detail: opts.detail } }).catch(() => {});
  } catch {
    // never let analytics break the page
  }
}
