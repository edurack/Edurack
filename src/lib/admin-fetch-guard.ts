// Client-only. Makes admin-portal data calls feel instant and stop failing
// on transient hiccups. While the admin dashboard is mounted it wraps
// window.fetch for TanStack server-function calls (/_serverFn/…):
//   • identical in-flight GET calls share ONE request (no duplicate work)
//   • GET results are reused for a short window (tab-switch back = instant)
//   • GET calls that fail with a network error / 5xx are retried quietly
//     (so the "Couldn't load… Try again" screen only shows if it's really down)
//   • any non-GET call clears the cache, so edits are never shown stale
// Mutations (POST) are never retried or cached.

const FN_MARK = "/_serverFn/";
const TTL_MS = 20_000;
const RETRY_DELAYS = [400, 1200];

type Entry = { at: number; promise: Promise<Response> };

export function installAdminFetchGuard(): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as { __adminGuard?: number; fetch: typeof fetch };
  if (w.__adminGuard) {
    w.__adminGuard++;
    return release;
  }
  w.__adminGuard = 1;

  const original = w.fetch.bind(window);
  const cache = new Map<string, Entry>();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function getWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i <= RETRY_DELAYS.length; i++) {
      try {
        const res = await original(input, init);
        if (res.status < 500 || i === RETRY_DELAYS.length) return res;
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") throw err;
        lastErr = err;
        if (i === RETRY_DELAYS.length) throw err;
      }
      await sleep(RETRY_DELAYS[i]);
    }
    throw lastErr;
  }

  w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes(FN_MARK)) return original(input, init);

    const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();

    if (method !== "GET") {
      cache.clear();
      return original(input, init);
    }

    const now = Date.now();
    const hit = cache.get(url);
    if (hit && now - hit.at < TTL_MS) {
      return (await hit.promise).clone();
    }

    const promise = getWithRetry(input, init);
    cache.set(url, { at: now, promise });
    try {
      const res = await promise;
      if (!res.ok) cache.delete(url);
      return res.clone();
    } catch (err) {
      cache.delete(url);
      throw err;
    }
  }) as typeof fetch;

  function release() {
    if (!w.__adminGuard) return;
    w.__adminGuard--;
    if (w.__adminGuard <= 0) {
      w.fetch = original as typeof fetch;
      cache.clear();
      w.__adminGuard = 0;
    }
  }
  return release;
}
