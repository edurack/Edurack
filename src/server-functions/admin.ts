import { createServerFn } from "@tanstack/react-start";
import { sendMail, sendMailBatch } from "@/lib/mailer";
import { bundleAnnouncementEmailHtml, platformAnnouncementEmailHtml, mentorApprovedEmailHtml, mentorRejectedEmailHtml } from "@/lib/email-templates";import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { scryptSync, randomBytes } from "node:crypto";
import type { ExamKey, Track } from "@/lib/admin-types";
import { PLATFORM_COMMISSION_PERCENT, DEFAULT_BATCH_PROMOTION_PERCENT, MENTOR_TEST_STANDALONE_COMMISSION_PERCENT } from "@/lib/admin-types";

// ─── Authorization helper ────────────────────────────────────────────────
// Every admin-only server function below calls this first. It verifies the
// Firebase ID token AND checks for the `admin: true` custom claim baked into
// that token. Claims only appear in tokens minted/refreshed after promotion,
// so the client must force-refresh (getIdToken(true)) right after being
// granted admin access.
async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

function generateVerifiedUserTag(fullName: string): string {
  const clean = fullName.trim().replace(/[^a-zA-Z]/g, "");
  const base = clean.length > 0 ? clean.slice(0, 14) : "User";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${base}${suffix}`;
}

// ─── Admin auth / claim bootstrap ────────────────────────────────────────
// Called after every admin sign-in or sign-up. Checks the shared passkey
// (ADMIN_PASSKEY env var) as a second factor. If the passkey is correct and
// the user isn't already an admin, this is what actually grants the
// `admin: true` custom claim for the first time — i.e. this IS the
// "become an admin" moment, gated entirely by knowing the passkey.
export const verifyAdminAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string; passkey: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSKEY;
    if (!expected) {
      throw new Error("Server misconfigured: ADMIN_PASSKEY is not set");
    }
    if (data.passkey !== expected) {
      throw new Error("Invalid passkey");
    }

    const decoded = await adminAuth.verifyIdToken(data.token);
    if (decoded.admin === true) {
      return { ok: true, alreadyAdmin: true };
    }

    await adminAuth.setCustomUserClaims(decoded.uid, { admin: true });
    return { ok: true, promoted: true };
  });

// ─── Module 1: Executive Analytics ───────────────────────────────────────

// ─── Module 3: Student Directory ─────────────────────────────────────────
export const listStudents = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const [students, deviceCounts] = await Promise.all([
      db
        .collection("profiles")
        .find({}, { projection: { uid: 1, fullName: 1, email: 1, track: 1, targetExam: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      db
        .collection("sessions")
        .aggregate([{ $group: { _id: "$uid", count: { $sum: 1 } } }])
        .toArray(),
    ]);

    const deviceCountByUid = new Map(deviceCounts.map((d) => [d._id as string, d.count as number]));

    return {
      students: students.map((s) => ({
        uid: s.uid as string,
        fullName: (s.fullName as string) || "",
        email: (s.email as string | null) ?? null,
        track: (s.track as string) || "",
        targetExam: (s.targetExam as string) || "",
        deviceCount: deviceCountByUid.get(s.uid as string) ?? 0,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : null,
      })),
    };
  });

// Admin-privileged lookup of another user's device sessions (for the
// "view logged-in devices" action in the Student Directory).
export const adminListDevicesForUser = createServerFn({ method: "POST" })
  .validator((data: { token: string; uid: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const sessions = await db
      .collection("sessions")
      .find({ uid: data.uid })
      .sort({ lastSeenAt: -1 })
      .toArray();

  

    return {
      sessions: sessions.map((s) => ({
        deviceId: s.deviceId as string,
        deviceLabel: s.deviceLabel as string,
        ip: s.ip as string,
        lastSeenAt: s.lastSeenAt instanceof Date ? s.lastSeenAt.toISOString() : null,
      })),
    };
  });

// ─── Terminate a student's device session (Students module "Terminate" action)
export const adminTerminateDeviceSession = createServerFn({ method: "POST" })
  .validator((data: { token: string; uid: string; deviceId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const result = await db.collection("sessions").deleteOne({ uid: data.uid, deviceId: data.deviceId });
    if (result.deletedCount === 0) throw new Error("Device session not found — it may have already been removed.");
    return { ok: true };
  });

// ─── Module 2: Test Series Manager ───────────────────────────────────────
type TestSeriesInput = {
  title: string;
  subject: "Physics" | "Chemistry" | "Biology" | "Full-Length Mock";
  totalMarks: number;
  timeLimitMinutes: number;
  track: "Dropper" | "11th" | "12th" | "All";
};

export const createTestSeries = createServerFn({ method: "POST" })
  .validator((data: { token: string; testSeries: TestSeriesInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await db.collection("testSeries").insertOne({
      ...data.testSeries,
      createdAt: new Date(),
      // CBT engine mapping is not built yet — this flag just records intent
      // so the future engine-sync job knows which rows still need mapping.
      cbtEngineSynced: false,
    });
    return { ok: true };
  });

export const listTestSeriesAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("testSeries").find({}).sort({ createdAt: -1 }).toArray();
    return {
      testSeries: rows.map((r) => ({
        id: String(r._id),
        title: r.title as string,
        subject: r.subject as string,
        totalMarks: r.totalMarks as number,
        timeLimitMinutes: r.timeLimitMinutes as number,
        track: r.track as string,
        cbtEngineSynced: Boolean(r.cbtEngineSynced),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// ─── Test Series Bundles ─────────────────────────────────────────────────
type BundleInput = {
  title: string;
  track: Track;
  exam: ExamKey;
  domainSubject: string | null;
  features: string[];
  sellingPrice: number;
  crossedPrice: number;
  uploadWindowStart: string;
  uploadWindowEnd: string;
  expiryDate: string;
  thumbnailUrl: string | null;
  syllabusPdfUrls: string[];
  plannerUrls: string[];
  mentorId?: string | null;        // NEW
  marketingPercent?: number | null;
};

export const createBundle = createServerFn({ method: "POST" })
  .validator((data: { token: string; bundle: BundleInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const now = new Date();
    const result = await db.collection("bundles").insertOne({
      ...data.bundle,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listBundles = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("bundles").find({}).sort({ createdAt: -1 }).toArray();
    return {
      bundles: rows.map((r) => ({
        id: String(r._id),
        title: r.title as string,
        track: (r.track as Track) ?? "11th",
        exam: (r.exam as ExamKey) ?? "neet",
        domainSubject: (r.domainSubject as string | null) ?? null,
        features: (r.features as string[]) ?? [],
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        uploadWindowStart: r.uploadWindowStart as string,
        uploadWindowEnd: r.uploadWindowEnd as string,
        expiryDate: r.expiryDate as string,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        syllabusPdfUrls: (r.syllabusPdfUrls as string[]) ?? [],
        plannerUrls: (r.plannerUrls as string[]) ?? [],
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
        mentorId: (r.mentorId as string | null) ?? null,
        marketingPercent: (r.marketingPercent as number | null) ?? null,
      })),
    };
  });

export const updateBundle = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; bundle: Partial<BundleInput> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("bundles").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { ...data.bundle, updatedAt: new Date() } },
    );
    return { ok: true };
  });

// Targeted announcement tied to a specific bundle. NOTE: this stores the
// intent (send to buyers of this bundle) but doesn't yet actually filter
// recipients by purchase — there's no `purchases` collection with real
// Razorpay-confirmed orders wired up yet. Once that exists, a delivery job
// can read bundleId here and resolve it to actual recipient uids.
type BundleAnnouncementInput = {
  bundleId: string;
  message: string | null;
  thumbnailUrl: string | null;
  sendAt: string | null;
};

export const postBundleAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; announcement: BundleAnnouncementInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
 
    await db.collection("bundleAnnouncements").insertOne({
      ...data.announcement,
      createdAt: new Date(),
    });
 
    let emailResult: { attempted: number; sent: number; failed: number } | null = null;
 
    if (data.announcement.message?.trim()) {
      const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(data.announcement.bundleId) });
 
      if (bundle) {
        const purchases = await db
          .collection("purchases")
          .find({ itemType: "bundle", itemId: data.announcement.bundleId })
          .toArray();
        const uids = [...new Set(purchases.map((p) => p.uid as string))];
 
        if (uids.length > 0) {
          const profiles = await db
            .collection("profiles")
            .find({ uid: { $in: uids } }, { projection: { email: 1 } })
            .toArray();
          const emails = profiles.map((p) => p.email as string | null).filter((e): e is string => Boolean(e));
 
          if (emails.length > 0) {
            const html = bundleAnnouncementEmailHtml({
              bundleTitle: bundle.title as string,
              message: data.announcement.message,
            });
            const result = await sendMailBatch(
              emails.map((to) => ({ to, subject: `Update: ${bundle.title as string}`, html })),
            );
            emailResult = { attempted: emails.length, sent: result.sent, failed: result.failed };
            console.log(
              `[postBundleAnnouncement] emailed ${result.sent}/${emails.length} purchasers of bundleId=${data.announcement.bundleId}, ${result.failed} failed`,
            );
          }
        }
      }
    }
 
    return { ok: true, emailResult };
  });
 

export const listBundleAnnouncements = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("bundleAnnouncements")
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return {
      announcements: rows.map((r) => ({
        id: String(r._id),
        bundleId: r.bundleId as string,
        message: (r.message as string | null) ?? null,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        sendAt: (r.sendAt as string | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// ─── Module 3: Test Core (tests nested inside a bundle) ─────────────────────
type SubjectWeightageInput = { subject: string; questionCount: number };

type TestCoreInput = {
  bundleId: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightageInput[];
  liveStart: string;
  liveEnd: string;
  instructions: string;
  mentorId?: string | null;         // NEW
  referencePdfUrl?: string | null;
};

export const createTestCore = createServerFn({ method: "POST" })
  .validator((data: { token: string; testCore: TestCoreInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const result = await db.collection("testCores").insertOne({
      ...data.testCore,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listTestCoresForBundle = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("testCores")
      .find({ bundleId: data.bundleId })
      .sort({ createdAt: -1 })
      .toArray();
    return {
      testCores: rows.map((r) => ({
        id: String(r._id),
        bundleId: r.bundleId as string,
        name: r.name as string,
                totalQuestions: r.totalQuestions as number,
        durationMinutes: (r.durationMinutes as number) ?? 0,
        subjects: (r.subjects as string[]) ?? [],
        weightage: (r.weightage as SubjectWeightageInput[]) ?? [],
        liveStart: r.liveStart as string,
        liveEnd: r.liveEnd as string,
        instructions: (r.instructions as string) ?? "",
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
        mentorId: (r.mentorId as string | null) ?? null,
        referencePdfUrl: (r.referencePdfUrl as string | null) ?? null,
      })),
    };
  });

export const updateTestCore = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; testCore: Partial<TestCoreInput> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("testCores").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { ...data.testCore } },
    );
    return { ok: true };
  });


export const listQuestions = createServerFn({ method: "GET" })
  .validator((data: { token: string; bundleId: string; testId: string; subject: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("questions")
      .find({ bundleId: data.bundleId, testId: data.testId, subject: data.subject })
      .sort({ questionNo: 1 })
      .toArray();
    return {
      questions: rows.map((r) => ({
        id: String(r._id),
        bundleId: r.bundleId as string,
        testId: r.testId as string,
        subject: r.subject as string,
        questionNo: r.questionNo as number,
        body: r.body as string,
        options: r.options as QuestionInput["options"],
        correctOption: r.correctOption as QuestionInput["correctOption"],
        solution: r.solution as string,
        difficulty: r.difficulty as QuestionInput["difficulty"],
        isPYQ: Boolean(r.isPYQ),
        pyqYear: (r.pyqYear as string) ?? undefined,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });



// ─── Module 4: Question Ingestion ───────────────────────────────────────────
type QuestionInput = {
  bundleId: string;
  testId: string;
  subject: string;
  questionNo: number;
  body: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: "A" | "B" | "C" | "D";
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isPYQ: boolean;
  pyqYear?: string;
};

export const createQuestion = createServerFn({ method: "POST" })
  .validator((data: { token: string; question: QuestionInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const result = await db.collection("questions").insertOne({
      ...data.question,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listQuestionsForTestSubject = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string; subject: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("questions")
      .find({ testId: data.testId, subject: data.subject })
      .sort({ questionNo: 1 })
      .toArray();
    return {
      questions: rows.map((r) => ({
        id: String(r._id),
        bundleId: r.bundleId as string,
        testId: r.testId as string,
        subject: r.subject as string,
        questionNo: r.questionNo as number,
        body: r.body as string,
        options: r.options as { A: string; B: string; C: string; D: string },
        correctOption: r.correctOption as "A" | "B" | "C" | "D",
        solution: r.solution as string,
        difficulty: r.difficulty as "Easy" | "Medium" | "Hard",
        isPYQ: Boolean(r.isPYQ),
        pyqYear: (r.pyqYear as string) ?? undefined,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });


export const updateQuestion = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; question: Partial<QuestionInput> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("questions").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { ...data.question } },
    );
    return { ok: true };
  });

export const listQuestionsForTest = createServerFn({ method: "GET" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("questions")
      .find({ testId: data.testId })
      .sort({ subject: 1, questionNo: 1 })
      .toArray();
    return {
      questions: rows.map((r) => ({
        id: String(r._id),
        bundleId: r.bundleId as string,
        testId: r.testId as string,
        subject: r.subject as string,
        questionNo: r.questionNo as number,
        body: r.body as string,
        options: r.options as { A: string; B: string; C: string; D: string },
        correctOption: r.correctOption as "A" | "B" | "C" | "D",
        solution: r.solution as string,
        difficulty: r.difficulty as "Easy" | "Medium" | "Hard",
        isPYQ: Boolean(r.isPYQ),
        pyqYear: (r.pyqYear as string) ?? undefined,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });


export const deleteQuestion = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("questions").deleteOne({ _id: new ObjectId(data.id) });
    return { ok: true };
  });

// ─── Module 6: Mentor Allocation & Schedule Hub ─────────────────────────────

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

type MentorOnboardingInput = {
  username: string;
  password: string;
  secretCode: string;
  name: string;
};

export const createMentor = createServerFn({ method: "POST" })
  .validator((data: { token: string; mentor: MentorOnboardingInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const existing = await db.collection("mentors").findOne({ username: data.mentor.username });
    if (existing) throw new Error("A mentor with this username already exists.");

    // Password is hashed here, never stored or returned in plain text — even
    // though there's no mentor login flow consuming it yet, storing
    // plaintext passwords is a bad habit to start regardless.
    const { hash, salt } = hashPassword(data.mentor.password);

    const result = await db.collection("mentors").insertOne({
      username: data.mentor.username,
      name: data.mentor.name,
      secretCode: data.mentor.secretCode,
      passwordHash: hash,
      passwordSalt: salt,
      profilePictureUrl: null,
      trackingIndex: "",
      status: "active",
      // Mentor Portal (Module 6b) fields — seeded empty on creation so every
      // mentor document has a uniform shape from day one. aboutText /
      // yearOfStudy / introVideoUrl are mentor-editable (updateMyMentorProfile
      // in mentor-auth.ts); aiimsIitRank / enrolledCollege / pursuedCourse are
      // Super Admin-only (updateMentorLockedInfo in mentor-auth.ts).
      aboutText: "",
      yearOfStudy: "",
      introVideoUrl: null,
      aiimsIitRank: "",
      enrolledCollege: "",
      pursuedCourse: "",
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listMentors = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("mentors").find({}).sort({ createdAt: -1 }).toArray();
    return {
      // Deliberately excludes passwordHash/passwordSalt — never sent to the client.
      mentors: rows.map((r) => ({
        id: String(r._id),
        username: r.username as string,
        name: r.name as string,
        secretCode: r.secretCode as string,
        profilePictureUrl: (r.profilePictureUrl as string | null) ?? null,
        trackingIndex: (r.trackingIndex as string) ?? "",
        status: (r.status as "active" | "terminated") ?? "active",
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const updateMentorProfile = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; id: string; profile: { name: string; profilePictureUrl: string | null; trackingIndex: string } }) =>
      data,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("mentors").updateOne({ _id: new ObjectId(data.id) }, { $set: data.profile });
    return { ok: true };
  });

type MentorshipBatchInput = {
  thumbnailUrl: string | null;
  syllabusPdfUrl: string | null;
  name: string;
  highlights: string[];
  track: Track;
  exam: ExamKey;
  sellingPrice: number;
  crossedPrice: number;
  assignedMentorId: string | null;
};

export const createMentorshipBatch = createServerFn({ method: "POST" })
  .validator((data: { token: string; batch: MentorshipBatchInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const result = await db.collection("mentorshipBatches").insertOne({
      ...data.batch,
      exam: data.batch.exam,
      createdAt: new Date(),
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const listMentorshipBatches = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("mentorshipBatches").find({}).sort({ createdAt: -1 }).toArray();
    return {
      batches: rows.map((r) => ({
        id: String(r._id),
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        syllabusPdfUrl: (r.syllabusPdfUrl as string | null) ?? null,
        name: r.name as string,
        highlights: (r.highlights as string[]) ?? [],
        track: (r.track as Track) ?? "11th",
        exam: (r.exam as ExamKey) ?? "neet",
        sellingPrice: r.sellingPrice as number,
        crossedPrice: r.crossedPrice as number,
        assignedMentorId: (r.assignedMentorId as string | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const updateMentorshipBatch = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; batch: Partial<MentorshipBatchInput> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("mentorshipBatches").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { ...data.batch } },
    );
    return { ok: true };
  });

// ─── Global Announcement Broadcast (platform-wide, non-bundle-specific) ──
type AnnouncementTrack = "All" | "Dropper" | "11th" | "12th";

export const postAnnouncement = createServerFn({ method: "POST" })
  .validator((data: { token: string; message: string; track: AnnouncementTrack; sendEmail?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await db.collection("announcements").insertOne({
      message: data.message,
      track: data.track,
      createdAt: new Date(),
    });
 
    let emailResult: { attempted: number; sent: number; failed: number } | null = null;
 
    if (data.sendEmail && data.message.trim()) {
      const filter = data.track === "All" ? {} : { track: data.track };
      const profiles = await db
        .collection("profiles")
        .find(filter, { projection: { email: 1 } })
        .toArray();
      const emails = profiles.map((p) => p.email as string | null).filter((e): e is string => Boolean(e));
 
      if (emails.length > 0) {
        const html = platformAnnouncementEmailHtml({ message: data.message });
        const result = await sendMailBatch(
          emails.map((to) => ({ to, subject: "Edurack Announcement", html })),
        );
        emailResult = { attempted: emails.length, sent: result.sent, failed: result.failed };
        console.log(
          `[postAnnouncement] emailed ${result.sent}/${emails.length} students in track=${data.track}, ${result.failed} failed`,
        );
      }
    }
 
    return { ok: true, emailResult };
  });
 

export const listAnnouncements = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("announcements").find({}).sort({ createdAt: -1 }).limit(50).toArray();
    return {
      announcements: rows.map((r) => ({
        id: String(r._id),
        message: r.message as string,
        track: r.track as string,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

  // ─── Module 12: Mentor Support Ticket Management (Super Admin side) ─────────
export const listAllMentorTickets = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const rows = await db
      .collection("mentorSupportTickets")
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const mentorIds = [...new Set(rows.map((r) => r.mentorId as string))];
    const { ObjectId } = await import("mongodb");
    const mentors =
      mentorIds.length > 0
        ? await db
            .collection("mentors")
            .find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
            .toArray()
        : [];
    const nameByMentorId = new Map(mentors.map((m) => [String(m._id), m.name as string]));

    return {
      tickets: rows.map((r) => ({
        id: String(r._id),
        mentorId: r.mentorId as string,
        mentorName: nameByMentorId.get(r.mentorId as string) ?? "Unknown mentor",
        category: r.category as string,
        message: r.message as string,
        status: r.status as string,
        adminResponse: (r.adminResponse as string | null) ?? null,
        respondedAt: r.respondedAt instanceof Date ? r.respondedAt.toISOString() : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

export const respondToMentorTicket = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; ticketId: string; adminResponse: string; status: "Open" | "In Progress" | "Resolved" }) =>
      data,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const result = await db.collection("mentorSupportTickets").updateOne(
      { _id: new ObjectId(data.ticketId) },
      {
        $set: {
          adminResponse: data.adminResponse.trim() || null,
          status: data.status,
          respondedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) throw new Error("Ticket not found.");
    return { ok: true };
  });
export const getAdminAnalytics = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalStudents, allPurchases, monthlyPurchases, mockTestsTaken] = await Promise.all([
      db.collection("profiles").countDocuments({}),
      db.collection("purchases").find({}).toArray(),
      db.collection("purchases").find({ purchasedAt: { $gte: startOfMonth } }).toArray(),
      db.collection("testAttempts").countDocuments({}),
    ]);

    const totalRevenue = allPurchases.reduce((sum, p) => sum + (p.amount as number), 0);
    const monthlyRevenue = monthlyPurchases.reduce((sum, p) => sum + (p.amount as number), 0);

    // Recent purchases feed — last 8, newest first.
    const recent = [...allPurchases]
      .sort((a, b) => {
        const at = a.purchasedAt instanceof Date ? a.purchasedAt.getTime() : 0;
        const bt = b.purchasedAt instanceof Date ? b.purchasedAt.getTime() : 0;
        return bt - at;
      })
      .slice(0, 8);

    const recentBundleIds = recent.filter((p) => p.itemType === "bundle").map((p) => new ObjectId(p.itemId as string));
    const recentMentorshipIds = recent
      .filter((p) => p.itemType === "mentorship")
      .map((p) => new ObjectId(p.itemId as string));
    const recentUids = Array.from(new Set(recent.map((p) => p.uid as string)));

    const [recentBundles, recentMentorship, recentProfiles] = await Promise.all([
      recentBundleIds.length ? db.collection("bundles").find({ _id: { $in: recentBundleIds } }).toArray() : [],
      recentMentorshipIds.length
        ? db.collection("mentorshipBatches").find({ _id: { $in: recentMentorshipIds } }).toArray()
        : [],
      recentUids.length
        ? db.collection("profiles").find({ uid: { $in: recentUids } }, { projection: { uid: 1, fullName: 1 } }).toArray()
        : [],
    ]);
    const bundleById = new Map(recentBundles.map((b) => [String(b._id), b]));
    const mentorshipById = new Map(recentMentorship.map((b) => [String(b._id), b]));
    const nameByUid = new Map(recentProfiles.map((p) => [p.uid as string, p.fullName as string]));

    const recentPurchases = recent.map((p) => {
      const item = p.itemType === "bundle" ? bundleById.get(p.itemId as string) : mentorshipById.get(p.itemId as string);
      return {
        studentName: nameByUid.get(p.uid as string) ?? "Student",
        itemTitle: item ? ((p.itemType === "bundle" ? item.title : item.name) as string) : "Deleted item",
        itemType: p.itemType as "bundle" | "mentorship",
        amount: p.amount as number,
        purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
      };
    });

    // Top bundles by revenue — which content actually earns.
    const revenueByBundle = new Map<string, number>();
    for (const p of allPurchases) {
      if (p.itemType !== "bundle") continue;
      revenueByBundle.set(p.itemId as string, (revenueByBundle.get(p.itemId as string) ?? 0) + (p.amount as number));
    }
    const topBundleIds = Array.from(revenueByBundle.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    const topBundleDocs = topBundleIds.length
      ? await db.collection("bundles").find({ _id: { $in: topBundleIds.map((id) => new ObjectId(id)) } }).toArray()
      : [];
    const topBundleTitleById = new Map(topBundleDocs.map((b) => [String(b._id), b.title as string]));
    const topBundles = topBundleIds.map((id) => ({
      title: topBundleTitleById.get(id) ?? "Bundle",
      revenue: revenueByBundle.get(id) ?? 0,
      purchaseCount: allPurchases.filter((p) => p.itemType === "bundle" && p.itemId === id).length,
    }));

    return {
      totalStudents,
      totalRevenue,
      monthlyRevenue,
      totalPurchases: allPurchases.length,
      mockTestsTaken,
      recentPurchases,
      topBundles,
    };
  });

// ─── New: 360° student detail — profile + purchases + performance + devices
// + tickets, all in one call, for the Students module's detail drawer ───────
export const getAdminStudentFullProfile = createServerFn({ method: "GET" })
  .validator((data: { token: string; uid: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const [profile, authUser, purchases, attempts, sessions, tickets] = await Promise.all([
      db.collection("profiles").findOne({ uid: data.uid }),
      adminAuth.getUser(data.uid).catch(() => null),
      db.collection("purchases").find({ uid: data.uid }).sort({ purchasedAt: -1 }).toArray(),
      db.collection("testAttempts").find({ uid: data.uid }).toArray(),
      // NOTE: guessing the session collection is named "sessions" to match
      // listSessions/forgetDevice's shape used elsewhere — rename if different.
      db.collection("sessions").find({ uid: data.uid }).toArray(),
      db.collection("supportTickets").find({ uid: data.uid }).sort({ createdAt: -1 }).toArray(),
    ]);

    const bundleIds = purchases.filter((p) => p.itemType === "bundle").map((p) => new ObjectId(p.itemId as string));
    const mentorshipIds = purchases.filter((p) => p.itemType === "mentorship").map((p) => new ObjectId(p.itemId as string));
    const [bundles, mentorshipBatches] = await Promise.all([
      bundleIds.length ? db.collection("bundles").find({ _id: { $in: bundleIds } }).toArray() : [],
      mentorshipIds.length ? db.collection("mentorshipBatches").find({ _id: { $in: mentorshipIds } }).toArray() : [],
    ]);
    const bundleById = new Map(bundles.map((b) => [String(b._id), b]));
    const mentorshipById = new Map(mentorshipBatches.map((b) => [String(b._id), b]));

        const purchaseRows = purchases.map((p) => {
      const item = p.itemType === "bundle" ? bundleById.get(p.itemId as string) : mentorshipById.get(p.itemId as string);
      return {
        itemType: p.itemType as "bundle" | "mentorship",
        itemId: p.itemId as string,
        title: item ? ((p.itemType === "bundle" ? item.title : item.name) as string) : "Item no longer available",
        amount: p.amount as number,
        razorpayPaymentId: (p.razorpayPaymentId as string | null) ?? null,
        purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
      };
    });

    // Same per-bundle aggregation as getMyBatchPerformance in student-data.ts.
    const byBundleId = new Map<string, { testIds: Set<string>; attemptCount: number; totalPercent: number; bestPercent: number }>();
    for (const a of attempts) {
      const bundleId = a.bundleId as string;
      const entry = byBundleId.get(bundleId) ?? { testIds: new Set<string>(), attemptCount: 0, totalPercent: 0, bestPercent: 0 };
      entry.testIds.add(a.testId as string);
      entry.attemptCount += 1;
      const percent = a.totalMarks > 0 ? (a.score / a.totalMarks) * 100 : 0;
      entry.totalPercent += percent;
      entry.bestPercent = Math.max(entry.bestPercent, percent);
      byBundleId.set(bundleId, entry);
    }
    const batchPerformance = Array.from(byBundleId.entries()).map(([bundleId, stats]) => ({
      bundleId,
      bundleTitle: (bundleById.get(bundleId)?.title as string) ?? "Bundle",
      testsAttempted: stats.testIds.size,
      totalAttempts: stats.attemptCount,
      averagePercent: Math.round(stats.totalPercent / stats.attemptCount),
      bestPercent: Math.round(stats.bestPercent),
    }));

    return {
      profile: {
        uid: data.uid,
        fullName: (profile?.fullName as string) || authUser?.displayName || "Student",
        email: authUser?.email ?? null,
        mobile: (profile?.mobile as string) ?? "",
        city: (profile?.city as string) ?? "",
        currentClass: (profile?.currentClass as string) ?? "",
        board: (profile?.board as string) ?? "",
        targetExam: (profile?.targetExam as string) || "NEET",
        track: (profile?.track as string) ?? "",
        joinedAt: authUser?.metadata.creationTime ?? null,
      },
      purchases: purchaseRows,
      batchPerformance,
      devices: sessions.map((s) => ({
        deviceId: s.deviceId as string,
        deviceLabel: s.deviceLabel as string,
        ip: s.ip as string,
        lastSeenAt: s.lastSeenAt instanceof Date ? s.lastSeenAt.toISOString() : null,
      })),
      tickets: tickets.map((t) => ({
        id: String(t._id),
        subject: t.subject as string,
        message: t.message as string,
        status: (t.status as string) ?? "open",
        itemType: (t.itemType as "platform" | "bundle" | "mentorship") ?? "platform",
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : null,
      })),
    };
  });

// ─── Updated: pulls contact details straight from the ticket's own snapshot
// instead of joining back to profiles — works even if the profile changes
// or is deleted after the ticket was filed. Falls back to "Unknown student"
// for any ticket filed before this snapshot existed.
export const listAllTicketsAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const tickets = await db.collection("supportTickets").find({}).sort({ createdAt: -1 }).toArray();

    const bundleIds = tickets
      .filter((t) => t.itemType === "bundle" && t.itemId)
      .map((t) => new ObjectId(t.itemId as string));
    const mentorshipIds = tickets
      .filter((t) => t.itemType === "mentorship" && t.itemId)
      .map((t) => new ObjectId(t.itemId as string));

    const [bundles, mentorshipBatches] = await Promise.all([
      bundleIds.length ? db.collection("bundles").find({ _id: { $in: bundleIds } }).toArray() : [],
      mentorshipIds.length ? db.collection("mentorshipBatches").find({ _id: { $in: mentorshipIds } }).toArray() : [],
    ]);
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));
    const mentorshipTitleById = new Map(mentorshipBatches.map((b) => [String(b._id), b.name as string]));

    return {
      tickets: tickets.map((t) => {
        const source =
          t.itemType === "bundle" && t.itemId
            ? { type: "bundle" as const, itemTitle: bundleTitleById.get(t.itemId as string) ?? "Deleted bundle" }
            : t.itemType === "mentorship" && t.itemId
              ? { type: "mentorship" as const, itemTitle: mentorshipTitleById.get(t.itemId as string) ?? "Deleted batch" }
              : { type: "platform" as const };
        return {
          id: String(t._id),
          uid: t.uid as string,
          studentName: (t.studentName as string) ?? "Unknown student",
          studentEmail: (t.studentEmail as string) ?? null,
          studentMobile: (t.studentMobile as string) ?? null,
          subject: t.subject as string,
          message: t.message as string,
          status: (t.status as string) ?? "open",
          source,
          adminReply: (t.adminReply as string) ?? null,
          rating: (t.rating as number) ?? null,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : null,
          repliedAt: t.repliedAt instanceof Date ? t.repliedAt.toISOString() : null,
        };
      }),
    };
  });

export const replyToTicket = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; reply: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.reply.trim()) throw new Error("Reply can't be empty.");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("supportTickets").updateOne(
      { _id: new ObjectId(data.ticketId) },
      { $set: { adminReply: data.reply.trim(), status: "resolved", repliedAt: new Date() } },
    );
    return { ok: true };
  });

// Kept for reopening a ticket without editing its reply text.
export const updateTicketStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; status: "open" | "resolved" }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db
      .collection("supportTickets")
      .updateOne({ _id: new ObjectId(data.ticketId) }, { $set: { status: data.status } });
    return { ok: true };
  });

  // ─── New: Creator/Mentor application review ─────────────────────────────────
type SocialLink = { platform: string; url: string };

export const listCreatorApplications = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const rows = await db.collection("creatorApplications").find({}).sort({ submittedAt: -1 }).toArray();

    return {
      applications: rows.map((r) => {
        const verification = r.verification as
          | { agreementDone?: boolean; userVerified?: boolean; verifiedUserTag?: string | null; verifiedAt?: Date | null }
          | undefined;
        return {
          id: String(r._id),
          personal: r.personal as { fullName: string; email: string; mobileNumber: string; city: string },
          credentials: r.credentials as { institution: string; yearOfStudy: string; examRank: string },
          mentorship: {
            ...(r.mentorship as { batchTitle: string; targetCategory: string; pricingTier: string }),
            examsTaught: ((r.mentorship as { examsTaught?: string[] })?.examsTaught ?? []) as string[],
          },
          socialLinks: (r.socialLinks ?? []) as SocialLink[],
          status: (r.status as "pending" | "approved" | "rejected") ?? "pending",
          rejectionReason: (r.rejectionReason as string) ?? null,
          reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
          submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : null,
          verification: {
            agreementDone: Boolean(verification?.agreementDone),
            userVerified: Boolean(verification?.userVerified),
            verifiedUserTag: verification?.verifiedUserTag ?? null,
            verifiedAt: verification?.verifiedAt instanceof Date ? verification.verifiedAt.toISOString() : null,
          },
        };
      }),
    };
  });

// Approving an application also emails the applicant — they aren't a
// Firebase user yet at this stage, so the address comes straight from the
// application's own personal.email, not from any auth lookup. Sending the
// email is best-effort: if it fails, the approval itself has already been
// saved above and is not rolled back, matching the same "the real action
// already happened, don't undo it over an email hiccup" pattern used for
// payment confirmations.
export const approveCreatorApplication = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    await db.collection("creatorApplications").updateOne(
      { _id: new ObjectId(data.applicationId) },
      { $set: { status: "approved", rejectionReason: null, reviewedAt: new Date() } },
    );

    const personal = app.personal as { fullName: string; email: string };
    if (personal?.email) {
      const appUrl = process.env.APP_URL;
      if (!appUrl) {
        console.warn(
          `[approveCreatorApplication] APP_URL is not set — sending approval email for applicationId=${data.applicationId} without an onboarding link`,
        );
      }
      const onboardingUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/mentor-onboarding/${data.applicationId}` : null;

      try {
        await sendMail({
          to: personal.email,
          subject: "Your Edurack mentor application has been approved 🎉",
          html: mentorApprovedEmailHtml({ fullName: personal.fullName, onboardingUrl }),
        });
      } catch (err) {
        console.error(`[approveCreatorApplication] approval email failed for applicationId=${data.applicationId}:`, err);
      }
    } else {
      console.warn(`[approveCreatorApplication] no email on application ${data.applicationId}, skipping approval email`);
    }

    return { ok: true };
  });

