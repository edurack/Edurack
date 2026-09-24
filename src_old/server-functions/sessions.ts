import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

// Called after every successful login (email/password or Google) to record
// or refresh a "device" entry for this user. IP and user-agent are read
// server-side from the request headers rather than trusted from the client.
export const recordSession = createServerFn({ method: "POST" })
  .validator((data: { token: string; deviceId: string; deviceLabel: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const request = getRequest();
    const userAgent = request?.headers.get("user-agent") ?? "unknown";
    const ip =
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      "unknown";

    const db = await getDb();
    const now = new Date();

    await db.collection("sessions").updateOne(
      { uid: decoded.uid, deviceId: data.deviceId },
      {
        $set: {
          uid: decoded.uid,
          deviceId: data.deviceId,
          deviceLabel: data.deviceLabel,
          userAgent,
          ip,
          lastSeenAt: now,
        },
        $setOnInsert: { firstSeenAt: now },
      },
      { upsert: true },
    );

    return { ok: true };
  });

export const listSessions = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    const sessions = await db
      .collection("sessions")
      .find({ uid: decoded.uid })
      .sort({ lastSeenAt: -1 })
      .toArray();

    return {
      sessions: sessions.map((s) => ({
        deviceId: s.deviceId as string,
        deviceLabel: s.deviceLabel as string,
        ip: s.ip as string,
        firstSeenAt: s.firstSeenAt instanceof Date ? s.firstSeenAt.toISOString() : null,
        lastSeenAt: s.lastSeenAt instanceof Date ? s.lastSeenAt.toISOString() : null,
      })),
    };
  });

// Removes the tracking record for one device entry from the list. NOTE: this
// does NOT force that device to log out — Firebase ID tokens stay valid
// until they expire (~1 hour) or the user signs out there themselves.
// Firebase doesn't support revoking a single device's session; only ALL
// sessions at once (see revokeAllSessions below).
export const forgetDevice = createServerFn({ method: "POST" })
  .validator((data: { token: string; deviceId: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    await db.collection("sessions").deleteOne({ uid: decoded.uid, deviceId: data.deviceId });
    return { ok: true };
  });

// Signs the user out EVERYWHERE by revoking all of their refresh tokens.
// Every device (including the current one) will need to sign in again the
// next time its ID token expires or refreshes.
export const revokeAllSessions = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    await adminAuth.revokeRefreshTokens(decoded.uid);
    const db = await getDb();
    await db.collection("sessions").deleteMany({ uid: decoded.uid });
    return { ok: true };
  });