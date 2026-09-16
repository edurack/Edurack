// Mentor-side CRUD for open-slot scheduling. Named mentor-sessions.ts
// deliberately — do not confuse with sessions.ts (device/login sessions).
//
// requireMentor/verifyMentorToken below are duplicated from
// server-functions/mentor-auth.ts rather than imported (see that file's
// own comment on requireSuperAdmin for why cross-importing between
// server-functions files is avoided here).
//
// IMPORTANT: node:crypto is NEVER imported statically at module top level
// in this file — every function that needs it does
// `const { x } = await import("node:crypto")` locally instead. This is
// not stylistic: a static top-level import of a Node-only module gets
// pulled into the client bundle once this file is reachable from a client
// component (mentor-sessions-module.tsx imports from it), which is
// exactly what broke mentor-auth.ts (see its own updated comment).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { DURATION_OPTIONS, type DayOfWeek, type MentorSessionOffering, type MentorSessionBooking } from "@/lib/session-types";

function getSessionSecret(): string {
  const secret = process.env.MENTOR_SESSION_SECRET;
  if (!secret) throw new Error("Server misconfigured: MENTOR_SESSION_SECRET is not set");
  return secret;
}

async function verifyMentorToken(token: string): Promise<{ mentorId: string } | null> {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [mentorId, expiresAtStr, signature] = parts;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expectedSignature = createHmac("sha256", secret).update(`${mentorId}.${expiresAtStr}`).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  if (Date.now() > Number(expiresAtStr)) return null;
  return { mentorId };
}

// Same behavior as mentor-auth.ts's requireMentor: verify the signed
// token, then check the mentor hasn't been terminated since it was
// issued (tokens are otherwise valid for up to 7 days).
async function requireMentor(token: string): Promise<string> {
  const verified = await verifyMentorToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(verified.mentorId) }, { projection: { status: 1 } });
  if (!mentor || mentor.status === "terminated") {
    throw new Error("This account has been deactivated. Please contact Edurack support.");
  }
  return verified.mentorId;
}

function rowToOffering(row: any): MentorSessionOffering {
  return {
    id: row.id,
    mentorId: row.mentor_id,
    title: row.title,
    description: row.description ?? "",
    durationMinutes: row.duration_minutes,
    isFree: row.is_free,
    price: Number(row.price),
    thumbnailUrl: row.thumbnail_url,
    recurringDays: row.recurring_days,
    startTimes: row.start_times,
    dateRangeStart: row.date_range_start,
    dateRangeEnd: row.date_range_end,
    isOngoing: row.is_ongoing,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBooking(row: any, offeringTitle?: string): MentorSessionBooking {
  return {
    id: row.id,
    offeringId: row.offering_id,
    mentorId: row.mentor_id,
    studentUid: row.student_uid,
    studentName: row.student_name,
    studentEmail: row.student_email,
    studentNote: row.student_note ?? "",
    sessionDate: row.session_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    price: Number(row.price),
    isFree: row.is_free,
    platformAmount: Number(row.platform_amount),
    mentorNetAmount: Number(row.mentor_net_amount),
    paymentStatus: row.payment_status,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    meetingLink: row.meeting_link,
    status: row.status,
    createdAt: row.created_at,
    offeringTitle,
  };
}

export const listMyOfferings = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { data: rows, error } = await sb
      .from("mentor_session_offerings")
      .select("*")
      .eq("mentor_id", mentorId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { offerings: (rows ?? []).map(rowToOffering) };
  });

export const createOffering = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      title: string;
      description: string;
      durationMinutes: (typeof DURATION_OPTIONS)[number];
      isFree: boolean;
      price: number;
      thumbnailUrl: string | null;
      recurringDays: DayOfWeek[];
      startTimes: string[];
      dateRangeStart: string | null;
      dateRangeEnd: string | null;
      isOngoing: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);

    if (!data.title.trim()) throw new Error("Give this session a title.");
    if (data.recurringDays.length === 0) throw new Error("Pick at least one day.");
    if (data.startTimes.length === 0) throw new Error("Add at least one time slot.");
    if (!data.isFree && (!data.price || data.price <= 0)) throw new Error("Set a price, or mark this session free.");
    if (!data.isOngoing && !data.dateRangeEnd) throw new Error("Set an end date, or mark this session ongoing.");

    const sb = supabase;
    const { data: row, error } = await sb
      .from("mentor_session_offerings")
      .insert({
        mentor_id: mentorId,
        title: data.title.trim(),
        description: data.description.trim(),
        duration_minutes: data.durationMinutes,
        is_free: data.isFree,
        price: data.isFree ? 0 : data.price,
        thumbnail_url: data.thumbnailUrl,
        recurring_days: data.recurringDays,
        start_times: data.startTimes,
        date_range_start: data.dateRangeStart,
        date_range_end: data.isOngoing ? null : data.dateRangeEnd,
        is_ongoing: data.isOngoing,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { offering: rowToOffering(row) };
  });

export const updateOffering = createServerFn({ method: "POST" })
  .validator((d: { token: string; offeringId: string; patch: Partial<Record<string, unknown>> }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("mentor_session_offerings")
      .update({ ...data.patch, updated_at: new Date().toISOString() })
      .eq("id", data.offeringId)
      .eq("mentor_id", mentorId); // ownership check, not just an id match
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOfferingActive = createServerFn({ method: "POST" })
  .validator((d: { token: string; offeringId: string; active: boolean }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("mentor_session_offerings")
      .update({ active: data.active })
      .eq("id", data.offeringId)
      .eq("mentor_id", mentorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOffering = createServerFn({ method: "POST" })
  .validator((d: { token: string; offeringId: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("mentor_session_offerings")
      .delete()
      .eq("id", data.offeringId)
      .eq("mentor_id", mentorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Bookings the mentor has received, most recent first, with offering title
// joined in so the UI doesn't need a second round trip.
export const listMyBookings = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { data: rows, error } = await sb
      .from("mentor_session_bookings")
      .select("*, mentor_session_offerings(title)")
      .eq("mentor_id", mentorId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      bookings: (rows ?? []).map((r: any) => rowToBooking(r, r.mentor_session_offerings?.title)),
    };
  });

export const setMeetingLink = createServerFn({ method: "POST" })
  .validator((d: { token: string; bookingId: string; meetingLink: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("mentor_session_bookings")
      .update({ meeting_link: data.meetingLink.trim() })
      .eq("id", data.bookingId)
      .eq("mentor_id", mentorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });