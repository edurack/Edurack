// Student-side: browse open mentor slots. Booking itself (both free and
// paid) goes through server-functions/payments.ts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import { expandOfferingToSlots } from "@/lib/session-slots";
import type { MentorSessionOffering, OpenSlot, PublicMentorOffering } from "@/lib/session-types";

async function verifyFirebaseToken(token: string) {
  return adminAuth.verifyIdToken(token);
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
    capacity: row.capacity ?? 1,
    subject: row.subject ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function lookupMentorPublicInfo(mentorIds: string[]): Promise<Record<string, { name: string; photoUrl: string | null }>> {
  if (mentorIds.length === 0) return {};
  const { ObjectId } = await import("mongodb");

  const validIds: { raw: string; oid: InstanceType<typeof ObjectId> }[] = [];
  for (const id of mentorIds) {
    if (ObjectId.isValid(id)) validIds.push({ raw: id, oid: new ObjectId(id) });
  }
  if (validIds.length === 0) return {};

  const db = await getDb();
  const mentors = await db
    .collection("mentors")
    .find({ _id: { $in: validIds.map((v) => v.oid) } }, { projection: { name: 1, profilePictureUrl: 1 } })
    .toArray();
  const byId = new Map(mentors.map((m) => [String(m._id), m]));

  const result: Record<string, { name: string; photoUrl: string | null }> = {};
  for (const { raw } of validIds) {
    const m = byId.get(raw);
    if (m) {
      result[raw] = { name: (m.name as string) ?? "Mentor", photoUrl: (m.profilePictureUrl as string | null) ?? null };
    }
  }
  return result;
}

// Lists every mentor's active offerings plus, for each, its next open
// slots (21-day window) with seats-remaining counts for group sessions.
export const listOpenMentorSessions = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await verifyFirebaseToken(data.token);

    const { data: offeringRows, error } = await supabase
      .from("mentor_session_offerings")
      .select("*")
      .eq("active", true);
    if (error) throw new Error(error.message);

    const offerings = (offeringRows ?? []).map(rowToOffering);
    if (offerings.length === 0) return { offerings: [] as PublicMentorOffering[], slotsByOffering: {} as Record<string, OpenSlot[]> };

    const offeringIds = offerings.map((o) => o.id);
    const { data: bookingRows, error: bErr } = await supabase
      .from("mentor_session_bookings")
      .select("offering_id, session_date, start_time")
      .in("offering_id", offeringIds)
      .neq("status", "cancelled");
    if (bErr) throw new Error(bErr.message);

    // Count bookings per slot instead of a boolean "is it taken" set — a
    // group offering (capacity > 1) can have several non-cancelled
    // bookings for the same slot and still have seats left.
    const seatCounts = new Map<string, number>();
    for (const b of bookingRows ?? []) {
      const key = `${b.offering_id}:${b.session_date}:${b.start_time}`;
      seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
    }

    const mentorIds = Array.from(new Set(offerings.map((o) => o.mentorId)));
    const mentorInfo = await lookupMentorPublicInfo(mentorIds);

    const publicOfferings: PublicMentorOffering[] = offerings.map((o) => ({
      ...o,
      mentorName: mentorInfo[o.mentorId]?.name ?? "Mentor",
      mentorPhotoUrl: mentorInfo[o.mentorId]?.photoUrl ?? null,
    }));

    const slotsByOffering: Record<string, OpenSlot[]> = {};
    for (const o of offerings) {
      slotsByOffering[o.id] = expandOfferingToSlots(o, seatCounts);
    }

    return { offerings: publicOfferings, slotsByOffering };
  });

export const listMyBookedSessions = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const student = await verifyFirebaseToken(data.token);
    const { data: rows, error } = await supabase
      .from("mentor_session_bookings")
      .select("*, mentor_session_offerings(title)")
      .eq("student_uid", student.uid)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return { bookings: rows ?? [] };
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
export const getMentorSessionOfferingDetail = createServerFn({ method: "GET" })
  .validator((d: { token?: string; offeringId: string }) => d)
  .handler(async ({ data }) => {
    if (data.token) {
      try {
        await verifyFirebaseToken(data.token);
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
      expertAt: (mentorDoc?.expertAt as string) ?? "",
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

    return { offering: publicOffering, mentorBio, slots, otherOfferings };
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