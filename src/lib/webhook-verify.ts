// SERVER-ONLY. Verifies Svix-signed webhooks (Resend uses Svix): HMAC-SHA256 over "<id>.<timestamp>.<raw body>",
// keyed with the base64 part of the "whsec_…" secret. Must be given the RAW request body, not re-serialised JSON.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvix(p: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  body: string;
  /** ms since epoch; injectable for tests */
  now?: number;
  toleranceSec?: number;
}): boolean {
  if (!p.id || !p.timestamp || !p.signatureHeader) return false;
  const ts = Number(p.timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject old (replayed) or far-future deliveries.
  if (Math.abs((p.now ?? Date.now()) / 1000 - ts) > (p.toleranceSec ?? 300)) return false;

  const key = Buffer.from(p.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${p.id}.${p.timestamp}.${p.body}`).digest();
  // Header looks like "v1,<base64> v1,<base64>" (several signatures while a secret is being rotated).
  for (const part of p.signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}
