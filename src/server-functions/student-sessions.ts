// Student-side: browse open mentor slots. Booking itself (both free and
// paid) goes through server-functions/payments.ts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { loadMyBookedSessions, loadOpenMentorSessions, lookupMentorPublicInfo } from "@/lib/dashboard-core";
import { rowToOffering } from "@/lib/session-rows";
import { supabase } from "@/lib/supabase";
import { expandOfferingToSlots } from "@/lib/session-slots";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";
import { cancelBookings, type BookingRow } from "@/lib/session-cancel";
import { cancellationPolicy, istDateString, slotStart } from "@/lib/session-time";

async function verifyFirebaseToken(token: string) {
  return adminAuth.verifyIdToken(token);
}

// Lists every mentor's active offerings plus, for each, its next open
// slots (21-day window) with seats-remaining counts for group sessions.
export const listOpenMentorSessions = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await verifyFirebaseToken(data.token);
    return loadOpenMentorSessions();
  });

export const listMyBookedSessions = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const student = await verifyFirebaseToken(data.token);
    return loadMyBookedSessions(student.uid);
  });

// Student-initiated cancellation. Applies the policy in lib/session-time.ts:
// 24h+ out and paid -> automatic full refund; closer in -> seat is released
// but no automatic refund; already started -> not allowed. (The old UI told
// students to "cancel from My Sessions" but no such button or function
// existed, and a booked offering stayed locked to them permanently.)
export const cancelMyBooking = createServerFn({ method: "POST" })
  .validator((d: { token: string; bookingId: string }) => d)
  .handler(async ({ data }) => {
    const student = await verifyFirebaseToken(data.token);
    const { data: row, error } = await supabase
      .from("mentor_session_bookings")
      .select("*, mentor_session_offerings(title)")
      .eq("id", data.bookingId)
      .eq("student_uid", student.uid) // ownership
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("We couldn't find that booking.");
    if (row.status !== "upcoming") throw new Error("This booking has already been cancelled or completed.");

    const isPaid = row.payment_status === "paid" && Number(row.price) > 0;
    const policy = cancellationPolicy(slotStart(row.session_date, row.start_time), isPaid);
    if (!policy.canCancel) throw new Error(policy.detail);

    const result = await cancelBookings([row as BookingRow], {
      by: "student",
      refund: policy.refund === "full",
      strict: true,
      offeringTitle: row.mentor_session_offerings?.title ?? "Session",
    });
    if (result.cancelled === 0) throw new Error("This booking has already been cancelled.");
    return { ok: true as const, refunded: result.refunded > 0, policy: policy.refund };
  });

