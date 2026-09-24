// Sends "starts in ~1 hour" reminder emails. Call this from a scheduled
// job — e.g. a Vercel Cron hitting a thin API route that calls
// sendSessionReminders(), every 10–15 minutes. Idempotent via
// reminder_sent_at so re-runs in the same window don't double-send.
import { supabase } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { sessionReminderEmailHtml } from "@/lib/email-templates"; // merge session-email-templates.ts's functions in here first

export async function sendSessionReminders() {
  const sb = supabase;
  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

  // Only today's/tomorrow's dates need checking; filter precisely in JS
  // since comparing a separate date + time column pair in SQL is awkward.
  const { data: rows, error } = await sb
    .from("mentor_session_bookings")
    .select("*, mentor_session_offerings(title)")
    .in("status", ["upcoming"])
    .is("reminder_sent_at", null)
    .in("session_date", [toIsoDate(windowStart), toIsoDate(windowEnd)]);
  if (error) throw new Error(error.message);

  const due = (rows ?? []).filter((r: any) => {
    const slot = new Date(`${r.session_date}T${r.start_time}:00`);
    return slot >= windowStart && slot <= windowEnd;
  });

  for (const r of due) {
    const title = r.mentor_session_offerings?.title ?? "your session";
    if (r.student_email) {
      try {
        await sendMail({
          to: r.student_email,
          subject: `Starting soon: ${title} at ${r.start_time}`,
          html: sessionReminderEmailHtml({
            name: r.student_name,
            counterpartName: "your mentor",
            title,
            startTime: r.start_time,
            meetingLink: r.meeting_link,
          }),
        });
      } catch (err) {
        console.error(`[sendSessionReminders] reminder email failed for booking=${r.id}:`, err);
      }
    }
    await sb.from("mentor_session_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
  }

  return { remindersSent: due.length };
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}