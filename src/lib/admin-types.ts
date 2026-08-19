// Shared type system for the Super Admin Content Studio. These mirror the
// MongoDB document shapes we'll actually persist, so every module (built now
// or later) stays consistent with the same schema.

export type Track = "11th" | "12th" | "Dropper";

// Matches the ExamKey used in dashboard.tsx and mentor-applications.ts —
// keep this the single source of truth going forward.
export type ExamKey = "neet" | "jee" | "cuet" | "ipmat";

export const EXAM_KEYS: ExamKey[] = ["neet", "jee", "cuet", "ipmat"];
export const EXAM_LABELS: Record<ExamKey, string> = {
  neet: "NEET",
  jee: "JEE",
  cuet: "CUET",
  ipmat: "IPMAT",
};

export type CuetDomainSubject = string;

export type StudentAcademicProfile = {
  targetExam: ExamKey | "";
  track: Track | "";
  cuetDomainSubjects: CuetDomainSubject[];
};

// ─── Module 1 & 2: Test Series Bundles ──────────────────────────────────────
export type TestSeriesBundle = {
  id: string;
  title: string;
  track: Track;
  exam: ExamKey;
  // Only meaningful when exam === "cuet" — the specific domain subject this
  // bundle covers (e.g. "Accountancy", "General Test"). Null for every other
  // exam, where one bundle already covers the whole fixed syllabus.
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
  createdAt: string | null;
  updatedAt: string | null;
};

export type BundleAnnouncementPayload = {
  id: string;
  bundleId: string;
  message: string | null;
  thumbnailUrl: string | null;
  sendAt: string | null; // null = send immediately
  createdAt: string | null;
};

// ─── Module 3: Test Core (appended inside a bundle) ─────────────────────────
export type SubjectWeightage = {
  subject: string;
  questionCount: number;
};

export type TestCore = {
  id: string;
  bundleId: string;
  name: string;
  totalQuestions: number;
  subjects: string[]; 
  weightage: SubjectWeightage[];
  liveStart: string;
  liveEnd: string;
  instructions: string;
  createdAt: string | null;
};

// ─── Module 4: Questions (LaTeX / image / text all share one shape) ─────────
// `body`, each option, and `solution` can each independently be plain text, an
// image URL, or a raw LaTeX string (wrapped in $ or $$) — the renderer decides
// which at display time, so storage is just `string` for all of them.
export type QuestionOptions = {
  A: string;
  B: string;
  C: string;
  D: string;
};

export type Question = {
  id: string;
  bundleId: string;
  testId: string;
  subject: string;
  questionNo: number;
  body: string;
  options: QuestionOptions;
  correctOption: "A" | "B" | "C" | "D";
  solution: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isPYQ: boolean;
  pyqYear?: string;
  createdAt: string | null;
};

// ─── Module 6: Mentors & Mentorship Batches ──────────────────────────────────
export type Mentor = {
  id: string;
  username: string;
  name: string;
  profilePictureUrl: string | null;
  secretCode: string;
  createdAt: string | null;
};

export type MentorshipBatch = {
  id: string;
  thumbnailUrl: string | null;
  name: string;
  highlights: string[];
  track: Track;
  exam: ExamKey;
  sellingPrice: number;
  crossedPrice: number;
  assignedMentorId: string | null;
  createdAt: string | null;
};

// ─── Module 6b: Mentor Portal — Extended Profile ────────────────────────────
// Appends onto the base `Mentor` type. AIIMS/IIT Rank, Enrolled College, and
// Pursued Course are ONLY ever written by createMentor/updateMentorLockedInfo
// (Super Admin side) — the mentor-facing updateMyMentorProfile server
// function must never accept these three keys in its input type, enforced
// at the type level via MentorProfileUpdateInput below.
export type YearOfStudy =
  | "1st Year"
  | "2nd Year"
  | "3rd Year"
  | "4th Year"
  | "5th Year"
  | "Internship"
  | "Post-Graduation";

export type MentorProfileExtended = Mentor & {
  aboutText: string; // full academic + career roadmap, mentor-editable
  yearOfStudy: YearOfStudy | "";
  introVideoUrl: string | null; // .mp4, mentor-editable

  // 🚨 Locked — Super Admin write-only, rendered read-only in the mentor UI
  aiimsIitRank: string; // e.g. "AIR 412 (AIIMS)" — free text, admin sets format
  enrolledCollege: string;
  pursuedCourse: string;
};

// Fields the mentor is permitted to submit via the self-service profile form.
// Deliberately excludes aiimsIitRank / enrolledCollege / pursuedCourse.
export type MentorProfileUpdateInput = {
  name: string;
  profilePictureUrl: string | null;
  aboutText: string;
  yearOfStudy: YearOfStudy | "";
  introVideoUrl: string | null;
};

