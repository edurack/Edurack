// Self-introduction video no longer goes through our own upload pipeline.
// Edurack (admin) shares a Google Drive link per mentor where the mentor
// manually drops the file themselves; this file only tracks that link,
// admin's written instructions on how the video should be shot, and the
// mentor's own "I've uploaded it" toggle. There is no file transfer
// through our servers for this asset at all anymore — see
// MentorIntroVideoStatus in admin-types.ts and the retirement note on
// MentorProfileExtended.introVideoUrl there.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MentorIntroVideoStatus } from "@/lib/admin-types";

function getSessionSecret(): string {
  const secret = process.env.MENTOR_SESSION_SECRET;
  if (!secret) throw new Error("Server misconfigured: MENTOR_SESSION_SECRET is not set");
  return secret;
}

function verifyMentorToken(token: string): { mentorId: string } | null {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [mentorId, expiresAtStr, signature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(`${mentorId}.${expiresAtStr}`).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  if (Date.now() > Number(expiresAtStr)) return null;
  return { mentorId };
}

async function requireMentor(token: string): Promise<string> {
  const verified = verifyMentorToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.mentorId;
}

const DEFAULT_INSTRUCTIONS =
  "Record a 60–90 second horizontal (16:9) self-introduction: your name, exam rank, what you mentor, and why a student should pick your batch. Good lighting, plain background, no background music.";

export const getMyIntroVideoStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const row = await db.collection("mentorIntroVideoStatus").findOne({ mentorId });

    const status: MentorIntroVideoStatus = {
      mentorId,
      driveUploadLink: (row?.driveUploadLink as string | null) ?? null,
      instructions: (row?.instructions as string) || DEFAULT_INSTRUCTIONS,
      uploaded: Boolean(row?.uploaded),
      markedUploadedAt: row?.markedUploadedAt instanceof Date ? row.markedUploadedAt.toISOString() : null,
    };
    return { status };
  });

export const setIntroVideoUploadedStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; uploaded: boolean }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();

    await db.collection("mentorIntroVideoStatus").updateOne(
      { mentorId },
      {
        $set: {
          mentorId,
          uploaded: data.uploaded,
          markedUploadedAt: data.uploaded ? new Date() : null,
        },
      },
      { upsert: true },
    );
    return { ok: true };
  });

// ─── Admin side ──────────────────────────────────────────────────────────
// NOTE: swap requireAdmin for whatever this project's actual admin-check
// helper is named — same assumption used throughout admin.ts and
// mentor-onboarding.ts.
async function requireAdmin(token: string) {
  const { adminAuth } = await import("@/lib/firebase-admin");
  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded.admin) throw new Error("Admin access required.");
  return decoded;
}

export const setIntroVideoUploadLink = createServerFn({ method: "POST" })
  .validator((data: { token: string; mentorId: string; driveUploadLink: string; instructions?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!/^https?:\/\//i.test(data.driveUploadLink.trim())) {
      throw new Error("Enter a valid Google Drive link.");
    }

    const db = await getDb();
    await db.collection("mentorIntroVideoStatus").updateOne(
      { mentorId: data.mentorId },
      {
        $set: {
          mentorId: data.mentorId,
          driveUploadLink: data.driveUploadLink.trim(),
          ...(data.instructions?.trim() ? { instructions: data.instructions.trim() } : {}),
        },
      },
      { upsert: true },
    );
    return { ok: true };
  });