// Rejecting an application also emails the applicant with the reason the
// admin typed in. Same best-effort pattern as approveCreatorApplication —
// the rejection itself is already saved above regardless of whether the
// email succeeds.
export const rejectCreatorApplication = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; reason: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.reason.trim()) throw new Error("A rejection reason is required.");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    await db.collection("creatorApplications").updateOne(
      { _id: new ObjectId(data.applicationId) },
      { $set: { status: "rejected", rejectionReason: data.reason.trim(), reviewedAt: new Date() } },
    );

    const personal = app.personal as { fullName: string; email: string };
    if (personal?.email) {
      try {
        await sendMail({
          to: personal.email,
          subject: "Update on your Edurack mentor application",
          html: mentorRejectedEmailHtml({ fullName: personal.fullName, reason: data.reason.trim() }),
        });
      } catch (err) {
        console.error(`[rejectCreatorApplication] rejection email failed for applicationId=${data.applicationId}:`, err);
      }
    } else {
      console.warn(`[rejectCreatorApplication] no email on application ${data.applicationId}, skipping rejection email`);
    }

    return { ok: true };
  });

// Lets an admin undo a decision without losing history — flips back to
// pending so it reappears in the review queue.
export const reopenCreatorApplication = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("creatorApplications").updateOne(
      { _id: new ObjectId(data.applicationId) },
      { $set: { status: "pending", rejectionReason: null, reviewedAt: null } },
    );
    return { ok: true };
  });


