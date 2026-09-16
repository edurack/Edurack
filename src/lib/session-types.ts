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
  createdAt: string | null;
  updatedAt: string | null;
};

// An offering as shown to students, joined with the mentor's public info.
export type PublicMentorOffering = MentorSessionOffering & {
  mentorName: string;
  mentorPhotoUrl: string | null;
};

// A concrete bookable instance, computed at read time (not stored).
export type OpenSlot = {
  offeringId: string;
  date: string; // ISO date, e.g. "2026-09-20"
  startTime: string; // "HH:mm"
  durationMinutes: number;
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

export function splitSessionPrice(price: number) {
  const platformAmount = Math.round(price * (SESSION_PLATFORM_COMMISSION_PERCENT / 100));
  const mentorNetAmount = price - platformAmount;
  return { platformAmount, mentorNetAmount };
}