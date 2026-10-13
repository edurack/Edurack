// SERVER-ONLY core of the admin Team module: member profiles + the shared activity log.
// Imported by server functions only inside handlers, so it never reaches the browser bundle.
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { AVATAR_COLORS, TEAM_DOMAIN_DEFAULT, type TeamFeedItem, type TeamMember } from "@/lib/team-types";

type Decoded = Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;

export const teamDomain = () => (process.env.ADMIN_ALLOWED_DOMAIN || TEAM_DOMAIN_DEFAULT).toLowerCase().replace(/^@/, "");
export const isTeamEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${teamDomain()}`);

export async function requireTeamAdmin(token: string): Promise<Decoded> {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

const pickColor = (uid: string) => AVATAR_COLORS[[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const prettyName = (d: Decoded) => (d.name as string | undefined)?.trim() || (d.email ?? "Team member").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : null);

export const toMember = (d: any, actions7d = 0): TeamMember => ({
  uid: d.uid, email: d.email ?? "", name: d.name ?? "", title: d.title ?? "", bio: d.bio ?? "", color: d.color ?? pickColor(d.uid),
  joinedAt: iso(d.joinedAt), lastActiveAt: iso(d.lastActiveAt), actions7d, outsideDomain: !isTeamEmail(d.email),
});

let indexed = false;
async function ensureIndexes() {
  if (indexed) return;
  try {
    const db = await getDb();
    await db.collection("teamMembers").createIndex({ uid: 1 }, { unique: true });
    await db.collection("teamActivity").createIndex({ at: -1 });
    await db.collection("teamActivity").createIndex({ uid: 1, at: -1 });
  } catch { /* best-effort */ }
  indexed = true;
}

/** Creates the profile on first admin visit, and marks the person as active now. */
export async function touchMember(decoded: Decoded): Promise<TeamMember> {
  await ensureIndexes();
  const db = await getDb();
  const now = new Date();
  const r = await db.collection("teamMembers").findOneAndUpdate(
    { uid: decoded.uid },
    {
      $set: { email: decoded.email ?? "", lastActiveAt: now },
      $setOnInsert: { uid: decoded.uid, name: prettyName(decoded), title: "", bio: "", color: pickColor(decoded.uid), joinedAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  return toMember(r);
}

// ─── automatic "who changed what" log ──────────────────────────────────────
const SKIP = /^(list|get|preview|count|render|continue|verify|search|check|fetch|adminList)/;
const SECRET_KEY = /token|pass|secret|key|otp|password|html|body|content|json|questions?$|items$/i;
const PRIORITY = ["name", "title", "subject", "fullName", "email", "status", "decision", "price", "label", "kind", "bundleName"];
const humanize = (fn: string) => fn.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase());

function summarize(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  const scalars = Object.entries(data).filter(([k, v]) => !SECRET_KEY.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean") && String(v).length > 0 && String(v).length <= 70);
  scalars.sort((a, b) => (PRIORITY.indexOf(a[0]) === -1 ? 99 : PRIORITY.indexOf(a[0])) - (PRIORITY.indexOf(b[0]) === -1 ? 99 : PRIORITY.indexOf(b[0])));
  return scalars.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

/** Called at the start of every admin write action. Never throws — logging must not break the action. */
export async function logAdminAction(token: string, action: string, data: unknown, moduleLabel = "Admin") {
  if (SKIP.test(action)) return;
  try {
    await ensureIndexes();
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.admin !== true) return;
    const db = await getDb();
    const now = new Date();
    await Promise.all([
      db.collection("teamActivity").insertOne({ kind: "action", uid: decoded.uid, name: prettyName(decoded), module: moduleLabel, action, label: humanize(action), summary: summarize(data as Record<string, unknown>), at: now }),
      db.collection("teamMembers").updateOne({ uid: decoded.uid }, { $set: { lastActiveAt: now }, $setOnInsert: { email: decoded.email ?? "", name: prettyName(decoded), title: "", bio: "", color: pickColor(decoded.uid), joinedAt: now } }, { upsert: true }),
    ]);
  } catch (err) {
    console.error("[team] activity log failed:", err);
  }
}

export async function memberColors(uids: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.collection("teamMembers").find({ uid: { $in: uids } }, { projection: { uid: 1, color: 1 } }).toArray();
  return Object.fromEntries(rows.map((r) => [r.uid as string, (r.color as string) ?? pickColor(r.uid as string)]));
}

export async function listFeed(opts: { limit: number; uid?: string; module?: string; kind?: "action" | "update" }): Promise<TeamFeedItem[]> {
  await ensureIndexes();
  const db = await getDb();
  const q: Record<string, unknown> = {};
  if (opts.uid) q.uid = opts.uid;
  if (opts.module) q.module = opts.module;
  if (opts.kind) q.kind = opts.kind;
  const rows = await db.collection("teamActivity").find(q).sort({ at: -1 }).limit(Math.min(opts.limit, 200)).toArray();
  const colors = await memberColors([...new Set(rows.map((r) => r.uid as string))]);
  return rows.map((r) => ({
    id: String(r._id), kind: r.kind, uid: r.uid, name: r.name, color: colors[r.uid] ?? pickColor(r.uid), at: (r.at as Date).toISOString(),
    module: r.module, label: r.label, summary: r.summary, done: r.done, next: r.next, blockers: r.blockers,
  }));
}
