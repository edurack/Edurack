// Server functions for the mentor-facing portal's communication tools.
// Distinct from mentor-auth.ts (identity/session/profile) — this file
// covers batch announcements, the student chat desk + note uploads, live
// session scheduling (Tracks A/B/C), the lecture library, and support
// tickets.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  MentorAnnouncement,
  MentorAnnouncementInput,
  LectureViewerDetail,
  LectureWatchAlert,
} from "@/lib/admin-types";

// ─── Mentor session verification (mirrors mentor-auth.ts) ───────────────────
function getSessionSecret(): string {
  const secret = process.env.MENTOR_SESSION_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: MENTOR_SESSION_SECRET is not set");
  }
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

  const expectedSignature = createHmac("sha256", secret)
    .update(`${mentorId}.${expiresAtStr}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  if (Date.now() > Number(expiresAtStr)) return null;

  return { mentorId };
}

async function requireMentor(token: string): Promise<string> {
  const verified = verifyMentorToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.mentorId;
}

async function requireOwnsBatch(mentorId: string, batchId: string) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  const batch = await db.collection("mentorshipBatches").findOne({ _id: new ObjectId(batchId) });
  if (!batch) throw new Error("Batch not found.");
  if (batch.assignedMentorId !== mentorId) {
    throw new Error("You are not the assigned mentor for this batch.");
  }
  return batch;
}

// ─── Targeted Batch Announcement Engine ─────────────────────────────────────
// EmailJS broadcasting has been removed entirely — announcements are now
// in-app only. In exchange, every post resolves and stores the actual
// recipient names at send time so a mentor can see exactly who it reached,
// rather than just a count.
export const postMentorAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; announcement: MentorAnnouncementInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.announcement.batchId);

    const { title, message } = data.announcement;
    if (!title.trim()) throw new Error("Enter an announcement title.");
    if (!message.trim()) throw new Error("Write the announcement message.");

    const db = await getDb();

    const purchaseRows = await db
      .collection("purchases")
      .find({ itemType: "mentorship", itemId: data.announcement.batchId })
      .toArray();
    const recipientUids = purchaseRows.map((p) => p.uid as string);

    let recipientNames: string[] = [];
    if (recipientUids.length > 0) {
      const profiles = await db
        .collection("profiles")
        .find({ uid: { $in: recipientUids } }, { projection: { fullName: 1 } })
        .toArray();
      recipientNames = profiles.map((p) => (p.fullName as string) || "Unnamed student");
    }

    const result = await db.collection("mentorshipBatchAnnouncements").insertOne({
      mentorId,
      batchId: data.announcement.batchId,
      title: title.trim(),
      message: message.trim(),
      recipientCount: recipientUids.length,
      recipientNames,
      createdAt: new Date(),
    });

    return { ok: true, id: String(result.insertedId), recipientCount: recipientUids.length, recipientNames };
  });

export const listMentorAnnouncements = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const rows = await db
      .collection("mentorshipBatchAnnouncements")
      .find({ mentorId, batchId: data.batchId })
      .sort({ createdAt: -1 })
      .toArray();

    const announcements: MentorAnnouncement[] = rows.map((r) => ({
      id: String(r._id),
      mentorId: r.mentorId as string,
      batchId: r.batchId as string,
      title: r.title as string,
      message: r.message as string,
      recipientCount: (r.recipientCount as number | null) ?? 0,
      recipientNames: (r.recipientNames as string[] | null) ?? [],
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      pinned: Boolean(r.pinned),
      editedAt: r.editedAt instanceof Date ? r.editedAt.toISOString() : null,
    }));

    return { announcements };
  });

export const togglePinAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; announcementId: string; pinned: boolean }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const row = await db.collection("mentorshipBatchAnnouncements").findOne({ _id: new ObjectId(data.announcementId) });
    if (!row || row.mentorId !== mentorId) throw new Error("Announcement not found.");
    await db.collection("mentorshipBatchAnnouncements").updateOne(
      { _id: new ObjectId(data.announcementId) },
      { $set: { pinned: data.pinned } },
    );
    return { ok: true };
  });

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const editMentorAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; announcementId: string; title: string; message: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const row = await db.collection("mentorshipBatchAnnouncements").findOne({ _id: new ObjectId(data.announcementId) });
    if (!row || row.mentorId !== mentorId) throw new Error("Announcement not found.");

    const age = Date.now() - (row.createdAt as Date).getTime();
    if (age > EDIT_WINDOW_MS) throw new Error("This announcement can no longer be edited (15-minute window has passed).");

    await db.collection("mentorshipBatchAnnouncements").updateOne(
      { _id: new ObjectId(data.announcementId) },
      { $set: { title: data.title.trim(), message: data.message.trim(), editedAt: new Date() } },
    );
    return { ok: true };
  });

export const deleteMentorAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; announcementId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const row = await db.collection("mentorshipBatchAnnouncements").findOne({ _id: new ObjectId(data.announcementId) });
    if (!row || row.mentorId !== mentorId) throw new Error("Announcement not found.");
    await db.collection("mentorshipBatchAnnouncements").deleteOne({ _id: new ObjectId(data.announcementId) });
    return { ok: true };
  });

export const listMyAssignedBatches = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db
      .collection("mentorshipBatches")
      .find({ assignedMentorId: mentorId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      batches: rows.map((r) => ({
        id: String(r._id),
        name: r.name as string,
        track: r.track as string,
      })),
    };
  });

// ─── Module 9: Smart Live Session Scheduler (Tracks A / B / C) ──────────────
import type { SessionTrack, MentorshipSession, StudentSessionUsage, LectureComment } from "@/lib/admin-types";
const MAX_SESSIONS_PER_STUDENT = 20;
const MAX_DURATION_MINUTES = 180;

type CreateSessionInput = {
  batchId: string;
  track: SessionTrack;
  studentUid?: string;
  durationMinutes?: number;
  meetingLink?: string;
  lectureUrl?: string;
  lectureTitle?: string;
  scheduledAt: string;
};

export const listBatchStudents = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const purchaseRows = await db
      .collection("purchases")
      .find({ itemType: "mentorship", itemId: data.batchId })
      .toArray();
    const uids = purchaseRows.map((p) => p.uid as string);
    if (uids.length === 0) return { students: [] };

    const profiles = await db
      .collection("profiles")
      .find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1, email: 1 } })
      .toArray();

    return {
      students: profiles.map((p) => ({
        uid: p.uid as string,
        fullName: (p.fullName as string) || "Unnamed student",
        email: (p.email as string | null) ?? null,
      })),
    };
  });

export const getStudentSessionUsage = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; studentUid: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const sessionsUsed = await db.collection("mentorshipSessions").countDocuments({
      mentorId,
      batchId: data.batchId,
      studentUid: data.studentUid,
      track: "OneOnOne",
      status: { $ne: "cancelled" },
    });

    const usage: StudentSessionUsage = {
      studentUid: data.studentUid,
      sessionsUsed,
      sessionsRemaining: Math.max(0, MAX_SESSIONS_PER_STUDENT - sessionsUsed),
    };
    return { usage };
  });

export const createMentorshipSession = createServerFn({ method: "POST" })
  .validator((data: { token: string; session: CreateSessionInput }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.session.batchId);

    const { track, batchId, scheduledAt } = data.session;
    if (!scheduledAt) throw new Error("Set a scheduled date/time for this session.");

    const db = await getDb();

    if (track === "OneOnOne") {
      const { studentUid, durationMinutes } = data.session;
      if (!studentUid) throw new Error("Select a student for a 1:1 session.");
      if (!durationMinutes || durationMinutes <= 0) throw new Error("Enter a valid session duration.");
      if (durationMinutes > MAX_DURATION_MINUTES) {
        throw new Error(`Session duration cannot exceed ${MAX_DURATION_MINUTES} minutes (3 hours).`);
      }
      if (!data.session.meetingLink?.trim()) throw new Error("Provide a meeting link for this 1:1 session.");

      const existingCount = await db.collection("mentorshipSessions").countDocuments({
        mentorId,
        batchId,
        studentUid,
        track: "OneOnOne",
        status: { $ne: "cancelled" },
      });
      if (existingCount >= MAX_SESSIONS_PER_STUDENT) {
        throw new Error(
          `This student has already used all ${MAX_SESSIONS_PER_STUDENT} allotted 1:1 sessions in this batch.`,
        );
      }

      const result = await db.collection("mentorshipSessions").insertOne({
        mentorId,
        batchId,
        track: "OneOnOne",
        studentUid,
        durationMinutes,
        meetingLink: data.session.meetingLink.trim(),
        lectureUrl: null,
        lectureTitle: null,
        scheduledAt,
        status: "scheduled",
        createdAt: new Date(),
      });
      return { ok: true, id: String(result.insertedId) };
    }

    if (track === "BatchMeet") {
      if (!data.session.meetingLink?.trim()) throw new Error("Provide a meeting link for the batch meet.");

      const result = await db.collection("mentorshipSessions").insertOne({
        mentorId,
        batchId,
        track: "BatchMeet",
        studentUid: null,
        durationMinutes: null,
        meetingLink: data.session.meetingLink.trim(),
        lectureUrl: null,
        lectureTitle: null,
        scheduledAt,
        status: "scheduled",
        createdAt: new Date(),
      });
      return { ok: true, id: String(result.insertedId) };
    }

    // track === "AsyncLecture"
    if (!data.session.lectureUrl?.trim()) throw new Error("Provide the Cloudflare Stream / Bunny.net lecture URL.");
    if (!data.session.lectureTitle?.trim()) throw new Error("Give this lecture a title.");

    const result = await db.collection("mentorshipSessions").insertOne({
      mentorId,
      batchId,
      track: "AsyncLecture",
      studentUid: null,
      durationMinutes: null,
      meetingLink: null,
      lectureUrl: data.session.lectureUrl.trim(),
      lectureTitle: data.session.lectureTitle.trim(),
      scheduledAt,
      status: "scheduled",
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listMentorshipSessions = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; track?: SessionTrack }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const filter: Record<string, unknown> = { mentorId, batchId: data.batchId };
    if (data.track) filter.track = data.track;

    const rows = await db
      .collection("mentorshipSessions")
      .find(filter)
      .sort({ scheduledAt: -1 })
      .toArray();

    const sessions: MentorshipSession[] = rows.map((r) => ({
      id: String(r._id),
      mentorId: r.mentorId as string,
      batchId: r.batchId as string,
      track: r.track as SessionTrack,
      studentUid: (r.studentUid as string | null) ?? null,
      durationMinutes: (r.durationMinutes as number | null) ?? null,
      meetingLink: (r.meetingLink as string | null) ?? null,
      lectureUrl: (r.lectureUrl as string | null) ?? null,
      lectureTitle: (r.lectureTitle as string | null) ?? null,
      scheduledAt: r.scheduledAt as string,
      status: r.status as MentorshipSession["status"],
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));

    return { sessions };
  });

export const updateSessionStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; status: "completed" | "cancelled" }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Session not found.");
    if (session.mentorId !== mentorId) throw new Error("You do not own this session.");

    await db
      .collection("mentorshipSessions")
      .updateOne({ _id: new ObjectId(data.sessionId) }, { $set: { status: data.status } });
    return { ok: true };
  });

export const listAllStudentSessionUsage = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const rows = await db
      .collection("mentorshipSessions")
      .aggregate([
        { $match: { mentorId, batchId: data.batchId, track: "OneOnOne", status: { $ne: "cancelled" } } },
        { $group: { _id: "$studentUid", count: { $sum: 1 } } },
      ])
      .toArray();

    return {
      usage: rows.map((r) => ({
        studentUid: r._id as string,
        sessionsUsed: r.count as number,
        sessionsRemaining: Math.max(0, 20 - (r.count as number)),
      })),
    };
  });

export const bulkCancelSessions = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionIds: string[]; reason: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("mentorshipSessions").updateMany(
      { _id: { $in: data.sessionIds.map((id) => new ObjectId(id)) }, mentorId, status: "scheduled" },
      { $set: { status: "cancelled", cancelReason: data.reason.trim() || null } },
    );
    return { ok: true, cancelledCount: result.modifiedCount };
  });

// ─── Track C: Chat/Comment Auditor Canvas ───────────────────────────────────
export const listLectureComments = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture session not found.");
    if (session.mentorId !== mentorId) throw new Error("You do not own this lecture session.");

    const rows = await db
      .collection("lectureComments")
      .find({ sessionId: data.sessionId })
      .sort({ createdAt: -1 })
      .toArray();

    const comments: LectureComment[] = rows.map ((r)  => ({
      id: String(r._id),
      sessionId: r.sessionId as string,
      studentUid: r.studentUid as string,
      studentName: r.studentName as string,
      body: r.body as string,
      hidden: Boolean(r.hidden),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));

    return { comments };
  });

export const setLectureCommentVisibility = createServerFn({ method: "POST" })
  .validator((data: { token: string; commentId: string; hidden: boolean }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const comment = await db.collection("lectureComments").findOne({ _id: new ObjectId(data.commentId) });
    if (!comment) throw new Error("Comment not found.");

    const session = await db
      .collection("mentorshipSessions")
      .findOne({ _id: new ObjectId(comment.sessionId as string) });
    if (!session || session.mentorId !== mentorId) {
      throw new Error("You do not have permission to moderate this comment.");
    }

    await db
      .collection("lectureComments")
      .updateOne({ _id: new ObjectId(data.commentId) }, { $set: { hidden: data.hidden } });
    return { ok: true };
  });

export const postMentorLectureComment = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; body: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    if (!data.body.trim()) throw new Error("Comment cannot be empty.");

    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture not found.");
    if (session.mentorId !== mentorId) throw new Error("You do not own this lecture session.");

    const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(mentorId) });

    await db.collection("lectureComments").insertOne({
      sessionId: data.sessionId,
      studentUid: null,
      studentName: null,
      isMentor: true,
      mentorId,
      mentorName: mentor?.name as string,
      mentorProfilePictureUrl: (mentor?.profilePictureUrl as string | null) ?? null,
      body: data.body.trim(),
      hidden: false,
      createdAt: new Date(),
    });

    return { ok: true };
  });

// ─── Module 4: Student Chat Desk & Note Uploads (batch- or lecture-scoped) ──
// Watermarking has been removed entirely — notes are stored and served
// exactly as uploaded. A note can now be attached either to the whole
// batch (lectureSessionId omitted/null) or to one specific AsyncLecture
// session within that batch (lectureSessionId set) — e.g. supplementary
// material for just that recording rather than the whole cohort's shared
// notes pool.
export const listChatThreads = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const threads = await db
      .collection("chatMessages")
      .aggregate([
        { $match: { mentorId, batchId: data.batchId } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$studentUid",
            lastMessage: { $first: "$body" },
            lastMessageAt: { $first: "$createdAt" },
            lastSender: { $first: "$sender" },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ])
      .toArray();

    const studentUids = threads.map((t) => t._id as string);
    const profiles =
      studentUids.length > 0
        ? await db
            .collection("profiles")
            .find({ uid: { $in: studentUids } }, { projection: { uid: 1, fullName: 1 } })
            .toArray()
        : [];
    const nameByUid = new Map(profiles.map((p) => [p.uid as string, (p.fullName as string) || "Student"]));

    return {
      threads: threads.map((t) => ({
        studentUid: t._id as string,
        studentName: nameByUid.get(t._id as string) ?? "Student",
        lastMessage: t.lastMessage as string,
        lastMessageAt: t.lastMessageAt instanceof Date ? t.lastMessageAt.toISOString() : null,
        lastSender: t.lastSender as "mentor" | "student",
      })),
    };
  });

export const listChatMessages = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; studentUid: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const rows = await db
      .collection("chatMessages")
      .find({ mentorId, batchId: data.batchId, studentUid: data.studentUid })
      .sort({ createdAt: 1 })
      .toArray();

    return {
      messages: rows.map((r) => ({
        id: String(r._id),
        sender: r.sender as "mentor" | "student",
        body: r.body as string,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; studentUid: string; body: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);
    if (!data.body.trim()) throw new Error("Message cannot be empty.");

    const db = await getDb();
    const lock = await db.collection("chatLockWindows").findOne({ mentorId, batchId: data.batchId });
    if (lock && isCurrentlyLocked(lock.lockedFrom as string, lock.lockedUntil as string)) {
      throw new Error("Messaging is currently locked for this batch. Unlock it to send messages.");
    }

    await db.collection("chatMessages").insertOne({
      mentorId,
      batchId: data.batchId,
      studentUid: data.studentUid,
      sender: "mentor",
      body: data.body.trim(),
      createdAt: new Date(),
    });
    return { ok: true };
  });

function isCurrentlyLocked(lockedFrom: string, lockedUntil: string): boolean {
  if (!lockedFrom || !lockedUntil) return false;
  const now = new Date();
  const [fromH, fromM] = lockedFrom.split(":").map(Number);
  const [untilH, untilM] = lockedUntil.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = fromH * 60 + fromM;
  const untilMinutes = untilH * 60 + untilM;
  if (fromMinutes <= untilMinutes) {
    return !(nowMinutes >= fromMinutes && nowMinutes < untilMinutes);
  }
  return !(nowMinutes >= fromMinutes || nowMinutes < untilMinutes);
}

export const setChatLockWindow = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; enabled: boolean; openFrom: string; openUntil: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    if (!data.enabled) {
      await db.collection("chatLockWindows").deleteOne({ mentorId, batchId: data.batchId });
      return { ok: true };
    }

    await db.collection("chatLockWindows").updateOne(
      { mentorId, batchId: data.batchId },
      { $set: { mentorId, batchId: data.batchId, lockedFrom: data.openFrom, lockedUntil: data.openUntil } },
      { upsert: true },
    );
    return { ok: true };
  });

export const getChatLockWindow = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const lock = await db.collection("chatLockWindows").findOne({ mentorId, batchId: data.batchId });
    if (!lock) return { window: null, isLockedNow: false };

    const openFrom = lock.lockedFrom as string;
    const openUntil = lock.lockedUntil as string;
    return {
      window: { openFrom, openUntil },
      isLockedNow: isCurrentlyLocked(openFrom, openUntil),
    };
  });

// Only async-lecture sessions in this batch are valid targets for a
// lecture-specific note — used to populate the "attach to a lecture"
// dropdown in the upload form.
export const listBatchLecturesForNoteScope = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const rows = await db
      .collection("mentorshipSessions")
      .find({ mentorId, batchId: data.batchId, track: "AsyncLecture" })
      .sort({ scheduledAt: -1 })
      .toArray();

    return {
      lectures: rows.map((r) => ({ id: String(r._id), lectureTitle: r.lectureTitle as string })),
    };
  });

export const uploadMentorNote = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      batchId: string;
      fileName: string;
      fileUrl: string;
      lectureSessionId: string | null;
      copyrightAcknowledged: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    if (!data.copyrightAcknowledged) {
      throw new Error("You must acknowledge the copyright safety toggle before uploading.");
    }
    if (!data.fileUrl.trim() || !data.fileName.trim()) {
      throw new Error("Provide the uploaded file's name and URL.");
    }

    // No watermarking step — the uploaded file's URL is stored and served
    // exactly as-is.
    if (data.lectureSessionId) {
      const session = await db_getLectureSessionScoped(mentorId, data.batchId, data.lectureSessionId);
      if (!session) throw new Error("That lecture wasn't found in this batch.");
    }

    const db = await getDb();
    const result = await db.collection("mentorNotes").insertOne({
      mentorId,
      batchId: data.batchId,
      lectureSessionId: data.lectureSessionId ?? null,
      fileName: data.fileName.trim(),
      fileUrl: data.fileUrl.trim(),
      copyrightAcknowledged: true,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

async function db_getLectureSessionScoped(mentorId: string, batchId: string, sessionId: string) {
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  return db.collection("mentorshipSessions").findOne({
    _id: new ObjectId(sessionId),
    mentorId,
    batchId,
    track: "AsyncLecture",
  });
}

// lectureSessionId filter: omit for everything in the batch, pass a
// sessionId to see only that lecture's notes, or pass the literal string
// "batch-only" to see just the batch-wide (non-lecture-specific) notes.
export const listMentorNotes = createServerFn({ method: "POST" })
  .validator((data: { token: string; batchId: string; lectureSessionId?: string | "batch-only" }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    await requireOwnsBatch(mentorId, data.batchId);

    const db = await getDb();
    const filter: Record<string, unknown> = { mentorId, batchId: data.batchId };
    if (data.lectureSessionId === "batch-only") filter.lectureSessionId = null;
    else if (data.lectureSessionId) filter.lectureSessionId = data.lectureSessionId;

    const rows = await db.collection("mentorNotes").find(filter).sort({ createdAt: -1 }).toArray();

    return {
      notes: rows.map((r) => ({
        id: String(r._id),
        fileName: r.fileName as string,
        fileUrl: r.fileUrl as string,
        lectureSessionId: (r.lectureSessionId as string | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// ─── Module 5: Internal Operations Help Desk (mentor-facing) ────────────────
import type { TicketCategory, TicketStatus, MentorSupportTicket } from "@/lib/admin-types";

export const submitMentorTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; category: TicketCategory; message: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    if (!data.message.trim()) throw new Error("Describe the issue before submitting.");

    const db = await getDb();
    const result = await db.collection("mentorSupportTickets").insertOne({
      mentorId,
      category: data.category,
      message: data.message.trim(),
      status: "Open",
      adminResponse: null,
      respondedAt: null,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listMyMentorTickets = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db
      .collection("mentorSupportTickets")
      .find({ mentorId })
      .sort({ createdAt: -1 })
      .toArray();

    const tickets: MentorSupportTicket[] = rows.map((r) => ({
      id: String(r._id),
      mentorId: r.mentorId as string,
      category: r.category as TicketCategory,
      message: r.message as string,
      status: r.status as TicketStatus,
      adminResponse: (r.adminResponse as string | null) ?? null,
      respondedAt: r.respondedAt instanceof Date ? r.respondedAt.toISOString() : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));

    return { tickets };
  });

// ─── Lecture Library ─────────────────────────────────────────────────────
export const listMyLectureLibrary = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();

    const lectures = await db
      .collection("mentorshipSessions")
      .find({ mentorId, track: "AsyncLecture" })
      .sort({ scheduledAt: -1 })
      .toArray();
    if (lectures.length === 0) return { lectures: [] };

    const sessionIds = lectures.map((l) => String(l._id));
    const batchIds = [...new Set(lectures.map((l) => l.batchId as string))];
    const { ObjectId } = await import("mongodb");

    const [batches, progressRows, commentRows, reviewRows] = await Promise.all([
      db.collection("mentorshipBatches").find({ _id: { $in: batchIds.map((id) => new ObjectId(id)) } }).toArray(),
      db.collection("lectureProgress").find({ sessionId: { $in: sessionIds } }).toArray(),
      db.collection("lectureComments").find({ sessionId: { $in: sessionIds }, hidden: { $ne: true } }).toArray(),
      db.collection("sessionReviews").find({ sessionId: { $in: sessionIds } }).toArray(),
    ]);

    const batchNameById = new Map(batches.map((b) => [String(b._id), b.name as string]));

    return {
      lectures: lectures.map((l) => {
        const sessionId = String(l._id);
        const progress = progressRows.filter((p) => p.sessionId === sessionId);
        const completedCount = progress.filter((p) => p.completed).length;
        const commentCount = commentRows.filter((c) => c.sessionId === sessionId).length;
        const reviews = reviewRows.filter((r) => r.sessionId === sessionId);
        const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviews.length : null;

        return {
          id: sessionId,
          batchId: l.batchId as string,
          batchName: batchNameById.get(l.batchId as string) ?? "Batch",
          lectureTitle: l.lectureTitle as string,
          lectureUrl: l.lectureUrl as string,
          scheduledAt: l.scheduledAt as string,
          viewerCount: progress.length,
          completedCount,
          commentCount,
          avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
          reviewCount: reviews.length,
        };
      }),
    };
  });

// Per-student breakdown behind a lecture's aggregate stats — every student
// who has ANY progress row for this lecture, how far they've watched,
// whether they've finished it, and their rating if they left one. Students
// who purchased the batch but haven't opened the lecture at all are
// deliberately excluded here (there's no progress row to report on) —
// "hasn't started" is a distinct, useful signal from "in progress", so if
// you want that list too it should come from listBatchStudents minus this
// result's studentUids on the client.
export const listLectureViewersDetail = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture not found.");
    if (session.mentorId !== mentorId) throw new Error("You do not own this lecture session.");

    const [progressRows, reviewRows] = await Promise.all([
      db.collection("lectureProgress").find({ sessionId: data.sessionId }).toArray(),
      db.collection("sessionReviews").find({ sessionId: data.sessionId }).toArray(),
    ]);

    const studentUids = [...new Set(progressRows.map((p) => p.studentUid as string))];
    const profiles =
      studentUids.length > 0
        ? await db
            .collection("profiles")
            .find({ uid: { $in: studentUids } }, { projection: { uid: 1, fullName: 1 } })
            .toArray()
        : [];
    const nameByUid = new Map(profiles.map((p) => [p.uid as string, (p.fullName as string) || "Student"]));
    const ratingByUid = new Map(reviewRows.map((r) => [r.studentUid as string, r.rating as number]));

    const viewers: LectureViewerDetail[] = progressRows.map((p) => ({
      studentUid: p.studentUid as string,
      studentName: nameByUid.get(p.studentUid as string) ?? "Student",
      watchedPercent: Math.round(((p.watchedSeconds as number) / Math.max(1, p.totalSeconds as number)) * 100),
      completed: Boolean(p.completed),
      rating: ratingByUid.get(p.studentUid as string) ?? null,
    }));

    return { viewers: viewers.sort((a, b) => b.watchedPercent - a.watchedPercent) };
  });

// Fires a one-off nudge to every purchaser of the lecture's batch, pointing
// them at this specific lecture. In-app only (mirrors the announcement
// engine's post-EmailJS approach) — surfaced to students via whatever feed
// reads lectureWatchAlerts on the student dashboard.
export const sendLectureWatchAlert = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string; message: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const session = await db.collection("mentorshipSessions").findOne({ _id: new ObjectId(data.sessionId) });
    if (!session) throw new Error("Lecture not found.");
    if (session.mentorId !== mentorId) throw new Error("You do not own this lecture session.");
    if (!data.message.trim()) throw new Error("Write a short alert message.");

    const batchId = session.batchId as string;
    const purchaseRows = await db
      .collection("purchases")
      .find({ itemType: "mentorship", itemId: batchId })
      .toArray();
    const recipientCount = purchaseRows.length;

    const result = await db.collection("lectureWatchAlerts").insertOne({
      mentorId,
      sessionId: data.sessionId,
      batchId,
      message: data.message.trim(),
      recipientCount,
      createdAt: new Date(),
    });

    const alert: LectureWatchAlert = {
      id: String(result.insertedId),
      mentorId,
      sessionId: data.sessionId,
      batchId,
      message: data.message.trim(),
      recipientCount,
      createdAt: new Date().toISOString(),
    };
    return { ok: true, alert };
  });

export const listLectureWatchAlerts = createServerFn({ method: "POST" })
  .validator((data: { token: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const db = await getDb();
    const rows = await db
      .collection("lectureWatchAlerts")
      .find({ mentorId, sessionId: data.sessionId })
      .sort({ createdAt: -1 })
      .toArray();

    const alerts: LectureWatchAlert[] = rows.map((r) => ({
      id: String(r._id),
      mentorId: r.mentorId as string,
      sessionId: r.sessionId as string,
      batchId: r.batchId as string,
      message: r.message as string,
      recipientCount: r.recipientCount as number,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));
    return { alerts };
  });