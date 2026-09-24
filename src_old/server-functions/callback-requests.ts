// Public callback-request form (edurack.in/contact) — no auth, since a
// visitor asking to be called back isn't a platform user yet. Mirrors the
// same "public write, admin-only read" pattern as submitCreatorApplication.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

type CallbackRequestInput = {
  studentName: string;
  mobileNumber: string;
  examTrack: "NEET" | "JEE" | "Dual Track";
  academicClass: string;
  discussionTopic: "Query about Mentor Batches" | "CBT Test Series Features" | "General Support";
};

export const requestStudentCallback = createServerFn({ method: "POST" })
  .validator((data: CallbackRequestInput) => data)
  .handler(async ({ data }) => {
    if (!data.studentName?.trim()) throw new Error("Name is required.");
    if (!/^\d{10}$/.test(data.mobileNumber)) throw new Error("Enter a valid 10-digit mobile number.");
    if (!data.examTrack) throw new Error("Select an exam track.");
    if (!data.academicClass?.trim()) throw new Error("Academic class is required.");
    if (!data.discussionTopic) throw new Error("Select a discussion topic.");

    const db = await getDb();
    await db.collection("callbackRequests").insertOne({
      studentName: data.studentName.trim(),
      mobileNumber: data.mobileNumber,
      examTrack: data.examTrack,
      academicClass: data.academicClass.trim(),
      discussionTopic: data.discussionTopic,
      status: "pending", // pending | contacted
      requestedAt: new Date(),
      contactedAt: null,
    });

    return { ok: true };
  });

// ─── Admin side ──────────────────────────────────────────────────────────
export const listCallbackRequestsAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("callbackRequests").find({}).sort({ requestedAt: -1 }).toArray();
    return {
      requests: rows.map((r) => ({
        id: String(r._id),
        studentName: r.studentName as string,
        mobileNumber: r.mobileNumber as string,
        examTrack: r.examTrack as string,
        academicClass: r.academicClass as string,
        discussionTopic: r.discussionTopic as string,
        status: (r.status as "pending" | "contacted") ?? "pending",
        requestedAt: r.requestedAt instanceof Date ? r.requestedAt.toISOString() : null,
        contactedAt: r.contactedAt instanceof Date ? r.contactedAt.toISOString() : null,
      })),
    };
  });

export const markCallbackRequestContacted = createServerFn({ method: "POST" })
  .validator((data: { token: string; requestId: string; contacted: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const result = await db.collection("callbackRequests").updateOne(
      { _id: new ObjectId(data.requestId) },
      { $set: { status: data.contacted ? "contacted" : "pending", contactedAt: data.contacted ? new Date() : null } },
    );
    if (result.matchedCount === 0) throw new Error("Request not found.");
    return { ok: true };
  });