// Student-side: browse open mentor slots. Booking itself (both free and
// paid) goes through server-functions/payments.ts — claimFreeItem for
// free offerings, createRazorpayOrder + verifyRazorpayPayment (itemType:
// "mentorSession") for paid ones — so this file has no payment logic.
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Real lookup now (was a stub returning {}). Mirrors payments.ts's
// lookupMentorPublicInfo but batched (one query for N mentor ids) since
// this runs once per offerings list rather than once per booking. Any
// mentorId that isn't a valid ObjectId or doesn't resolve is simply
// skipped — the caller falls back to "Mentor" / no photo per-offering.
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
// slots (21-day window).
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

    const bookedKeys = new Set((bookingRows ?? []).map((b: any) => `${b.offering_id}:${b.session_date}:${b.start_time}`));

    const mentorIds = Array.from(new Set(offerings.map((o) => o.mentorId)));
    const mentorInfo = await lookupMentorPublicInfo(mentorIds);

    const publicOfferings: PublicMentorOffering[] = offerings.map((o) => ({
      ...o,
      mentorName: mentorInfo[o.mentorId]?.name ?? "Mentor",
      mentorPhotoUrl: mentorInfo[o.mentorId]?.photoUrl ?? null,
    }));

    const slotsByOffering: Record<string, OpenSlot[]> = {};
    for (const o of offerings) {
      slotsByOffering[o.id] = expandOfferingToSlots(o, bookedKeys);
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