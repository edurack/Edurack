import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { validateServerEnv } from "./lib/env";

// start.ts is shared/isomorphic — it gets bundled for the client as well as
// the server. Only run the env check when actually running server-side,
// otherwise this throws in the browser where process.env doesn't exist.
if (typeof window === "undefined") {
  validateServerEnv();
}

function isFirebaseAuthError(error: unknown): error is { code: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code.startsWith("auth/")
  );
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Already a framework HTTP error (e.g. thrown redirect/notFound) — let it pass through.
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    // Bad/expired Firebase ID tokens (e.g. from a server function like saveProfile)
    // should come back as a 401 JSON response, not a full HTML error page —
    // the client is expecting to parse JSON from a server function call.
    if (isFirebaseAuthError(error)) {
      console.error("Auth error in server function:", error);
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Your session has expired. Please sign in again." }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    console.error(error);

    // For a document/page request, render the HTML fallback. For anything
    // that looks like an RPC/data request (server function calls, fetches
    // with an Accept: application/json header), return JSON instead so the
    // client-side error handling isn't stuck trying to parse HTML.
    const request = getRequest();
    const wantsJson = request?.headers.get("accept")?.includes("application/json");

    if (wantsJson) {
      return new Response(JSON.stringify({ error: "server_error", message: "Something went wrong." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));