// ─── Verification checklist (agreement done + identity verified) ───────────
// The verified-user tag is generated exactly once, the first time both
// checklist items become true, and persisted from then on — re-saving
// with both still true keeps the same tag instead of regenerating it.
// Unchecking either box clears the tag, so re-verifying later produces a
// fresh one rather than resurrecting a stale identifier.
export const updateApplicationVerification = createServerFn({ method: "POST" })
  .validator((data: { token: string; applicationId: string; agreementDone: boolean; userVerified: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(data.applicationId) });
    if (!app) throw new Error("Application not found.");

    const existing = app.verification as { verifiedUserTag?: string | null } | undefined;
    const bothChecked = data.agreementDone && data.userVerified;
    const verifiedUserTag = bothChecked
      ? existing?.verifiedUserTag ?? generateVerifiedUserTag((app.personal as { fullName: string }).fullName)
      : null;

    await db.collection("creatorApplications").updateOne(
      { _id: new ObjectId(data.applicationId) },
      {
        $set: {
          verification: {
            agreementDone: data.agreementDone,
            userVerified: data.userVerified,
            verifiedUserTag,
            verifiedAt: bothChecked ? new Date() : null,
          },
        },
      },
    );

    return { ok: true, verifiedUserTag };
  });

  // ─── Danger Zone: cascade-safe deletion for bundles and test series ────────
