// Mentor-side CRUD for open-slot scheduling. Named mentor-sessions.ts
// deliberately — do not confuse with sessions.ts (device/login sessions).
//
// requireMentor/verifyMentorToken below are duplicated from
// server-functions/mentor-auth.ts rather than imported (see that file's
// own comment on requireSuperAdmin for why cross-importing between
// server-functions files is avoided here).
//
// node:crypto is never imported statically at module top level — every
// function that needs it does `await import("node:crypto")` locally
// instead (see mentor-auth.ts's comment on why this matters).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { DURATION_OPTIONS, MAX_SESSION_CAPACITY, UNLIMITED_CAPACITY, type DayOfWeek, type MentorSessionOffering, type MentorSessionBooking } from "@/lib/session-types";
import { cancelBookings, type BookingRow } from "@/lib/session-cancel";
import { istDateString, slotStart, addDaysIso, formatDateLong, formatTime12 } from "@/lib/session-time";
import { findScheduleConflicts, previewSlots, slotMatchesSchedule, type ScheduleDraft } from "@/lib/session-schedule";

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
    posterUrl: row.poster_url ?? null,
    recurringDays: row.recurring_days,
    startTimes: row.start_times,
    dateRangeStart: row.date_range_start,
    dateRangeEnd: row.date_range_end,
    isOngoing: row.is_ongoing,
    active: row.active,
    capacity: row.capacity ?? 1,
    subject: row.subject ?? null,
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

export const listMyOfferings = createServerFn({ method: "POST" })
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