// ─── Premium session detail page ────────────────────────────────────────
// Everything one offering's own page needs in a single round trip: the
// offering itself, the mentor's full public bio (not just name/photo —
// same "locked profile" fields shown on /mentor-profile/$mentorId), the
// FULL slot window (not the 4-slot preview used on cards), and a few of
// the mentor's other active offerings for "more with this mentor".
// Public — no token required. Offering/mentor-bio/seat-count data here
// isn't student-identifying, so this is safe to expose to logged-out
// visitors (landing page, shared links). If a token IS supplied (a
// logged-in student opened this via an in-app link) it's verified but
// failures are swallowed rather than failing the whole page — a stale
// token shouldn't turn a public page into an error page.
export const getMentorSessionOfferingDetail = createServerFn({ method: "POST" })
  .validator((d: { token?: string; offeringId: string }) => d)
  .handler(async ({ data }) => {
    let viewerUid: string | null = null;
    if (data.token) {
      try {
        viewerUid = (await verifyFirebaseToken(data.token)).uid;
      } catch {
        // ignore — treat as an anonymous view rather than erroring
      }
    }

    const { data: row, error } = await supabase
      .from("mentor_session_offerings")
      .select("*")
      .eq("id", data.offeringId)
      .eq("active", true)
      .single();
    if (error || !row) throw new Error("This session isn't available anymore.");
    const offering = rowToOffering(row);

    const { data: bookingRows, error: bErr } = await supabase
      .from("mentor_session_bookings")
      .select("session_date, start_time")
      .eq("offering_id", offering.id)
      .neq("status", "cancelled");
    if (bErr) throw new Error(bErr.message);

    const seatCounts = new Map<string, number>();
    for (const b of bookingRows ?? []) {
      const key = `${offering.id}:${b.session_date}:${b.start_time}`;
      seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
    }
    const slots = expandOfferingToSlots(offering, seatCounts);

    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const mentorDoc = ObjectId.isValid(offering.mentorId)
      ? await db.collection("mentors").findOne({ _id: new ObjectId(offering.mentorId) })
      : null;

    const mentorBio = {
      name: (mentorDoc?.name as string) ?? "Mentor",
      photoUrl: (mentorDoc?.profilePictureUrl as string | null) ?? null,
      aboutText: (mentorDoc?.aboutText as string) ?? "",
      yearOfStudy: (mentorDoc?.yearOfStudy as string) ?? "",
      aiimsIitRank: (mentorDoc?.aiimsIitRank as string) ?? "",
      enrolledCollege: (mentorDoc?.enrolledCollege as string) ?? "",
      pursuedCourse: (mentorDoc?.pursuedCourse as string) ?? "",
      // Stored as a list for some mentors and a comma-separated string for
      // others; the page now always gets a list (it used to call .join() on
      // whatever it got).
      expertAt: Array.isArray(mentorDoc?.expertAt)
        ? (mentorDoc?.expertAt as unknown[]).map(String).filter(Boolean)
        : typeof mentorDoc?.expertAt === "string"
          ? (mentorDoc.expertAt as string).split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      whyExpertAt: (mentorDoc?.whyExpertAt as string) ?? "",
      scoreType: (mentorDoc?.scoreType as "rank" | "percentile" | "score" | null) ?? null,
      scoreValue: (mentorDoc?.scoreValue as string) ?? "",
    };

    const { data: otherRows } = await supabase
      .from("mentor_session_offerings")
      .select("id, title, is_free, price, duration_minutes")
      .eq("mentor_id", offering.mentorId)
      .eq("active", true)
      .neq("id", offering.id)
      .limit(3);

    const otherOfferings = (otherRows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      isFree: r.is_free,
      price: Number(r.price),
      durationMinutes: r.duration_minutes,
    }));

    const publicOffering: PublicMentorOffering = { ...offering, mentorName: mentorBio.name, mentorPhotoUrl: mentorBio.photoUrl };

    let myBooking: { id: string; sessionDate: string; startTime: string; meetingLink: string | null } | null = null;
    if (viewerUid) {
      const { data: mine } = await supabase
        .from("mentor_session_bookings")
        .select("id, session_date, start_time, meeting_link")
        .eq("offering_id", offering.id)
        .eq("student_uid", viewerUid)
        .eq("status", "upcoming")
        .gte("session_date", istDateString())
        .order("session_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (mine) myBooking = { id: mine.id, sessionDate: mine.session_date, startTime: mine.start_time, meetingLink: mine.meeting_link ?? null };
    }

    return { offering: publicOffering, mentorBio, slots, otherOfferings, myBooking };
  });

// ─── Public landing-page listing ────────────────────────────────────────
// No token required — this is what the marketing landing page shows
// logged-out visitors as a platform USP. Returns only free offerings with
// at least one open slot, soonest-first, capped to a handful so it reads
// as a curated showcase rather than a full catalog dump. Booking itself
// still requires signing in (payments.ts's claimFreeItem needs a Firebase
// token) — this only powers discovery, not the transaction.
export const listPublicFreeMentorSessions = createServerFn({ method: "GET" })
  .validator((d: { limit?: number }) => d)
  .handler(async ({ data }) => {
    const cap = Math.min(data.limit ?? 6, 12);

    const { data: offeringRows, error } = await supabase
      .from("mentor_session_offerings")
      .select("*")
      .eq("active", true)
      .eq("is_free", true);
    if (error) throw new Error(error.message);

    const offerings = (offeringRows ?? []).map(rowToOffering);
    if (offerings.length === 0) return { sessions: [] as (PublicMentorOffering & { nextSlot: OpenSlot })[] };

    const offeringIds = offerings.map((o) => o.id);
    const { data: bookingRows, error: bErr } = await supabase
      .from("mentor_session_bookings")
      .select("offering_id, session_date, start_time")
      .in("offering_id", offeringIds)
      .neq("status", "cancelled");
    if (bErr) throw new Error(bErr.message);

    const seatCounts = new Map<string, number>();
    for (const b of bookingRows ?? []) {
      const key = `${b.offering_id}:${b.session_date}:${b.start_time}`;
      seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
    }

    const mentorIds = Array.from(new Set(offerings.map((o) => o.mentorId)));
    const mentorInfo = await lookupMentorPublicInfo(mentorIds);

    const withNextSlot: (PublicMentorOffering & { nextSlot: OpenSlot })[] = [];
    for (const o of offerings) {
      const slots = expandOfferingToSlots(o, seatCounts, 21);
      if (slots.length === 0) continue;
      withNextSlot.push({
        ...o,
        mentorName: mentorInfo[o.mentorId]?.name ?? "Mentor",
        mentorPhotoUrl: mentorInfo[o.mentorId]?.photoUrl ?? null,
        nextSlot: slots[0],
      });
    }

    withNextSlot.sort((a, b) => (a.nextSlot.date + a.nextSlot.startTime).localeCompare(b.nextSlot.date + b.nextSlot.startTime));

    return { sessions: withNextSlot.slice(0, cap) };
  });