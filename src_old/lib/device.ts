// Client-only helper: a persistent per-browser device ID (stored in
// localStorage) plus a human-readable label, used for "devices logged in"
// tracking. This identifies a *browser*, not a physical device — a user
// signed in on Chrome and Firefox on the same laptop shows as two entries.

const DEVICE_ID_KEY = "apronboy_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
// Accessing the dev server over a plain-HTTP LAN IP (e.g. http://192.168.x.x:8080)
// counts as insecure, so we fall back to a Math.random()-based id there —
// fine for a device-tracking label, not used for anything security-sensitive.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";

  return `${browser} on ${os}`;
}