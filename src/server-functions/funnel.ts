// First-party funnel events for the public question pages: where visitors come from,
// whether they check an answer, see the login gate, and click through.
//
// Privacy by design: no cookies, no user id, no IP and no user agent are stored — only
// the event name, the page path (query string stripped), a coarse traffic source
// ("google", "direct", "utm:newsletter"...) and the time. Events expire after 120 days.
// Logged client-side (not in the server render) because edge-cached pages never reach
// the server on a repeat visit.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { getCurrentRequest } from "@/lib/get-request";
import { hitRateLimit } from "@/lib/pyq-public-server";

const EVENTS = ["question_view", "answer_checked", "gate_shown", "gate_signup_click", "gate_login_click", "auth_return"] as const;
const EVENTS_PER_WINDOW = 120; // per IP...
const WINDOW_SECONDS = 60; // ...per minute
const RETENTION_SECONDS = 120 * 24 * 3600;
const BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp/i;

let indexesEnsured = false;

function clientIp(): string {
  const request = getCurrentRequest();
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request?.headers.get("x-real-ip") ?? "unknown";
}

export const recordFunnelEvent = createServerFn({ method: "POST" })
  .validator((data: { event: string; path: string; source: string; landing: boolean; detail?: string }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      if (!(EVENTS as readonly string[]).includes(data.event)) return { ok: false };
      if (typeof data.path !== "string" || !data.path.startsWith("/")) return { ok: false };
      // Crawlers that run JavaScript must not count as visitors.
      if (BOT.test(getCurrentRequest()?.headers.get("user-agent") ?? "")) return { ok: true };

      const path = data.path.split(/[?#]/)[0].slice(0, 200);
      const source = typeof data.source === "string" && /^[a-z0-9._:-]{1,40}$/i.test(data.source) ? data.source.toLowerCase() : "other";
      const detail = typeof data.detail === "string" && /^[a-z0-9_-]{1,20}$/i.test(data.detail) ? data.detail.toLowerCase() : null;

      const db = await getDb();
      if (!(await hitRateLimit(db, `funnel:${clientIp()}`, EVENTS_PER_WINDOW, WINDOW_SECONDS))) return { ok: false };

      const col = db.collection("funnelEvents");
      if (!indexesEnsured) {
        indexesEnsured = true;
        try {
          await col.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
          await col.createIndex({ event: 1, at: -1 });
        } catch {
          // best-effort, same as the other ensure*Indexes helpers
        }
      }
      await col.insertOne({ event: data.event, path, source, landing: data.landing === true, detail, at: new Date() });
      return { ok: true };
    } catch {
      return { ok: false }; // analytics must never surface an error to a student
    }
  });
