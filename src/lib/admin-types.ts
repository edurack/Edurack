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
  kind: "standard" | "mentorBatchSeries"; // NEW
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
  mentorId: string | null; // set for both mentor-submitted kinds
  batchId: string | null;  // NEW — set only when kind === "mentorBatchSeries"
  createdAt: string | null;
  updatedAt: string | null;
};

export type BundleAnnouncementPayload = {
  id: string;
  bundleId: string;
  message: string | null;
  thumbnailUrl: string | null;
  sendAt: string | null;
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
  durationMinutes: number;
  liveStart: string;
  liveEnd: string;
  instructions: string;
  mentorId: string | null;
  referencePdfUrl: string | null;
  // NEW — per-test pricing + publish gate for mentor batch series tests.
  // Both null/false for ordinary admin-created tests.
  price: number | null;        // null or 0 = free to batch purchasers
  publishedToBatch: boolean;   // mentor's explicit "send to batch" toggle
  createdAt: string | null;
};

// ─── Module 4: Questions (LaTeX / image / text all share one shape) ─────────
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
  status: "active" | "terminated";
  createdAt: string | null;
};

export type MentorshipBatch = {
  id: string;
  thumbnailUrl: string | null;
  syllabusPdfUrl: string | null;
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
export type YearOfStudy =
  | "1st Year"
  | "2nd Year"
  | "3rd Year"
  | "4th Year"
  | "5th Year"
  | "Internship"
  | "Post-Graduation";

// NOTE: introVideoUrl is retired from being mentor-uploaded. It's replaced
// by the Drive-link workflow below (MentorIntroVideoStatus). Kept here as
// nullable/optional so any old data or admin tooling that still reads it
// doesn't break, but the mentor-facing profile form no longer writes to it
// directly — see MentorProfileUpdateInput.
export type MentorProfileExtended = Mentor & {
  aboutText: string;
  yearOfStudy: YearOfStudy | "";
  introVideoUrl: string | null; // legacy — no longer mentor-writable

  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
};

// Fields the mentor is permitted to submit via the self-service profile form.
// introVideoUrl removed — self-intro video is now a Drive-link workflow
// (see setIntroVideoUploadedStatus in mentor-profile-extras.ts), not a
// direct file upload through this form.
export type MentorProfileUpdateInput = {
  name: string;
  profilePictureUrl: string | null;
  aboutText: string;
  yearOfStudy: YearOfStudy | "";
};

export type MentorLockedInfoInput = {
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
};

// ─── Module 6c: Self-Introduction Video — Google Drive workflow ────────────
// Replaces the old direct-upload flow. Edurack (admin) owns a Google Drive
// folder per mentor (or one shared intake folder — up to however admin.ts
// wires driveUploadLink) where the mentor manually drops their video.
// This portal only tracks: the link to go upload to, written instructions
// on how the video should be shot/framed, and a mentor-toggled "I've
// uploaded it" status flag — there is no file transfer through our own
// servers at all for this asset anymore.
export type MentorIntroVideoStatus = {
  mentorId: string;
  driveUploadLink: string | null; // admin-provided; null until admin sets one
  instructions: string; // admin-provided guidance text (framing, length, etc.)
  uploaded: boolean; // mentor self-reported
  markedUploadedAt: string | null;
};

// ─── Module 9: Live Session Scheduler (Tracks A / B / C) ────────────────────
export type SessionTrack = "OneOnOne" | "BatchMeet" | "AsyncLecture";
export type SessionStatus = "scheduled" | "completed" | "cancelled";

export type MentorshipSession = {
  id: string;
  mentorId: string;
  batchId: string;
  track: SessionTrack;
  studentUid: string | null;
  durationMinutes: number | null;
  meetingLink: string | null;
  lectureUrl: string | null;
  lectureTitle: string | null;
  scheduledAt: string;
  status: SessionStatus;
  createdAt: string | null;
};

export type StudentSessionUsage = {
  studentUid: string;
  sessionsUsed: number;
  sessionsRemaining: number;
};

export type LectureComment = {
  id: string;
  sessionId: string;
  studentUid: string;
  studentName: string;
  body: string;
  hidden: boolean;
  createdAt: string | null;
};

// ─── Module 9b: Per-student lecture viewer detail (Lecture Library) ────────
// Previously the library only showed aggregate counts (viewerCount,
// completedCount). This is the per-student breakdown behind those numbers —
// who specifically has watched, how far, and what they rated it.
export type LectureViewerDetail = {
  studentUid: string;
  studentName: string;
  watchedPercent: number; // 0-100, derived from lectureProgress
  completed: boolean;
  rating: number | null; // from sessionReviews, if that student left one
};

// A one-off nudge a mentor can fire at every purchaser of a batch, pointing
// them at a specific async lecture they haven't finished. Distinct from
// MentorAnnouncement (general batch broadcast) — this is always scoped to
// one lecture and always framed as "go watch this."
export type LectureWatchAlert = {
  id: string;
  mentorId: string;
  sessionId: string; // the AsyncLecture session being promoted
  batchId: string;
  message: string;
  recipientCount: number;
  createdAt: string | null;
};

// ─── Module 10: Targeted Batch Announcements ────────────────────────────────
// Email broadcasting (EmailJS) has been removed entirely — announcements
// are now in-app only. recipientNames replaces the old emailStatus fields
// so mentors can see exactly who a broadcast reached.
export type MentorAnnouncement = {
  emailStatus: string;
  id: string;
  mentorId: string;
  batchId: string;
  title: string;
  message: string;
  recipientCount: number;
  recipientNames: string[];
  createdAt: string | null;
  emailTriggered: boolean;
  pinned?: boolean;
  editedAt?: string | null;
};

export type MentorAnnouncementInput = {
  batchId: string;
  title: string;
  message: string;
  triggerEmail: boolean;
};

// ─── Module 11: Support Ticketing ────────────────────────────────────────────
export type TicketCategory = "Technical Issue" | "Batch/Student Error" | "Payout Queries" | "General Doubts";
export type TicketStatus = "Open" | "In Progress" | "Resolved";

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
  openFrom: string;
  openUntil: string;
};