// Every delete here removes the full dependency chain, not just the top
// document — leaving orphaned questions/attempts behind would silently
// break joins elsewhere (student performance views, leaderboards, etc.)
// that assume a referenced bundleId/testId still exists.

export const listBundlesForDeletion = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const bundles = await db.collection("bundles").find({}).sort({ title: 1 }).toArray();
    const bundleIds = bundles.map((b) => String(b._id));

    const [testCores, purchases] = await Promise.all([
      db.collection("testCores").find({ bundleId: { $in: bundleIds } }).toArray(),
      db.collection("purchases").find({ itemType: "bundle", itemId: { $in: bundleIds } }).toArray(),
    ]);

    const testCountByBundle = new Map<string, number>();
    for (const t of testCores) {
      const id = t.bundleId as string;
      testCountByBundle.set(id, (testCountByBundle.get(id) ?? 0) + 1);
    }
    const purchaseCountByBundle = new Map<string, number>();
    for (const p of purchases) {
      const id = p.itemId as string;
      purchaseCountByBundle.set(id, (purchaseCountByBundle.get(id) ?? 0) + 1);
    }

    return {
      bundles: bundles.map((b) => ({
        id: String(b._id),
        title: b.title as string,
        track: (b.track as string) ?? "",
        testCount: testCountByBundle.get(String(b._id)) ?? 0,
        purchaseCount: purchaseCountByBundle.get(String(b._id)) ?? 0,
      })),
    };
  });