// Fields ONLY the Super Admin dashboard is allowed to write.
export type MentorLockedInfoInput = {
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
};

// ─── Module 9: Live Session Scheduler (Tracks A / B / C) ────────────────────
export type SessionTrack = "OneOnOne" | "BatchMeet" | "AsyncLecture";
export type SessionStatus = "scheduled" | "completed" | "cancelled";

export type MentorshipSession = {
  id: string;
  mentorId: string;
  batchId: string; // the mentorship batch this session is scoped to
  track: SessionTrack;

  // Track A: 1:1 Personal Mentorship
  studentUid: string | null; // required when track === "OneOnOne"
  durationMinutes: number | null; // hard cap enforced server-side: <= 180

  // Track B: Complete Batch Meet
  meetingLink: string | null; // live video room link, required for A & B

  // Track C: Async Lecture Ingestion
  lectureUrl: string | null; // Cloudflare Stream / Bunny.net player URL
  lectureTitle: string | null;

  scheduledAt: string; // ISO datetime
  status: SessionStatus;
  createdAt: string | null;
};

// Per-student counter used to enforce the <= 20 one-on-one session limit.
// Derived server-side via aggregation over `mentorshipSessions`, not stored
// directly — included here so the client-side type contract is explicit.
export type StudentSessionUsage = {
  studentUid: string;
  sessionsUsed: number; // out of max 20
  sessionsRemaining: number;
};

// Track C: moderated comment thread beneath a lecture asset.
export type LectureComment = {
  id: string;
  sessionId: string; // the MentorshipSession (track "AsyncLecture") this belongs to
  studentUid: string;
  studentName: string;
  body: string;
  hidden: boolean; // moderation: mentor can hide without deleting
  createdAt: string | null;
};

// ─── Module 10: Targeted Batch Announcements (with email trigger) ──────────
export type MentorAnnouncement = {
  id: string;
  mentorId: string;
  batchId: string;
  title: string;
  message: string;
  emailTriggered: boolean; // whether an email broadcast was requested on submit
  emailStatus: "pending" | "sent" | "failed" | "not_requested";
  emailSentAt: string | null;
  recipientCount: number | null; // resolved student count at send time
  createdAt: string | null;
};

export type MentorAnnouncementInput = {
  batchId: string;
  title: string;
  message: string;
  triggerEmail: boolean;
};

// ─── Module 11: Support Ticketing (mentor-facing, extended for admin replies) ─
export type TicketCategory = "Technical Issue" | "Batch/Student Error" | "Payout Queries" | "General Doubts";
export type TicketStatus = "Open" | "In Progress" | "Resolved";

// Extends the existing platform `supportTickets` collection shape used by
// students (see student-data.ts / batch-hub.ts) with mentor-specific fields
// and the admin-response fields that were previously missing entirely.
export type MentorSupportTicket = {
  id: string;
  mentorId: string;
  category: TicketCategory;
  message: string;
  status: TicketStatus;
  adminResponse: string | null;
  respondedAt: string | null;
  createdAt: string | null;
};

export type MentorSupportTicketInput = {
  category: TicketCategory;
  message: string;
};

// ─── Module 7: Razorpay Transaction Ledger ──────────────────────────────────
export type Transaction = {
  id: string;
  studentName: string;
  productName: string;
  razorpayTransactionId: string;
  date: string;
  timestamp: string;
};

// ─── Module 8: Student 360 ───────────────────────────────────────────────────
export type StudentProfileSnapshot = {
  uid: string;
  fullName: string;
  email: string | null;
  mobile: string;
  city: string;
  board: string;
  track: string;
};

export type TestAttemptSummary = {
  testId: string;
  testName: string;
  score: number;
  totalMarks: number;
  timeTakenMinutes: number;
  submittedAt: string;
};

export type Student360 = {
  profile: StudentProfileSnapshot;
  purchasedBundles: { bundleId: string; bundleTitle: string; purchasedAt: string }[];
  purchasedMentorshipBatches: { batchId: string; batchName: string; purchasedAt: string }[];
  testAttempts: TestAttemptSummary[];
};

// ─── Module 4: Chat Desk & Document Gate ────────────────────────────────────
export type ChatSender = "mentor" | "student";

export type ChatThread = {
  studentUid: string;
  studentName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  lastSender: ChatSender;
};

export type ChatMessage = {
  id: string;
  sender: ChatSender;
  body: string;
  createdAt: string | null;
};

export type ChatLockWindow = {
  openFrom: string; // "HH:MM", 24-hour
  openUntil: string;
};

export type MentorNote = {
  id: string;
  fileName: string;
  fileUrl: string;
  watermarkApplied: boolean;
  createdAt: string | null;
};

// ─── Module 12: Admin view of mentor tickets (adds mentorName for display) ──
export type AdminMentorTicketView = MentorSupportTicket & {
  mentorName: string;
};