// Sends "starting soon" emails for mentor sessions — to every booked student,
// and once per session to the mentor (with a nudge if no meeting link is set).
//
// Two real bugs fixed here:
//  1. Slot times are India wall-clock but were parsed with the *server's*
//     timezone, so on a UTC host reminders went out 5½ hours off. All math now
//     goes through slotStart() (explicit +05:30).
//  2. Nothing ever called this function. It is now exposed at
//     /cron/session-reminders (routes/cron.session-reminders.ts) — point a
//     scheduler at it every 10–15 minutes.
//
// Window: a session is reminded once it is 30–70 minutes away, so any
// schedule that runs at least every ~40 minutes reaches every booking exactly
// once (idempotent via reminder_sent_at). Bookings made inside the last 30
// minutes get no reminder — they were only just confirmed.
import { supabase } from "@/lib/supabase";
import { sendMail } from "@/lib/mailer";
import { sessionReminderEmailHtml } from "@/lib/email-templates";
import { istDateString, slotStart, formatTime12 } from "@/lib/session-time";
import { lookupMentorContact } from "@/lib/session-cancel";

const MIN_AHEAD_MS = 30 * 60_000;
const MAX_AHEAD_MS = 70 * 60_000;

export async function sendSessionReminders(now: Date = new Date(), opts: { dryRun?: boolean } = {}) {
  const from = new Date(now.getTime() + MIN_AHEAD_MS);
  const to = new Date(now.getTime() + MAX_AHEAD_MS);
  // IST calendar dates the window can touch (it may straddle midnight).
  const dates = Array.from(new Set([istDateString(from), istDateString(to)]));

  const { data: rows, error } = await supabase
    .from("mentor_session_bookings")
    .select("*, mentor_session_offerings(title)")
    .eq("status", "upcoming")
    .in("session_date", dates);
  if (error) throw new Error(error.message);

  const inWindow = (rows ?? []).filter((r: any) => {
    const start = slotStart(r.session_date, r.start_time);
    return start >= from && start <= to;
  });

  const due = inWindow.filter((r: any) => !r.reminder_sent_at);
  const dueIds: string[] = [];
  let studentsEmailed = 0;
  let mentorsEmailed = 0;

  // Group per session instance so the mentor gets ONE email per session.
  const instances = new Map<string, any[]>();
  for (const r of inWindow) {
    const k = `${r.offering_id}:${r.session_date}:${r.start_time}`;
    const list = instances.get(k) ?? [];
    list.push(r);
    instances.set(k, list);
  }

  for (const group of instances.values()) {
    const pending = group.filter((r) => !r.reminder_sent_at);
    if (pending.length === 0) continue;
    const first = group[0];
    const title = first.mentor_session_offerings?.title ?? "your session";
    const when = `${formatTime12(first.start_time)} IST`;
    const mentor = await lookupMentorContact(first.mentor_id).catch(() => null);
    // The mentor hasn't been reminded for this session yet if no booking in it was.
    const mentorAlreadyReminded = group.some((r) => r.reminder_sent_at);
    const sharedLink = group.find((r) => r.meeting_link)?.meeting_link ?? null;

    if (opts.dryRun) {
      dueIds.push(...pending.map((r) => r.id));
      continue;
    }

    for (const r of pending) {
      if (r.student_email) {
        try {
          await sendMail({
            to: r.student_email,
            subject: `Starting soon: ${title} at ${when}`,
            html: sessionReminderEmailHtml({
              name: r.student_name,
              counterpartName: mentor?.name ?? "your mentor",
              title,
              startTime: when,
              meetingLink: r.meeting_link,
              audience: "student",
            }),
          });
          studentsEmailed += 1;
        } catch (err) {
          console.error(`[sendSessionReminders] student email failed for booking=${r.id}:`, err);
        }
      }
      // Mark it either way — a bounced address shouldn't be retried every run.
      await supabase.from("mentor_session_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
      dueIds.push(r.id);
    }

    if (!mentorAlreadyReminded && mentor?.email) {
      try {
        await sendMail({
          to: mentor.email,
          subject: `Starting soon: ${title} at ${when}`,
          html: sessionReminderEmailHtml({
            name: mentor.name,
            counterpartName: group.length === 1 ? first.student_name : `${group.length} students`,
            title,
            startTime: when,
            meetingLink: sharedLink,
            audience: "mentor",
          }),
        });
        mentorsEmailed += 1;
      } catch (err) {
        console.error(`[sendSessionReminders] mentor email failed for ${first.offering_id}:`, err);
      }
    }
  }

  return { dryRun: Boolean(opts.dryRun), bookingsDue: due.length, studentsEmailed, mentorsEmailed };
}
