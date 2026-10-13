// SERVER-ONLY. Signed unsubscribe links, so nobody can opt another student out
// by guessing a uid. Link = /unsubscribe?u=<uid>&k=<kind>&t=<hmac>.
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/growth-emails";

export type OptOutKind = "streak" | "marketing";

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET;
  if (!s) throw new Error("Set UNSUBSCRIBE_SECRET (or CRON_SECRET) so unsubscribe links can be signed.");
  return s;
}

const sign = (uid: string, kind: OptOutKind) => createHmac("sha256", secret()).update(`${uid}|${kind}`).digest("hex").slice(0, 32);

export function unsubscribeUrl(uid: string, kind: OptOutKind): string {
  return `${SITE_URL}/unsubscribe?u=${encodeURIComponent(uid)}&k=${kind}&t=${sign(uid, kind)}`;
}

export function verifyUnsubscribe(uid: string, kind: string, token: string): kind is OptOutKind {
  if (kind !== "streak" && kind !== "marketing") return false;
  const a = Buffer.from(sign(uid, kind));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
