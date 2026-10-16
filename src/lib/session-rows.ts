import type { MentorSessionOffering } from "@/lib/session-types";

// Supabase row -> MentorSessionOffering. (mentor-sessions.ts and
// student-sessions.ts still carry their own identical copies; new code
// should import this one.)
export function rowToOffering(row: any): MentorSessionOffering {
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
