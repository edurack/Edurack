// Admin-only view of email health: how many addresses are blocked, recent bounces/complaints, and whether
// the Resend webhook is actually connected.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { explainBounce, suggestEmailFix, type BounceHelp } from "@/lib/bounce-help";

export type BounceRow = {
  email: string;
  at: string;
  /** Subject of the email that bounced, e.g. a login code vs a campaign. null for bounces logged before details were saved. */
  subject: string | null;
  type: string | null;
  subType: string | null;
  providerMessage: string | null;
  student: { uid: string; name: string } | null;
  /** Corrected address if the domain looks like a typo (gmial.com → gmail.com). */
  typoFix: string | null;
  blocked: boolean;
  help: BounceHelp;
};

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
  bounces: BounceRow[];
};

export const getDeliverability = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<DeliverabilityView> => {
    await requireAdmin(data.token);
    const { ensureGuardIndexes, suppressedSet } = await import("@/lib/email-guard");
    const db = await getDb();
    await ensureGuardIndexes(db);
    const since = new Date(Date.now() - 30 * 864e5);
    const [suppressedTotal, bounces30d, complaints30d, outreachSent, streakSent, last, recent, bounceDocs] = await Promise.all([
      db.collection("emailSuppressions").countDocuments({}),
      db.collection("emailEvents").countDocuments({ type: "email.bounced", at: { $gte: since } }),
      db.collection("emailEvents").countDocuments({ type: "email.complained", at: { $gte: since } }),
      db.collection("outreachLog").countDocuments({ status: "sent", sentAt: { $gte: since } }),
      db.collection("streakReminderLog").countDocuments({ status: "sent", sentAt: { $gte: since } }),
      db.collection("webhookEvents").find({}).sort({ at: -1 }).limit(1).toArray(),
      db.collection("emailSuppressions").find({}).sort({ at: -1 }).limit(8).toArray(),
      db.collection("emailEvents").find({ type: "email.bounced", at: { $gte: since } }).sort({ at: -1 }).limit(12).toArray(),
    ]);

    // Who are these people? Match bounced addresses to student profiles (case-insensitive).
    const emails: string[] = [...new Set<string>(bounceDocs.map((b) => String(b.email)))];
    const [profiles, blocked]: [any[], Set<string>] = await Promise.all([
      emails.length ? db.collection("profiles").find({ email: { $in: emails } }, { projection: { uid: 1, fullName: 1, email: 1 }, collation: { locale: "en", strength: 2 } }).toArray() : Promise.resolve([] as any[]),
      suppressedSet(db, emails),
    ]);
    const byEmail = new Map(profiles.map((p) => [String(p.email).trim().toLowerCase(), p]));
    const bounces: BounceRow[] = bounceDocs.map((b) => {
      const email = String(b.email);
      const p = byEmail.get(email);
      return {
        email, at: (b.at as Date).toISOString(),
        subject: (b.subject as string | null) ?? null,
        type: (b.bounceType as string | null) ?? null,
        subType: (b.subType as string | null) ?? null,
        providerMessage: (b.message as string | null) ?? null,
        student: p ? { uid: String(p.uid), name: String(p.fullName ?? "Student") } : null,
        typoFix: suggestEmailFix(email),
        blocked: blocked.has(email),
        help: explainBounce(b.bounceType as string | null, b.subType as string | null),
      };
    });
    return {
      webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      lastEventAt: last[0]?.at instanceof Date ? last[0].at.toISOString() : null,
      suppressedTotal, bounces30d, complaints30d,
      sent30d: outreachSent + streakSent,
      recent: recent.map((r) => ({ email: String(r.email), reason: String(r.reason), at: (r.at as Date).toISOString() })),
      bounces,
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
