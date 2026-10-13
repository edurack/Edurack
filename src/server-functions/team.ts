// Admin Team module — server functions. Logic lives in lib/team-core.ts (server-only).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { listFeed, requireTeamAdmin, toMember, touchMember } from "@/lib/team-core";
import { AVATAR_COLORS, type TeamFeedItem, type TeamMember } from "@/lib/team-types";

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Called when the dashboard opens: creates/refreshes my profile and returns the whole team. */
export const getTeamOverview = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ me: TeamMember; members: TeamMember[] }> => {
    const decoded = await requireTeamAdmin(data.token);
    const me = await touchMember(decoded);
    const db = await getDb();
    const since = new Date(Date.now() - 7 * 864e5);
    const [docs, counts] = await Promise.all([
      db.collection("teamMembers").find({}).sort({ lastActiveAt: -1 }).limit(100).toArray(),
      db.collection("teamActivity").aggregate([{ $match: { kind: "action", at: { $gte: since } } }, { $group: { _id: "$uid", n: { $sum: 1 } } }]).toArray(),
    ]);
    const byUid = Object.fromEntries(counts.map((c) => [String(c._id), c.n as number]));
    return { me, members: docs.map((d) => toMember(d, byUid[d.uid] ?? 0)) };
  });

export const updateMyTeamProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string; title: string; bio: string; color: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireTeamAdmin(data.token);
    const name = clip(data.name, 60);
    if (!name) throw new Error("Please enter your name.");
    const color = AVATAR_COLORS.includes(data.color) ? data.color : AVATAR_COLORS[0];
    const db = await getDb();
    await db.collection("teamMembers").updateOne({ uid: decoded.uid }, { $set: { name, title: clip(data.title, 60), bio: clip(data.bio, 280), color } }, { upsert: true });
    return { ok: true };
  });

export const listTeamFeed = createServerFn({ method: "POST" })
  .validator((data: { token: string; limit?: number; uid?: string; module?: string; kind?: "action" | "update" }) => data)
  .handler(async ({ data }): Promise<TeamFeedItem[]> => {
    await requireTeamAdmin(data.token);
    return listFeed({ limit: data.limit ?? 60, uid: data.uid, module: data.module, kind: data.kind });
  });

/** A person's own progress post: what I did, what's next, what's blocking me. Visible to the whole team. */
export const postTeamUpdate = createServerFn({ method: "POST" })
  .validator((data: { token: string; done: string; next: string; blockers: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await requireTeamAdmin(data.token);
    const done = clip(data.done, 1200), next = clip(data.next, 800), blockers = clip(data.blockers, 600);
    if (!done && !next && !blockers) throw new Error("Write at least one line.");
    const me = await touchMember(decoded);
    const db = await getDb();
    await db.collection("teamActivity").insertOne({ kind: "update", uid: decoded.uid, name: me.name, done, next, blockers, at: new Date() });
    return { ok: true };
  });