export const deleteBundle = createServerFn({ method: "POST" })
  .validator((data: { token: string; bundleId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const bundle = await db.collection("bundles").findOne({ _id: new ObjectId(data.bundleId) });
    if (!bundle) throw new Error("Bundle not found.");

    const testCores = await db.collection("testCores").find({ bundleId: data.bundleId }).toArray();
    const testIds = testCores.map((t) => String(t._id));

    // Order matters: children before parents, so a failure partway through
    // never leaves a bundle deleted while its questions/attempts survive
    // as orphans (or vice versa) — questions/attempts reference testId,
    // so they must go before the test cores that own them.
    if (testIds.length > 0) {
      await db.collection("questions").deleteMany({ testId: { $in: testIds } });
      await db.collection("testAttempts").deleteMany({ testId: { $in: testIds } });
      await db.collection("testCores").deleteMany({ bundleId: data.bundleId });
    }
    await db.collection("purchases").deleteMany({ itemType: "bundle", itemId: data.bundleId });
    await db.collection("bundles").deleteOne({ _id: new ObjectId(data.bundleId) });

    return {
      ok: true,
      deleted: {
        testCores: testIds.length,
        purchases: await db
          .collection("purchases")
          .countDocuments({ itemType: "bundle", itemId: data.bundleId })
          .then(() => 0), // already deleted above; count reported client-side pre-delete instead
      },
    };
  });

export const listTestCoresForDeletion = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const testCores = await db.collection("testCores").find({}).sort({ name: 1 }).toArray();
    const bundleIds = Array.from(new Set(testCores.map((t) => t.bundleId as string).filter(Boolean)));
    const bundles = bundleIds.length
      ? await db.collection("bundles").find({ _id: { $in: bundleIds.map((id) => new ObjectId(id)) } }).toArray()
      : [];
    const bundleTitleById = new Map(bundles.map((b) => [String(b._id), b.title as string]));

    const testIds = testCores.map((t) => String(t._id));
    const [questionCounts, attemptCounts] = await Promise.all([
      db.collection("questions").aggregate([
        { $match: { testId: { $in: testIds } } },
        { $group: { _id: "$testId", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("testAttempts").aggregate([
        { $match: { testId: { $in: testIds } } },
        { $group: { _id: "$testId", count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const questionCountByTest = new Map(questionCounts.map((r) => [r._id as string, r.count as number]));
    const attemptCountByTest = new Map(attemptCounts.map((r) => [r._id as string, r.count as number]));

    return {
      testCores: testCores.map((t) => ({
        id: String(t._id),
        name: t.name as string,
        bundleTitle: bundleTitleById.get(t.bundleId as string) ?? "Unassigned",
        questionCount: questionCountByTest.get(String(t._id)) ?? 0,
        attemptCount: attemptCountByTest.get(String(t._id)) ?? 0,
      })),
    };
  });

export const deleteTestCore = createServerFn({ method: "POST" })
  .validator((data: { token: string; testId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("testCores").findOne({ _id: new ObjectId(data.testId) });
    if (!test) throw new Error("Test not found.");

    await db.collection("questions").deleteMany({ testId: data.testId });
    await db.collection("testAttempts").deleteMany({ testId: data.testId });
    await db.collection("testCores").deleteOne({ _id: new ObjectId(data.testId) });

    return { ok: true };
  });

  // ─── New: full purchase ledger for Overview — recent-purchases search,
// "show more" pagination, click-to-expand full detail, top-revenue-item
// platform/mentor split, and the Total Revenue CSV export all read from
// this single enriched list, so every view stays consistent with the same
// numbers.
//
// IMPORTANT SCHEMA NOTE: `promotionPercent` below is the *configured*
// promoter-boost rate on the mentorship batch (from batchPromotionSettings,
// set by the mentor — see mentor-earnings.ts). It is NOT proof a promoter
// was actually involved in this specific sale, because `purchases`
// documents carry no promoterId/couponCode field anywhere in this schema.
// Until checkout stamps that attribution onto the purchase, real
// per-sale promotion spend cannot be computed — only this configured rate
// can be shown, and it's labeled as such on the client.
type PurchaseLedgerRow = {
  id: string;
  uid: string;
  studentName: string;
  studentEmail: string | null;
  studentMobile: string | null;
  itemType: "bundle" | "mentorship" | "mentorTest"; // NEW: mentorTest
  itemId: string;
  itemTitle: string;
  amount: number;
  razorpayPaymentId: string | null;
  purchasedAt: string | null;
  mentorId: string | null;
  mentorName: string | null;
  platformAmount: number;
  mentorNetAmount: number;
  promotionPercent: number | null;
};

export const listAllPurchasesAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const purchases = await db.collection("purchases").find({}).sort({ purchasedAt: -1 }).toArray();

    const uids = [...new Set(purchases.map((p) => p.uid as string))];
    const bundleIds = purchases.filter((p) => p.itemType === "bundle").map((p) => new ObjectId(p.itemId as string));
    const mentorshipIds = purchases.filter((p) => p.itemType === "mentorship").map((p) => new ObjectId(p.itemId as string));
    const mentorTestIds = purchases.filter((p) => p.itemType === "mentorTest").map((p) => new ObjectId(p.itemId as string));

    const [profiles, bundles, mentorshipBatches, mentorTests] = await Promise.all([
      uids.length
        ? db.collection("profiles").find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1, email: 1, mobile: 1 } }).toArray()
        : [],
      bundleIds.length ? db.collection("bundles").find({ _id: { $in: bundleIds } }).toArray() : [],
      mentorshipIds.length ? db.collection("mentorshipBatches").find({ _id: { $in: mentorshipIds } }).toArray() : [],
      mentorTestIds.length ? db.collection("testCores").find({ _id: { $in: mentorTestIds } }).toArray() : [],
    ]);

    const profileByUid = new Map(profiles.map((p) => [p.uid as string, p]));
    const bundleById = new Map(bundles.map((b) => [String(b._id), b]));
    const mentorshipById = new Map(mentorshipBatches.map((b) => [String(b._id), b]));
    const mentorTestById = new Map(mentorTests.map((t) => [String(t._id), t]));

    // mentorId can come from either a mentorship batch's assignedMentorId
    // or a mentorTest's own mentorId field.
    const mentorIds = [
      ...new Set([
        ...mentorshipBatches.map((b) => b.assignedMentorId as string | null).filter((id): id is string => Boolean(id)),
        ...mentorTests.map((t) => t.mentorId as string | null).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const mentors = mentorIds.length
      ? await db.collection("mentors").find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }).toArray()
      : [];
    const mentorNameById = new Map(mentors.map((m) => [String(m._id), m.name as string]));

    const mentorshipBatchIds = mentorshipBatches.map((b) => String(b._id));
    const promotionSettings = mentorshipBatchIds.length
      ? await db.collection("batchPromotionSettings").find({ batchId: { $in: mentorshipBatchIds } }).toArray()
      : [];
    const promotionPercentByBatchId = new Map(promotionSettings.map((s) => [s.batchId as string, s.promotionPercent as number]));

    const rows: PurchaseLedgerRow[] = purchases.map((p) => {
      const profile = profileByUid.get(p.uid as string);
      const amount = p.amount as number;
      const base = {
        id: String(p._id),
        uid: p.uid as string,
        studentName: (profile?.fullName as string) || "Student",
        studentEmail: (profile?.email as string | null) ?? null,
        studentMobile: (profile?.mobile as string | null) ?? null,
        amount,
        razorpayPaymentId: (p.razorpayPaymentId as string | null) ?? null,
        purchasedAt: p.purchasedAt instanceof Date ? p.purchasedAt.toISOString() : null,
      };

      if (p.itemType === "bundle") {
        const bundle = bundleById.get(p.itemId as string);
        return {
          ...base,
          itemType: "bundle" as const,
          itemId: p.itemId as string,
          itemTitle: (bundle?.title as string) ?? "Deleted item",
          mentorId: null,
          mentorName: null,
          platformAmount: amount,
          mentorNetAmount: 0,
          promotionPercent: null,
        };
      }

      if (p.itemType === "mentorTest") {
        const test = mentorTestById.get(p.itemId as string);
        const mentorId = (test?.mentorId as string | null) ?? null;
        // Prefer the percent snapshotted on the purchase at order-creation
        // time (payments.ts) — falls back to the current flat rate only
        // for purchases made before that snapshot existed.
        const commissionPercent = (p.platformCommissionPercent as number | undefined) ?? MENTOR_TEST_STANDALONE_COMMISSION_PERCENT;
        const platformAmount = Math.round(amount * (commissionPercent / 100));
        return {
          ...base,
          itemType: "mentorTest" as const,
          itemId: p.itemId as string,
          itemTitle: (test?.name as string) ?? "Deleted test",
          mentorId,
          mentorName: mentorId ? mentorNameById.get(mentorId) ?? "Unknown mentor" : null,
          platformAmount,
          mentorNetAmount: amount - platformAmount,
          promotionPercent: null, // promoters don't promote individual tests
        };
      }

      // mentorship
      const batch = mentorshipById.get(p.itemId as string);
      const assignedMentorId = (batch?.assignedMentorId as string | null) ?? null;
      const commissionPercent = (p.platformCommissionPercent as number | undefined) ?? PLATFORM_COMMISSION_PERCENT;
      const platformAmount = Math.round(amount * (commissionPercent / 100));
      return {
        ...base,
        itemType: "mentorship" as const,
        itemId: p.itemId as string,
        itemTitle: (batch?.name as string) ?? "Deleted item",
        mentorId: assignedMentorId,
        mentorName: assignedMentorId ? mentorNameById.get(assignedMentorId) ?? "Unknown mentor" : null,
        platformAmount,
        mentorNetAmount: amount - platformAmount,
        promotionPercent: assignedMentorId
          ? promotionPercentByBatchId.get(p.itemId as string) ?? DEFAULT_BATCH_PROMOTION_PERCENT
          : null,
      };
    });

    return { rows };
  });

  // ─── Terminate / reactivate a mentor account ────────────────────────────
// Flips a status flag checked by requireMentor on every mentor-authenticated
// request (see mentor-auth.ts) — an existing session token stays
// cryptographically valid but is rejected on its very next use once
// terminated is true.
export const setMentorAccountStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; mentorId: string; terminated: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const result = await db.collection("mentors").updateOne(
      { _id: new ObjectId(data.mentorId) },
      { $set: { status: data.terminated ? "terminated" : "active" } },
    );
    if (result.matchedCount === 0) throw new Error("Mentor not found.");
    return { ok: true };
  });

// ─── Full mentor detail for the directory's expanded profile view — merges
// the base mentor document, their onboarding submission (if they came
// through the approved-application flow), intro video status, and every
// batch assigned to them (manually created or published from onboarding —
// both live in the same mentorshipBatches collection). ───────────────────
export const getAdminMentorFullDetail = createServerFn({ method: "GET" })
  .validator((data: { token: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(data.mentorId) });
    if (!mentor) throw new Error("Mentor not found.");

    const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: data.mentorId });

    let email: string | null = null;
    if (onboarding?.applicationId) {
      const app = await db
        .collection("creatorApplications")
        .findOne({ _id: new ObjectId(onboarding.applicationId as string) });
      email = (app?.personal as { email?: string } | undefined)?.email ?? null;
    }

    const introVideo = await db.collection("mentorIntroVideoStatus").findOne({ mentorId: data.mentorId });

    const batches = await db
      .collection("mentorshipBatches")
      .find({ assignedMentorId: data.mentorId })
      .sort({ createdAt: -1 })
      .toArray();

    return {
      detail: {
        id: String(mentor._id),
        username: mentor.username as string,
        name: mentor.name as string,
        secretCode: mentor.secretCode as string,
        profilePictureUrl: (mentor.profilePictureUrl as string | null) ?? null,
        trackingIndex: (mentor.trackingIndex as string) ?? "",
        status: (mentor.status as "active" | "terminated") ?? "active",
        email,
        aboutText: (mentor.aboutText as string) ?? "",
        yearOfStudy: (mentor.yearOfStudy as string) ?? "",
        aiimsIitRank: (mentor.aiimsIitRank as string) ?? "",
        enrolledCollege: (mentor.enrolledCollege as string) ?? "",
        pursuedCourse: (mentor.pursuedCourse as string) ?? "",
        createdAt: mentor.createdAt instanceof Date ? mentor.createdAt.toISOString() : null,
        introVideo: introVideo
          ? {
              driveUploadLink: (introVideo.driveUploadLink as string | null) ?? null,
              uploaded: Boolean(introVideo.uploaded),
              markedUploadedAt:
                introVideo.markedUploadedAt instanceof Date ? introVideo.markedUploadedAt.toISOString() : null,
            }
          : null,
        onboarding: onboarding
          ? {
              weeklyHours: Number(onboarding.weeklyHours ?? 0),
              wantsToSellTestSeries: Boolean(onboarding.wantsToSellTestSeries),
              wantsToRecordIntroVideo: Boolean(onboarding.wantsToRecordIntroVideo),
              batchName: (onboarding.batchName as string) ?? "",
              batchPrice: Number(onboarding.batchPrice ?? 0),
              batchDurationMonths: Number(onboarding.batchDurationMonths ?? 0),
              hasMinStudentCriteria: Boolean(onboarding.hasMinStudentCriteria),
              minStudentCriteriaDetails: (onboarding.minStudentCriteriaDetails as string) ?? "",
              needsPromotionAssistance: Boolean(onboarding.needsPromotionAssistance),
              promotionPercent: Number(onboarding.promotionPercent ?? 0),
              syllabusPdfUrl: (onboarding.syllabusPdfUrl as string) ?? "",
              plannerPdfUrl: (onboarding.plannerPdfUrl as string) ?? "",
              commissionPercent: Number(onboarding.commissionPercent ?? 0),
              preferredLaunchDate: (onboarding.preferredLaunchDate as string) ?? "",
              submittedAt: onboarding.submittedAt instanceof Date ? onboarding.submittedAt.toISOString() : null,
            }
          : null,
        batches: batches.map((b) => ({
          id: String(b._id),
          name: b.name as string,
          sellingPrice: b.sellingPrice as number,
          crossedPrice: b.crossedPrice as number,
          track: b.track as string,
          exam: b.exam as string,
          thumbnailUrl: (b.thumbnailUrl as string | null) ?? null,
          createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : null,
        })),
      },
    };
  });

// ─── Reset a mentor's password and email it to them ─────────────────────
// Mentors aren't Firebase users, so there's no "reset link" — this
// generates a fresh password, hashes and stores it exactly like createMentor
// does, and emails the plain password directly (same manual-handoff pattern
// as resolvePromoterPasswordReset in promoter-admin.ts). Requires an email
// on file, which only exists for mentors who came through an approved
// application (the email lives on that application, never on the mentor
// document itself) — a mentor with no linked application has nothing to
// send to, and this throws a clear error rather than failing silently.
export const resetMentorPasswordEmail = createServerFn({ method: "POST" })
  .validator((data: { token: string; mentorId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const { scryptSync, randomBytes } = await import("node:crypto");
    const db = await getDb();

    const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(data.mentorId) });
    if (!mentor) throw new Error("Mentor not found.");

    const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: data.mentorId });
    if (!onboarding?.applicationId) {
      throw new Error("No email on file for this mentor — they weren't onboarded through an approved application.");
    }
    const app = await db
      .collection("creatorApplications")
      .findOne({ _id: new ObjectId(onboarding.applicationId as string) });
    const email = (app?.personal as { email?: string } | undefined)?.email;
    if (!email) throw new Error("No email on file for this mentor.");

    const newPassword = randomBytes(6).toString("hex"); // 12-char password
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(newPassword, salt, 64).toString("hex");

    await db.collection("mentors").updateOne(
      { _id: new ObjectId(data.mentorId) },
      { $set: { passwordHash: hash, passwordSalt: salt } },
    );

    const { sendMail } = await import("@/lib/mailer");
    const { mentorPasswordResetEmailHtml } = await import("@/lib/email-templates");
    await sendMail({
      to: email,
      subject: "Your Edurack mentor password has been reset",
      html: mentorPasswordResetEmailHtml({
        fullName: mentor.name as string,
        username: mentor.username as string,
        newPassword,
      }),
    });

    return { ok: true, email };
  });
