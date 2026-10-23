// src/server-functions/posthog-admin.ts
//
// Feeds the admin "Analytics" tab with numbers read from PostHog. Its own file with its own private admin check,
// same convention as pro-admin.ts and blog-admin.ts (requireAdmin must never be imported across
// server-functions files). The PostHog personal API key is read here, on the server, and never sent to the browser.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { createTtlCache } from "@/lib/simple-cache";
import { QUERY_COUNT, buildSnapshot, clampDays, resolveConfig, type PostHogNotConfigured, type PostHogSnapshot } from "@/lib/posthog-admin-core";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// PostHog limits how often its API can be called, so an admin opening the tab repeatedly (or several admins at
// once) is served from here for 10 minutes. "Refresh" bypasses it, but no more than once a minute.
const cache = createTtlCache<PostHogSnapshot & { cachedAt: number }>(10 * 60_000);
const MIN_FORCE_GAP_MS = 60_000;

export const getPostHogSnapshot = createServerFn({ method: "POST" })
  .validator((d: { token: string; days?: number; force?: boolean }) => d)
  .handler(async ({ data }): Promise<PostHogSnapshot | PostHogNotConfigured> => {
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
    const key = `d${days}`;
    const hit = cache.get(key);
    if (hit && !(data.force && Date.now() - hit.cachedAt > MIN_FORCE_GAP_MS)) {
      const { cachedAt: _ignored, ...snapshot } = hit;
      return snapshot;
    }

    const snapshot = await buildSnapshot(cfg.config, days);
    // Don't remember a total failure (e.g. a wrong key): fixing it should work on the very next refresh.
    if (snapshot.failures.length < QUERY_COUNT) cache.set(key, { ...snapshot, cachedAt: Date.now() });
    return snapshot;
  });
