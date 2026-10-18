import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { validateServerEnv } from "./lib/env";
import { getDb } from "./lib/mongo";
import { edgeCachePolicy } from "./lib/edge-cache";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Fail fast on boot if Firebase Admin / MongoDB config is missing.
validateServerEnv();

// Warm up the MongoDB connection at boot instead of on the first request,
// so the first user hitting a server function doesn't eat the connect
// latency. Failures here are logged but don't crash the server — they'll
// surface again (and get logged) on first actual use if still broken.
void getDb().catch((error) => {
  console.error("MongoDB warmup connection failed:", error);
});

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Adds CDN cache headers to successful anonymous GET page renders on the public
// allowlist in lib/edge-cache.ts. Never overrides a Cache-Control a route set
// itself, and never touches errors, redirects, cookies or non-HTML responses.
function withEdgeCache(request: Request, response: Response): Response {
  if (request.method !== "GET" || response.status !== 200) return response;
  if (response.headers.has("cache-control") || response.headers.has("set-cookie")) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  let policy: string | null = null;
  try {
    policy = edgeCachePolicy(new URL(request.url).pathname);
  } catch {
    return response;
  }
  if (!policy) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", policy);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withEdgeCache(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};