// ─── Sell Tests: admin question ingestion queue ────────────────────────────
// Mirrors the shape QuestionIngestionModule's TestOption uses (id, name,
// subjects, weightage) so the exact same question-entry pattern — and the
// exact same listQuestionsForTestSubject / createQuestion functions this
// file already exports — work unchanged for Sold Tests. Sold Test
// questions are inserted with bundleId: "" (Sold Tests have no bundle);
// nothing downstream reads bundleId for a testId that isn't in testCores.
export const listSoldTestsForIngestion = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    const rows = await db.collection("soldTests").find({ status: "awaiting_ingestion" }).sort({ updatedAt: -1 }).toArray();
    if (rows.length === 0) return { tests: [] };

    const mentorIds = [...new Set(rows.map((r) => r.mentorId as string))];
    const mentors = mentorIds.length
      ? await db.collection("mentors").find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray()
      : [];
    const nameByMentorId = new Map(mentors.map((m) => [String(m._id), m.name as string]));

    const testIds = rows.map((r) => String(r._id));
    const questionRows = await db
      .collection("questions")
      .find({ testId: { $in: testIds } }, { projection: { testId: 1, subject: 1 } })
      .toArray();

    return {
      tests: rows.map((r) => {
        const testId = String(r._id);
        const weightage = (r.weightage as { subject: string; questionCount: number }[]) ?? [];
        const mine = questionRows.filter((q) => q.testId === testId);
        return {
          id: testId,
          name: r.name as string,
          mentorName: nameByMentorId.get(r.mentorId as string) ?? "Unknown mentor",
          totalQuestions: r.totalQuestions as number,
          subjects: (r.subjects as string[]) ?? [],
          weightage,
          referencePdfUrl: (r.referencePdfUrl as string | null) ?? null,
          progress: weightage.map((w) => ({
            subject: w.subject,
            required: w.questionCount,
            added: mine.filter((q) => q.subject === w.subject).length,
          })),
          totalAdded: mine.length,
        };
      }),
    };
  });

