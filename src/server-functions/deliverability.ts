// Admin-only view of email health: how many addresses are blocked, recent bounces/complaints, and whether
// the Resend webhook is actually connected.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

export type DeliverabilityView = {
  webhookConfigured: boolean;
  /** When the webhook last delivered anything; null means it has never fired (so numbers below are unreliable). */
  lastEventAt: string | null;
  suppressedTotal: number;
  bounces30d: number;
  complaints30d: number;
  sent30d: number;
  recent: { email: string; reason: string; at: string }[];
};

export const getDeliverability = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<DeliverabilityView> => {
    await requireAdmin(data.token);
    const { ensureGuardIndexes } = await import("@/lib/email-guard");
    const db = await getDb();
    await ensureGuardIndexes(db);
    const since = new Date(Date.now() - 30 * 864e5);
    const [suppressedTotal, bounces30d, complaints30d, outreachSent, streakSent, last, recent] = await Promise.all([
      db.collection("emailSuppressions").countDocuments({}),
      db.collection("emailEvents").countDocuments({ type: "email.bounced", at: { $gte: since } }),
      db.collection("emailEvents").countDocuments({ type: "email.complained", at: { $gte: since } }),
      db.collection("outreachLog").countDocuments({ status: "sent", sentAt: { $gte: since } }),
      db.collection("streakReminderLog").countDocuments({ status: "sent", sentAt: { $gte: since } }),
      db.collection("webhookEvents").find({}).sort({ at: -1 }).limit(1).toArray(),
      db.collection("emailSuppressions").find({}).sort({ at: -1 }).limit(8).toArray(),
    ]);
    return {
      webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      lastEventAt: last[0]?.at instanceof Date ? last[0].at.toISOString() : null,
      suppressedTotal, bounces30d, complaints30d,
      sent30d: outreachSent + streakSent,
      recent: recent.map((r) => ({ email: String(r.email), reason: String(r.reason), at: (r.at as Date).toISOString() })),
    };
  });

/** For false positives (e.g. a mailbox that was full and has since been cleared). */
export const removeSuppression = createServerFn({ method: "POST" })
  .validator((data: { token: string; email: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await db.collection("emailSuppressions").deleteOne({ email: data.email.trim().toLowerCase() });
    return { ok: true };
  });
