// Standalone type system for the Promoters section. Deliberately kept
// separate from admin-types.ts — promoters are not mentors and must not
// share type definitions, auth, or collections with the mentor/admin
// system, even where the shapes look similar.

// ─── Core Promoter identity ─────────────────────────────────────────────────
// Mirrors the Mentor pattern (username + hashed password, no Firebase Auth)
// but lives in its own "promoters" Mongo collection.
export type Promoter = {
  id: string;
  username: string;
  name: string;
  secretCode: string; // required at sign-up, chosen by the promoter
  profilePictureUrl: string | null;
  email: string;
  socialLinks: PromoterSocialLink[];
  upiIds: string[]; // multiple UPI payment details, promoter-managed
  status: "active" | "suspended";
  createdAt: string | null;
};

export type PromoterSocialLink = {
  platform: string; // e.g. "Instagram", "YouTube", "Telegram"
  url: string;
};

export type PromoterSignUpInput = {
  username: string;
  password: string;
  secretCode: string;
};

export type PromoterProfileUpdateInput = {
  name: string;
  profilePictureUrl: string | null;
  email: string;
  socialLinks: PromoterSocialLink[];
  upiIds: string[];
};

// ─── Batch promotion offerings & coupon requests ────────────────────────────
// A batch becomes "available to promote" the moment BatchPromotionSettings
// exists for it (see admin-types.ts DEFAULT_BATCH_PROMOTION_PERCENT /
// MAX_BATCH_PROMOTION_PERCENT — the mentor-set boost). That percent is a
// POOL, not a fixed split: the promoter decides, at request time, how much
// of it becomes the student's discount vs their own earning. E.g. a 10%
// pool could be split 6% student off / 4% promoter earning, or 2%/8%, or
// any combination that sums to the pool — the promoter's call entirely.
export type PromotableBatchView = {
  batchId: string;
  batchName: string;
  thumbnailUrl: string | null;
  totalPoolPercent: number; // mentor-set ceiling — student% + earning% must not exceed this
  studentCount: number;
  requestStatus: "none" | "pending" | "approved" | "rejected";
  couponCode: string | null; // only set once approved
  // The split the promoter chose when they requested (or re-requested)
  // this coupon. Null until a request exists.
  studentDiscountPercent: number | null;
  promoterEarningPercent: number | null;
};

export type PromoterCouponRequestStatus = "pending" | "approved" | "rejected";

export type PromoterCouponRequest = {
  id: string;
  promoterId: string;
  batchId: string;
  batchName: string;
  status: PromoterCouponRequestStatus;
  couponCode: string | null; // admin sets this on approval
  totalPoolPercent: number; // pool snapshot at request time
  studentDiscountPercent: number; // promoter's chosen split
  promoterEarningPercent: number; // = totalPoolPercent - studentDiscountPercent
  requestedAt: string | null;
  reviewedAt: string | null;
};

// ─── Coupon usage / sales feed (Overview) ───────────────────────────────────
export type PromoterSaleRecord = {
  id: string;
  promoterId: string;
  studentName: string;
  batchId: string;
  batchName: string;
  batchPrice: number;
  studentDiscountAmount: number;
  totalPaid: number;
  promoterEarning: number;
  purchasedAt: string | null;
};

export type PromoterOverviewStats = {
  totalBatchesOpted: number;
  totalEarned: number;
  couponUsesCount: number;
  recentSales: PromoterSaleRecord[];
};

// ─── Profile stats & payouts ────────────────────────────────────────────────
export type PromoterMonthlyEarningsPoint = {
  month: string; // "YYYY-MM"
  amountEarned: number;
};

export type PromoterProfileStats = {
  joinedAt: string | null;
  totalBatchesOpted: number;
  totalEarned: number;
  monthly: PromoterMonthlyEarningsPoint[];
};

export type PromoterPayoutRequestStatus = "pending" | "approved" | "rejected";

export type PromoterPayoutRequest = {
  id: string;
  promoterId: string;
  requestedPaymentDay: number; // day-of-month, derived from join anniversary
  status: PromoterPayoutRequestStatus;
  requestedAt: string | null;
  reviewedAt: string | null;
};

// ─── Support tickets (separate collection from MentorSupportTicket) ────────
export type PromoterTicketCategory =
  | "Payout Queries"
  | "Coupon / Batch Issue"
  | "Account Issue"
  | "Other";
export type PromoterTicketStatus = "Open" | "In Progress" | "Resolved";

export type PromoterSupportTicket = {
  id: string;
  promoterId: string;
  subject: string;
  category: PromoterTicketCategory;
  description: string;
  status: PromoterTicketStatus;
  adminResponse: string | null;
  respondedAt: string | null;
  createdAt: string | null;
};

export type PromoterSupportTicketInput = {
  subject: string;
  category: PromoterTicketCategory;
  description: string;
};

// ─── Admin-side view (for the new "Promoters" section under Mentors) ──────
export type AdminPromoterCouponRequestView = PromoterCouponRequest & {
  promoterName: string;
  promoterUsername: string;
};

export type AdminPromoterPayoutRequestView = PromoterPayoutRequest & {
  promoterName: string;
  promoterUsername: string;
};