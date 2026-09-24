// SERVER-ONLY. TanStack Start's exported name for "get the current request"
// has changed across versions (getWebRequest in some, getRequest in others).
// This wrapper tries both so we don't break on a version mismatch.
import * as StartServer from "@tanstack/react-start/server";

export function getCurrentRequest(): Request | undefined {
  const mod = StartServer as unknown as Record<string, unknown>;
  const fn = (mod.getWebRequest ?? mod.getRequest) as (() => Request) | undefined;

  if (typeof fn !== "function") {
    console.error(
      "Neither getWebRequest nor getRequest is exported by @tanstack/react-start/server " +
        "in this version. IP/user-agent capture will be skipped.",
    );
    return undefined;
  }

  try {
    return fn();
  } catch {
    return undefined;
  }
}