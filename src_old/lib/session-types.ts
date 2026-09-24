// Shared types for the Mentor Sessions (open slot scheduling) feature.
// Deliberately distinct from anything named "session" for devices/auth —
// see device.ts / sessions.ts, which this file does not touch.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;
export type DurationMinutes = (typeof DURATION_OPTIONS)[number];

export type PaymentStatus = "pending" | "paid" | "free" | "failed" | "refunded";
export type BookingStatus = "upcoming" | "completed" | "cancelled" | "no_show";

// Platform commission on paid sessions.
export const SESSION_PLATFORM_COMMISSION_PERCENT = 5;

// Group-session sizing. 1 = the original 1:1 model; up to 200 lets a
// mentor run a cohort/webinar-style session where many students book the
// same slot. A number this size is deliberately capped (see the SQL
// CHECK constraint) so a mistyped price/capacity field can't create an
// effectively-unlimited session.
export const MAX_SESSION_CAPACITY = 200;

export type SessionTemplate = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  enabled: boolean;
  createdAt: string | null;
};

export type MentorSessionOffering = {
  id: string;
  mentorId: string;
  title: string;
  description: string;
  durationMinutes: DurationMinutes;
  isFree: boolean;
  price: number;
  thumbnailUrl: string | null;
  recurringDays: DayOfWeek[];
  startTimes: string[]; // "HH:mm"
  dateRangeStart: string | null; // ISO date
  dateRangeEnd: string | null;
  isOngoing: boolean;
  active: boolean;
  capacity: number; // 1 = 1:1, >1 = group/cohort
  subject: string | null; // e.g. "Maths" — used for test-analysis recommendations
  createdAt: string | null;
  updatedAt: string | null;
};

// An offering as shown to students, joined with the mentor's public info.
export type PublicMentorOffering = MentorSessionOffering & {
  mentorName: string;
  mentorPhotoUrl: string | null;
};

// A concrete bookable instance, computed at read time (not stored).
// seatsTaken/seatsRemaining let the UI show "4 of 10 seats left" for
// group sessions, and distinguish "full" from "doesn't exist yet".
export type OpenSlot = {
  offeringId: string;
  date: string; // ISO date, e.g. "2026-09-20"
  startTime: string; // "HH:mm"
  durationMinutes: number;
  capacity: number;
  seatsTaken: number;
  seatsRemaining: number;
};

export type MentorSessionBooking = {
  id: string;
  offeringId: string;
  mentorId: string;
  studentUid: string;
  studentName: string;
  studentEmail: string | null;
  studentNote: string;
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  price: number;
  isFree: boolean;
  platformAmount: number;
  mentorNetAmount: number;
  paymentStatus: PaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  meetingLink: string | null;
  status: BookingStatus;
  createdAt: string | null;
  // Only populated on the mentor/admin side
  offeringTitle?: string;
};

// A single session instance with its full student roster — how the
// mentor's "Bookings" view now groups things once capacity > 1, instead
// of one flat row per booking with no sense of "these 8 are the same
// session".
export type SessionRoster = {
  offeringId: string;
  offeringTitle: string;
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  students: MentorSessionBooking[];
};

export function splitSessionPrice(price: number) {
  const platformAmount = Math.round(price * (SESSION_PLATFORM_COMMISSION_PERCENT / 100));
  const mentorNetAmount = price - platformAmount;
  return { platformAmount, mentorNetAmount };
}

// Groups a flat list of bookings (as returned by listMyBookings) into one
// roster per session instance (same offering + date + start time). Pure
// function so both the mentor dashboard and any future admin view can
// reuse it without re-implementing the grouping.
export function groupBookingsIntoRosters(bookings: MentorSessionBooking[]): SessionRoster[] {
  const byKey = new Map<string, SessionRoster>();
  for (const b of bookings) {
    const key = `${b.offeringId}:${b.sessionDate}:${b.startTime}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.students.push(b);
    } else {
      byKey.set(key, {
        offeringId: b.offeringId,
        offeringTitle: b.offeringTitle ?? "Session",
        sessionDate: b.sessionDate,
        startTime: b.startTime,
        durationMinutes: b.durationMinutes,
        capacity: 0, // filled in by the caller if it has the offering's capacity; 0 = unknown, UI just won't show "x of y"
        students: [b],
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (a.sessionDate + a.startTime).localeCompare(b.sessionDate + b.startTime));
}

// ─── Premium session detail page ────────────────────────────────────────
// Extended mentor bio fields shown on the detail page — same "locked
// profile info" set as getMentorProfile (mentor-auth.ts) and
// getAdminMentorFullDetail (admin.ts), read-only here since this is a
// student-facing page.
export type MentorBioForOffering = {
  name: string;
  photoUrl: string | null;
  aboutText: string;
  yearOfStudy: string;
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
  expertAt: string;
  whyExpertAt: string;
  scoreType: "rank" | "percentile" | "score" | null;
  scoreValue: string;
};

export type OtherOfferingSummary = {
  id: string;
  title: string;
  isFree: boolean;
  price: number;
  durationMinutes: number;
};

export type MentorSessionOfferingDetail = {
  offering: PublicMentorOffering;
  mentorBio: MentorBioForOffering;
  slots: OpenSlot[]; // full window, not the capped preview used elsewhere
  otherOfferings: OtherOfferingSummary[]; // other active offerings by the same mentor
};