// Admin explicitly hands a fully-ingested test off to the mentor for
// content review — this is the only moment questions become visible to
// the mentor (via listSoldTestQuestionsForMentorReview in
// mentor-sell-tests.ts). A test still mid-ingestion is never mentor-visible.
export const sendSoldTestToMentorForReview = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test) throw new Error("Test not found.");
    if (test.status !== "awaiting_ingestion") throw new Error("This test isn't awaiting ingestion.");

    const added = await db.collection("questions").countDocuments({ testId: data.id });
    if (added < (test.totalQuestions as number)) {
      throw new Error(`Only ${added} of ${test.totalQuestions} questions have been added so far — finish ingestion first.`);
    }

    await db.collection("soldTests").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { status: "awaiting_mentor_review", sentToMentorAt: new Date(), updatedAt: new Date() } },
    );
    return { ok: true };
  });

  // ─── Sell Tests: access requests + price approval queue ───────────────────
export const listSellTestsAccessRequests = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const rows = await db.collection("sellTestsAccessRequests").find({}).sort({ requestedAt: -1 }).toArray();
    const mentorIds = rows.map((r) => r.mentorId as string);
    const mentors = mentorIds.length
      ? await db.collection("mentors").find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray()
      : [];
    const nameByMentorId = new Map(mentors.map((m) => [String(m._id), m.name as string]));
    return {
      requests: rows.map((r) => ({
        mentorId: r.mentorId as string,
        mentorName: nameByMentorId.get(r.mentorId as string) ?? "Unknown mentor",
        adminGranted: Boolean(r.adminGranted),
        requestedAt: r.requestedAt instanceof Date ? r.requestedAt.toISOString() : null,
      })),
    };
  });

