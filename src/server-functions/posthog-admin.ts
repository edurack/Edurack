// src/server-functions/posthog-admin.ts
//
// Feeds the admin "Analytics" tab with numbers read from PostHog. Its own file with its own private admin check,
// same convention as pro-admin.ts and blog-admin.ts (requireAdmin must never be imported across
// server-functions files). The PostHog personal API key is read here, on the server, and never sent to the browser.
//
// The tab loads in two calls (overview, then details) that run side by side. Each makes only a handful of
// PostHog queries, so each finishes well inside a serverless function's time limit.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { createTtlCache } from "@/lib/simple-cache";
import {
  DETAIL_QUERY_COUNT,
  OVERVIEW_QUERY_COUNT,
  buildDetails,
  buildOverview,
  clampDays,
  resolveConfig,
  type Details,
  type Overview,
  type PostHogResult,
} from "@/lib/posthog-admin-core";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// PostHog limits how often its API can be called, so an admin opening the tab repeatedly (or several admins at
// once) is served from here for 15 minutes. "Refresh" bypasses it, but no more than once a minute.
type Cached = { value: Overview | Details; cachedAt: number };
const cache = createTtlCache<Cached>(15 * 60_000);
const MIN_FORCE_GAP_MS = 60_000;

/** PostHog only knows ids. Swap in the names admins recognise (session titles, Pro plan names). */
async function nameThings(details: Details): Promise<Details> {
  const out = { ...details };
  if (out.sessions?.length) {
    try {
      const { data } = await supabase
        .from("mentor_session_offerings")
        .select("id, title")
        .in(
          "id",
          out.sessions.map((s) => s.id),
        );
      const titles = new Map((data ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
      out.sessions = out.sessions.map((s) => ({ ...s, title: titles.get(s.id) ?? null }));
    } catch {
      // names are a nicety: keep the ids if the lookup fails
    }
  }
  if (out.plans?.length) {
    try {
      const { listActivePlans } = await import("@/lib/pro-server");
      const plans = await listActivePlans(await getDb());
      const names = new Map(plans.map((p) => [String(p.id), p.name]));
      out.plans = out.plans.map((p) => ({ ...p, name: names.get(p.id) ?? null }));
    } catch {
      // same: fall back to the id
    }
  }
  return out;
}

export const getPostHogSnapshot = createServerFn({ method: "POST" })
  .validator((d: { token: string; days?: number; force?: boolean; section?: "overview" | "details" }) => d)
  .handler(async ({ data }): Promise<PostHogResult> => {
    await requireAdmin(data.token);

    const cfg = resolveConfig({
      POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY,
      POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID,
      POSTHOG_APP_HOST: process.env.POSTHOG_APP_HOST,
      POSTHOG_EMBED_URL: process.env.POSTHOG_EMBED_URL,
      VITE_PUBLIC_POSTHOG_HOST: (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ?? process.env.VITE_PUBLIC_POSTHOG_HOST,
    });
    if (!cfg.ok) return { configured: false, missing: cfg.missing };

    const days = clampDays(data.days);
    const section = data.section === "details" ? "details" : "overview";
    const key = `${section}:${days}`;
    const hit = cache.get(key);
    if (hit && !(data.force && Date.now() - hit.cachedAt > MIN_FORCE_GAP_MS)) {
      return section === "overview" ? { configured: true, section, overview: hit.value as Overview } : { configured: true, section, details: hit.value as Details };
    }

    if (section === "overview") {
      const overview = await buildOverview(cfg.config, days);
      // Don't remember a total failure (e.g. a wrong key): fixing it should work on the very next refresh.
      if (overview.failures.length < OVERVIEW_QUERY_COUNT) cache.set(key, { value: overview, cachedAt: Date.now() });
      return { configured: true, section, overview };
    }
    const details = await nameThings(await buildDetails(cfg.config, days));
    if (details.failures.length < DETAIL_QUERY_COUNT) cache.set(key, { value: details, cachedAt: Date.now() });
    return { configured: true, section, details };
  });
