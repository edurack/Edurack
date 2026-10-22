// Public (no login) listing of bookable mentor sessions. Powers the
// /mentorship-sessions hub and the "sessions" block on a mentor's public
// profile, so both can be rendered on the server for crawlers.
//
// Only offerings that currently have at least one open slot are returned —
// a card nobody can book would just be a dead end. (Every ACTIVE offering is
// still in the sitemap, so a full session's own page stays indexed.)
import { createServerFn } from "@tanstack/react-start";
import { lookupMentorPublicInfo } from "@/lib/dashboard-core";
import { createTtlCache } from "@/lib/simple-cache";
import { rowToOffering } from "@/lib/session-rows";
import { expandOfferingToSlots } from "@/lib/session-slots";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";
import { supabase } from "@/lib/supabase";

export type PublicSessionCard = PublicMentorOffering & { nextSlot: OpenSlot };

// Identical for every visitor and fine to be a minute old; crawlers and a
// traffic spike shouldn't each trigger a full offerings + bookings scan.
const cache = createTtlCache<PublicSessionCard[]>(60_000);

async function loadAllPublicSessions(): Promise<PublicSessionCard[]> {
  const hit = cache.get("all");
  if (hit) return hit;

  const { data: offeringRows, error } = await supabase.from("mentor_session_offerings").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const offerings = (offeringRows ?? []).map(rowToOffering);
  if (offerings.length === 0) {
    cache.set("all", []);
    return [];
  }

  const { data: bookingRows, error: bErr } = await supabase
    .from("mentor_session_bookings")
    .select("offering_id, session_date, start_time")
    .in(
      "offering_id",
      offerings.map((o) => o.id),
    )
    .neq("status", "cancelled");
  if (bErr) throw new Error(bErr.message);

  const seatCounts = new Map<string, number>();
  for (const b of bookingRows ?? []) {
    const key = `${b.offering_id}:${b.session_date}:${b.start_time}`;
    seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
  }

  const mentorInfo = await lookupMentorPublicInfo(Array.from(new Set(offerings.map((o) => o.mentorId))));

  const cards: PublicSessionCard[] = [];
  for (const o of offerings) {
    const slots = expandOfferingToSlots(o, seatCounts, 21);
    if (slots.length === 0) continue;
    cards.push({
      ...o,
      mentorName: mentorInfo[o.mentorId]?.name ?? "Mentor",
      mentorPhotoUrl: mentorInfo[o.mentorId]?.photoUrl ?? null,
      nextSlot: slots[0],
    });
  }
  cards.sort((a, b) => (a.nextSlot.date + a.nextSlot.startTime).localeCompare(b.nextSlot.date + b.nextSlot.startTime));
  cache.set("all", cards);
  return cards;
}

export const listPublicMentorSessions = createServerFn({ method: "GET" })
  .validator((d: { mentorId?: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    let sessions = await loadAllPublicSessions();
    if (data.mentorId) sessions = sessions.filter((s) => s.mentorId === data.mentorId);
    return { sessions: sessions.slice(0, Math.min(Math.max(data.limit ?? 60, 1), 100)) };
  });