// Watermarking removed — notes are stored and served as-is. `scope` replaces
// the old blanket "always batch-wide" assumption: a note can now be scoped
// to the whole batch (lectureSessionId === null) or to one specific lecture
// (async-lecture session) within that batch.
export type MentorNote = {
  id: string;
  fileName: string;
  fileUrl: string;
  lectureSessionId: string | null; // null = batch-wide note
  createdAt: string | null;
};

// ─── Module 12: Admin view of mentor tickets ────────────────────────────────
export type AdminMentorTicketView = MentorSupportTicket & {
  mentorName: string;
};

// ─── Module 13: Batch Promotion Boost ───────────────────────────────────────
// Every mentorship batch starts every promoter off at a flat 10% commission
// on referred sales. If a mentor finds promoters aren't picking up their
// batch, they can raise (never below the 10% floor) this per-batch boost to
// make it more attractive to promoters — purely a promoter incentive, and
// entirely separate from the platform's own commission on the mentor.
export const DEFAULT_BATCH_PROMOTION_PERCENT = 10;
export const MAX_BATCH_PROMOTION_PERCENT = 40;

export type BatchPromotionSettings = {
  batchId: string;
  mentorId: string;
  promotionPercent: number; // >= DEFAULT_BATCH_PROMOTION_PERCENT
  updatedAt: string | null;
};

// ─── Module 14: Mentor Earnings Overview ────────────────────────────────────
export const PLATFORM_COMMISSION_PERCENT = 15;
export const QUESTION_INGESTION_FEE_PERCENT = 5; 
export const MENTOR_TEST_STANDALONE_COMMISSION_PERCENT = 5;
export type StudentPurchaseRecord = {
  studentUid: string;
  studentName: string;
  batchId: string;      // for source:"test", this is the testId instead
  batchName: string;    // for source:"test", this is the test name instead
  amount: number;
  platformCommission: number;
  netEarned: number;
  purchasedAt: string | null;
  source: "batch" | "test"; // NEW
};

export type MonthlyEarningsPoint = {
  month: string; // "YYYY-MM"
  grossAmount: number;
  platformCommission: number;
  netEarned: number;
  purchaseCount: number;
};

export type MentorTestIngestionProgress = {
  testId: string;
  testName: string;
  totalQuestions: number;
  subjects: { subject: string; required: number; added: number }[];
  totalAdded: number;
  publishedToBatch: boolean;
};

export type MentorEarningsOverview = {
  totalNetEarned: number;
  totalGross: number;
  monthly: MonthlyEarningsPoint[];
  purchases: StudentPurchaseRecord[];
};

// ─── Module 15: Mentor "Sell Tests" ─────────────────────────────────────────
// Standalone tests, independent of both Test Series and Mentorship
// Batches. Full lifecycle:
//   draft -> awaiting_payment -> awaiting_ingestion -> awaiting_mentor_review
//   -> awaiting_price_approval -> live
// 1) Mentor creates + submits + pays the locked ₹1/question ingestion fee.
// 2) Admin ingests the questions (Question Ingestion-style flow, scoped to
//    this test) until every subject's count matches its weightage.
// 3) Admin sends it to the mentor for a content review.
// 4) Mentor reviews the actual questions and approves the content.
// 5) Admin sets/approves the final student-facing price -> test goes live.
// Once live it can ALSO be attached to any of the mentor's own mentorship
// batches — free for that batch's purchasers — while staying independently
// purchasable by anyone else.
export type SellTestsAccessSource = "admin_granted" | "none";

export type SellTestsAccessStatus = {
  hasAccess: boolean;
  source: SellTestsAccessSource;
  requested: boolean;
  requestedAt: string | null;
};

export const INGESTION_FEE_PER_QUESTION = 1; // ₹1/question, locked, mentor pays this to Edurack

export type SoldTestStatus =
  | "draft"                    // being filled in, not yet submitted
  | "awaiting_payment"         // submitted, ingestion fee not yet paid
  | "awaiting_ingestion"       // fee paid, admin needs to add the questions
  | "awaiting_mentor_review"   // admin finished ingestion, sent to mentor to review
  | "awaiting_price_approval"  // mentor approved content, admin needs to set the final price
  | "live";                    // approved, purchasable by students

export type SoldTest = {
  id: string;
  mentorId: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightage[];
  instructions: string;
  referencePdfUrl: string | null;
  ingestionFeeAmount: number;             // totalQuestions * INGESTION_FEE_PER_QUESTION, locked at submission
  ingestionFeePaid: boolean;
  ingestionFeeRazorpayPaymentId: string | null;
  proposedPrice: number;                  // mentor's ask
  approvedPrice: number | null;           // null until admin approves; may differ from proposedPrice
  status: SoldTestStatus;
  sentToMentorAt: string | null;          // when admin sent it for mentor review
  contentApprovedByMentor: boolean;
  mentorReviewedAt: string | null;
  attachedBatchIds: string[];             // batches it's been appended to (free for their purchasers)
  createdAt: string | null;
  updatedAt: string | null;
};

export type SoldTestInput = {
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  weightage: SubjectWeightage[];
  instructions: string;
  referencePdfUrl: string | null;
  proposedPrice: number;
};

export type SoldTestIngestionProgress = {
  testId: string;
  testName: string;
  totalQuestions: number;
  subjects: { subject: string; required: number; added: number }[];
  totalAdded: number;
};