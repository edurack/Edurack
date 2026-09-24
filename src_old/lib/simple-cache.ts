// SERVER-ONLY. Minimal in-memory TTL cache for server-function handlers.
//
// Module-scope Maps persist across warm Lambda invocations on Vercel, and
// reset on cold starts — same tradeoff as the MongoClient singleton in
// mongo.ts. Worst case on a cold start is one extra DB hit, never stale
// data forever.
//
// ONLY wrap data that is:
//   (a) identical for every caller who requests the same key, and
//   (b) fine to be up to `ttlMs` old.
//
// NEVER wrap a value that depends on the caller's identity (anything
// derived from `data.token` / `decoded.uid`). If a function mixes public
// data with a per-user field (e.g. getLeaderboard's `isYou`), cache only
// the public part and compute the per-user part after reading from cache.

type Entry<T> = { value: T; expiresAt: number };

export function createTtlCache<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>();

  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}