export const setSellTestsAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string; mentorId: string; granted: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    await db.collection("sellTestsAccessRequests").updateOne(
      { mentorId: data.mentorId },
      { $set: { mentorId: data.mentorId, adminGranted: data.granted } },
      { upsert: true },
    );
    return { ok: true };
  });

export const listSoldTestsForApproval = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const rows = await db
      .collection("soldTests")
      .find({ status: { $in: ["awaiting_price_approval", "live"] } })
      .sort({ updatedAt: -1 })
      .toArray();
    const mentorIds = [...new Set(rows.map((r) => r.mentorId as string))];
    const mentors = mentorIds.length
      ? await db.collection("mentors").find({ _id: { $in: mentorIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray()
      : [];
    const nameByMentorId = new Map(mentors.map((m) => [String(m._id), m.name as string]));
    return {
      tests: rows.map((r) => ({
        id: String(r._id),
        mentorId: r.mentorId as string,
        mentorName: nameByMentorId.get(r.mentorId as string) ?? "Unknown mentor",
        name: r.name as string,
        totalQuestions: r.totalQuestions as number,
        referencePdfUrl: (r.referencePdfUrl as string | null) ?? null,
        proposedPrice: r.proposedPrice as number,
        approvedPrice: (r.approvedPrice as number | null) ?? null,
        status: r.status as string,
        ingestionFeeAmount: r.ingestionFeeAmount as number,
        contentApprovedByMentor: Boolean(r.contentApprovedByMentor),
        mentorReviewedAt: r.mentorReviewedAt instanceof Date ? r.mentorReviewedAt.toISOString() : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    };
  });

// Sets the final student-facing price (defaults to the mentor's ask, but
// admin can override) and flips status to "live" — the exact moment it
// becomes purchasable through the existing student payments.ts flow.
export const approveSoldTestPrice = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; approvedPrice: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.approvedPrice || data.approvedPrice <= 0) throw new Error("Enter a valid price.");
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const test = await db.collection("soldTests").findOne({ _id: new ObjectId(data.id) });
    if (!test) throw new Error("Test not found.");
    if (test.status !== "awaiting_price_approval") {
      throw new Error("This test isn't awaiting price approval — the mentor needs to approve the content first.");
    }
    await db.collection("soldTests").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { approvedPrice: data.approvedPrice, status: "live", updatedAt: new Date() } },
    );
    return { ok: true };
  });