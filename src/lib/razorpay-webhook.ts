// SERVER-ONLY. Verifies Razorpay webhook signatures: hex HMAC-SHA256 of the RAW request body,
// keyed with the webhook secret you set in the Razorpay dashboard (not the API key secret).
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpayWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signatureHeader.trim());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