// ─── Offering input: one validator for create AND update ────────────────
// These used to be two copy-pasted handlers with thin checks (a title of "a",
// a price of ₹0.5, a start time of "99:99" or an end date in the past all went
// straight into the database). Everything is now checked once, here.
type OfferingInput = {
  token: string;
  title: string;
  description: string;
  durationMinutes: (typeof DURATION_OPTIONS)[number];
  isFree: boolean;
  price: number;
  thumbnailUrl: string | null;
  // undefined = leave the stored poster alone (also keeps this working
  // before the poster_url column migration has been run).
  posterUrl?: string | null;
  recurringDays: DayOfWeek[];
  startTimes: string[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  isOngoing: boolean;
  capacity: number;
  subject: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeOfferingInput(d: OfferingInput) {
  const title = d.title.replace(/\s+/g, " ").trim();
  if (title.length < 3) throw new Error("Give this session a clear title (at least 3 characters).");
  if (title.length > 80) throw new Error("Keep the title under 80 characters.");
  const description = d.description.trim();
  if (description.length > 600) throw new Error("Keep the description under 600 characters.");
  const subject = d.subject?.trim() || null;
  if (subject && subject.length > 40) throw new Error("Keep the subject under 40 characters.");

  if (!(DURATION_OPTIONS as readonly number[]).includes(d.durationMinutes)) throw new Error("Pick one of the offered durations.");
  if (!Number.isInteger(d.capacity) || d.capacity < 1 || d.capacity > MAX_SESSION_CAPACITY) {
    throw new Error(`Capacity must be between 1 and ${MAX_SESSION_CAPACITY}.`);
  }

  const isFree = d.isFree || d.capacity >= UNLIMITED_CAPACITY; // open-to-everyone is always free
  if (!isFree && (!Number.isInteger(d.price) || d.price < 1 || d.price > 50_000)) {
    throw new Error("Set a price as a whole number of rupees between ₹1 and ₹50,000, or mark this session free.");
  }

  const recurringDays = Array.from(new Set(d.recurringDays)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).sort() as DayOfWeek[];
  if (recurringDays.length === 0) throw new Error("Pick at least one day.");

  const startTimes = Array.from(new Set(d.startTimes.map((t) => t.trim()).filter(Boolean))).sort();
  if (startTimes.length === 0) throw new Error("Add at least one start time.");
  if (startTimes.length > 8) throw new Error("Up to 8 start times per session. Publish a second offering for more.");
  for (const t of startTimes) if (!HHMM.test(t)) throw new Error(`"${t}" isn't a valid time.`);

  for (const x of [d.dateRangeStart, d.dateRangeEnd]) {
    if (x && (!ISO_DATE.test(x) || Number.isNaN(new Date(`${x}T00:00:00Z`).getTime()))) throw new Error("One of the dates isn't valid.");
  }
  if (!d.isOngoing) {
    if (!d.dateRangeEnd) throw new Error("Set an end date, or mark this session ongoing.");
    if (d.dateRangeEnd < istDateString()) throw new Error("The end date is in the past.");
    if (d.dateRangeStart && d.dateRangeEnd < d.dateRangeStart) throw new Error("The end date comes before the start date.");
    const from = d.dateRangeStart ?? istDateString();
    if (d.dateRangeEnd > addDaysIso(from, 366)) throw new Error("A session can run for at most a year at a time. Choose \"ongoing\" for longer.");
  }

  for (const [label, url] of [["thumbnail", d.thumbnailUrl], ["poster", d.posterUrl]] as const) {
    if (url && !/^https:\/\//i.test(url)) throw new Error(`The ${label} image link must be a secure (https) URL.`);
  }

  return {
    title,
    description,
    subject,
    durationMinutes: d.durationMinutes,
    isFree,
    price: isFree ? 0 : d.price,
    capacity: d.capacity,
    recurringDays,
    startTimes,
    dateRangeStart: d.dateRangeStart,
    dateRangeEnd: d.isOngoing ? null : d.dateRangeEnd,
    isOngoing: d.isOngoing,
  };
}

const toDraft = (n: ReturnType<typeof normalizeOfferingInput>, id?: string): ScheduleDraft => ({
  id,
  title: n.title,
  recurringDays: n.recurringDays,
  startTimes: n.startTimes,
  dateRangeStart: n.dateRangeStart,
  dateRangeEnd: n.dateRangeEnd,
  isOngoing: n.isOngoing,
  durationMinutes: n.durationMinutes,
});

// A mentor can't be in two places at once: refuse a schedule that overlaps
// another *live* offering of theirs.
async function assertNoScheduleConflict(mentorId: string, draft: ScheduleDraft) {
  const { data: rows, error } = await supabase.from("mentor_session_offerings").select("*").eq("mentor_id", mentorId).eq("active", true);
  if (error) throw new Error(error.message);
  const others: ScheduleDraft[] = (rows ?? [])
    .map(rowToOffering)
    .filter((o) => o.id !== draft.id)
    .map((o) => ({
      id: o.id,
      title: o.title,
      recurringDays: o.recurringDays,
      startTimes: o.startTimes,
      dateRangeStart: o.dateRangeStart,
      dateRangeEnd: o.dateRangeEnd,
      isOngoing: o.isOngoing,
      durationMinutes: o.durationMinutes,
    }));
  const hit = findScheduleConflicts(draft, others)[0];
  if (hit) {
    throw new Error(`This overlaps with "${hit.otherTitle}" on ${formatDateLong(hit.date)} at ${formatTime12(hit.startTime)} IST. You can't run two sessions at the same time. Change the time, or pause the other offering.`);
  }
}

function assertHasFutureSlots(draft: ScheduleDraft) {
  if (previewSlots(draft, { limit: 1, windowDays: 400 }).length === 0) {
    throw new Error("That schedule has no upcoming dates. Pick a date and time that hasn't passed yet.");
  }
}

export const createOffering = createServerFn({ method: "POST" })
  .validator((d: OfferingInput) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const n = normalizeOfferingInput(data);
    const draft = toDraft(n);
    assertHasFutureSlots(draft);
    await assertNoScheduleConflict(mentorId, draft);

    const { data: row, error } = await supabase
      .from("mentor_session_offerings")
      .insert({
        mentor_id: mentorId,
        title: n.title,
        description: n.description,
        duration_minutes: n.durationMinutes,
        is_free: n.isFree,
        price: n.price,
        thumbnail_url: data.thumbnailUrl,
        ...(data.posterUrl !== undefined ? { poster_url: data.posterUrl } : {}),
        recurring_days: n.recurringDays,
        start_times: n.startTimes,
        date_range_start: n.dateRangeStart,
        date_range_end: n.dateRangeEnd,
        is_ongoing: n.isOngoing,
        capacity: n.capacity,
        subject: n.subject,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { offering: rowToOffering(row) };
  });

// Edit any detail of an existing offering, with the same validation as
// create. On top of that, an edit must never silently strand students who
// have already booked (and paid):
//  - capacity can't drop below the seats taken on any upcoming session;
//  - every upcoming booked session must still exist in the new schedule —
//    removing a day or time that has bookings is refused until the mentor
//    cancels that session (which refunds and notifies the students).
export const updateOffering = createServerFn({ method: "POST" })
  .validator((d: OfferingInput & { offeringId: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const n = normalizeOfferingInput(data);
    const draft = toDraft(n, data.offeringId);
    assertHasFutureSlots(draft);

    const { data: existing, error: exErr } = await supabase
      .from("mentor_session_offerings")
      .select("active")
      .eq("id", data.offeringId)
      .eq("mentor_id", mentorId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Offering not found.");
    if (existing.active) await assertNoScheduleConflict(mentorId, draft);

    const todayIso = istDateString();
    const { data: upcoming, error: upErr } = await supabase
      .from("mentor_session_bookings")
      .select("session_date, start_time")
      .eq("offering_id", data.offeringId)
      .eq("mentor_id", mentorId)
      .neq("status", "cancelled")
      .gte("session_date", todayIso);
    if (upErr) throw new Error(upErr.message);

    const perInstance = new Map<string, { date: string; time: string; n: number }>();
    for (const r of upcoming ?? []) {
      const date = String(r.session_date).slice(0, 10);
      const time = String(r.start_time).slice(0, 5);
      const k = `${date}:${time}`;
      const cur = perInstance.get(k) ?? { date, time, n: 0 };
      cur.n += 1;
      perInstance.set(k, cur);
    }
    const now = Date.now();
    const live = Array.from(perInstance.values()).filter((i) => slotStart(i.date, i.time).getTime() > now);

    const maxTaken = Math.max(0, ...live.map((i) => i.n));
    if (n.capacity < maxTaken) {
      throw new Error(`An upcoming session already has ${maxTaken} students booked, so capacity can't go below that.`);
    }
    const stranded = live.find((i) => !slotMatchesSchedule(n, i.date, i.time));
    if (stranded) {
      throw new Error(
        `${formatDateLong(stranded.date)} at ${formatTime12(stranded.time)} IST has ${stranded.n} student${stranded.n === 1 ? "" : "s"} booked, but your new schedule drops that time. Cancel that session first (Sessions → Upcoming; paid students are refunded automatically), or keep the time.`,
      );
    }

    const { error } = await supabase
      .from("mentor_session_offerings")
      .update({
        title: n.title,
        description: n.description,
        duration_minutes: n.durationMinutes,
        is_free: n.isFree,
        price: n.price,
        thumbnail_url: data.thumbnailUrl,
        ...(data.posterUrl !== undefined ? { poster_url: data.posterUrl } : {}),
        recurring_days: n.recurringDays,
        start_times: n.startTimes,
        date_range_start: n.dateRangeStart,
        date_range_end: n.dateRangeEnd,
        is_ongoing: n.isOngoing,
        capacity: n.capacity,
        subject: n.subject,
        updated_at: new Date().toISOString(),
      })
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
    if (data.active) {
      const { data: row, error: rowErr } = await sb.from("mentor_session_offerings").select("*").eq("id", data.offeringId).eq("mentor_id", mentorId).maybeSingle();
      if (rowErr) throw new Error(rowErr.message);
      if (!row) throw new Error("Offering not found.");
      const o = rowToOffering(row);
      const draft: ScheduleDraft = { id: o.id, title: o.title, recurringDays: o.recurringDays, startTimes: o.startTimes, dateRangeStart: o.dateRangeStart, dateRangeEnd: o.dateRangeEnd, isOngoing: o.isOngoing, durationMinutes: o.durationMinutes };
      await assertNoScheduleConflict(mentorId, draft);
    }
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
// joined in so the UI doesn't need a second round trip. The component
// groups these into per-session rosters (see groupBookingsIntoRosters in
// lib/session-types.ts) — this stays flat since that's the simpler shape
// to page/filter/search over.
export const listMyBookings = createServerFn({ method: "POST" })
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

// Sets the meeting link for every booking in one session instance at once
// (same offering + date + start time) — since a group session has one
// meeting link shared by the whole roster, not one per student.
export const setMeetingLinkForSession = createServerFn({ method: "POST" })
  .validator((d: { token: string; offeringId: string; sessionDate: string; startTime: string; meetingLink: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("mentor_session_bookings")
      .update({ meeting_link: data.meetingLink.trim() })
      .eq("mentor_id", mentorId)
      .eq("offering_id", data.offeringId)
      .eq("session_date", data.sessionDate)
      .eq("start_time", data.startTime);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Running a session: cancel / complete / no-show ─────────────────────
// Booking status used to be write-once ("upcoming") — nothing could ever mark
// a session done, missed or cancelled, so a mentor who fell ill had no way to
// call a session off and students stayed booked (and paid) against it.

type InstanceRef = { offeringId: string; sessionDate: string; startTime: string };

async function loadInstanceBookings(mentorId: string, ref: InstanceRef) {
  const { data: rows, error } = await supabase
    .from("mentor_session_bookings")
    .select("*, mentor_session_offerings(title)")
    .eq("mentor_id", mentorId)
    .eq("offering_id", ref.offeringId)
    .eq("session_date", ref.sessionDate)
    .eq("start_time", ref.startTime);
  if (error) throw new Error(error.message);
  return rows ?? [];
}

// Cancels one session (every student booked on that date + time). Paid
// bookings are refunded in full automatically; students are emailed.
export const cancelSessionAsMentor = createServerFn({ method: "POST" })
  .validator((d: { token: string } & InstanceRef & { reason?: string }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    if (slotStart(data.sessionDate, data.startTime).getTime() <= Date.now()) {
      throw new Error("This session has already started — you can mark it complete instead.");
    }
    const rows = (await loadInstanceBookings(mentorId, data)).filter((r: any) => r.status === "upcoming");
    if (rows.length === 0) throw new Error("There are no active bookings on this session to cancel.");

    const result = await cancelBookings(rows as BookingRow[], {
      by: "mentor",
      refund: true,
      strict: false,
      offeringTitle: (rows[0] as any).mentor_session_offerings?.title ?? "Session",
      reason: data.reason,
    });
    return { ok: true as const, cancelled: result.cancelled, refunded: result.refunded, refundFailures: result.refundFailures.length };
  });

// Marks a session that has started as completed for everyone still marked upcoming.
export const completeSession = createServerFn({ method: "POST" })
  .validator((d: { token: string } & InstanceRef) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const rows = (await loadInstanceBookings(mentorId, data)).filter((r: any) => r.status === "upcoming");
    if (rows.length === 0) return { ok: true as const, updated: 0 };
    const first = rows[0] as any;
    if (slotStart(first.session_date, first.start_time).getTime() > Date.now()) {
      throw new Error("This session hasn't started yet.");
    }
    const { error } = await supabase
      .from("mentor_session_bookings")
      .update({ status: "completed" })
      .in("id", rows.map((r: any) => r.id))
      .eq("mentor_id", mentorId)
      .eq("status", "upcoming");
    if (error) throw new Error(error.message);
    return { ok: true as const, updated: rows.length };
  });

// Flags a student as a no-show (or undoes that) once the session has started.
export const setBookingNoShow = createServerFn({ method: "POST" })
  .validator((d: { token: string; bookingId: string; noShow: boolean }) => d)
  .handler(async ({ data }) => {
    const mentorId = await requireMentor(data.token);
    const { data: row, error } = await supabase
      .from("mentor_session_bookings")
      .select("id, session_date, start_time, duration_minutes, status")
      .eq("id", data.bookingId)
      .eq("mentor_id", mentorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Booking not found.");
    if (row.status === "cancelled") throw new Error("This booking was cancelled.");
    if (slotStart(row.session_date, row.start_time).getTime() > Date.now()) throw new Error("This session hasn't started yet.");

    const { error: upErr } = await supabase
      .from("mentor_session_bookings")
      .update({ status: data.noShow ? "no_show" : "completed" })
      .eq("id", data.bookingId)
      .eq("mentor_id", mentorId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const };
  });
