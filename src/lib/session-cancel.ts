// SERVER-ONLY. The one place a session booking gets cancelled, whether the
// student or the mentor started it: claim the row, refund if owed, tell the
// other side. Imported only from server-function files; heavy modules
// (mailer, razorpay) are loaded lazily so a missing email/payment env var
// can't take cancellation itself down.
import { supabase } from "@/lib/supabase";
import { getDb } from "@/lib/mongo";
import { refundRazorpayPayment } from "@/lib/razorpay-refund";

export type BookingRow = {
  id: string;
  offering_id: string;
  mentor_id: string;
  student_uid: string;
  student_name: string;
  student_email: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  price: number | string;
  is_free: boolean;
  payment_status: string;
  razorpay_payment_id: string | null;
  status: string;
};

export async function lookupMentorContact(mentorId: string): Promise<{ name: string; email: string | null } | null> {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(mentorId)) return null;
  const db = await getDb();
  const mentor = await db.collection("mentors").findOne({ _id: new ObjectId(mentorId) }, { projection: { name: 1 } });
  if (!mentor) return null;
  let email: string | null = null;
  const onboarding = await db.collection("mentorOnboardingDetails").findOne({ mentorProfileId: mentorId });
  if (onboarding?.applicationId) {
    const app = await db.collection("creatorApplications").findOne({ _id: new ObjectId(onboarding.applicationId as string) });
    email = (app?.personal as { email?: string } | undefined)?.email ?? null;
  }
  return { name: (mentor.name as string) ?? "Mentor", email };
}

export type CancelResult = {
  cancelled: number;
  refunded: number;
  /** Paid bookings that should have been refunded but the gateway call failed — needs a human. */
  refundFailures: { bookingId: string; paymentId: string | null }[];
};

/**
 * Cancels the given bookings.
 *  - `refund`: refund paid bookings in full.
 *  - `strict`: if a refund fails, undo the cancellation and throw (used for
 *    student-initiated cancels, so nobody ends up cancelled-but-unrefunded
 *    after being promised a refund). Mentor cancels are never strict — the
 *    session isn't happening either way — failures are reported instead.
 */
export async function cancelBookings(
  rows: BookingRow[],
  opts: { by: "student" | "mentor"; refund: boolean; strict: boolean; offeringTitle: string; reason?: string },
): Promise<CancelResult> {
  const result: CancelResult = { cancelled: 0, refunded: 0, refundFailures: [] };

  for (const row of rows) {
    // Claim the row first: only an "upcoming" booking can be cancelled, and
    // only once, so a double-click or a retry can't refund twice.
    const { data: claimed, error } = await supabase
      .from("mentor_session_bookings")
      .update({ status: "cancelled" })
      .eq("id", row.id)
      .eq("status", "upcoming")
      .select("id");
    if (error) throw new Error(error.message);
    if (!claimed || claimed.length === 0) continue;

    let refunded = false;
    const owed = opts.refund && row.payment_status === "paid" && Number(row.price) > 0 && Boolean(row.razorpay_payment_id);
    if (owed) {
      try {
        const r = await refundRazorpayPayment(row.razorpay_payment_id as string, { reason: `session cancelled by ${opts.by}`, bookingId: row.id });
        refunded = r.refunded;
      } catch (err) {
        console.error(`[cancelBookings] refund failed for booking=${row.id}:`, err);
        if (opts.strict) {
          await supabase.from("mentor_session_bookings").update({ status: "upcoming" }).eq("id", row.id);
          throw new Error("We couldn't process your refund just now, so nothing was cancelled. Please try again in a minute.");
        }
        result.refundFailures.push({ bookingId: row.id, paymentId: row.razorpay_payment_id });
      }
      if (refunded) {
        await supabase.from("mentor_session_bookings").update({ payment_status: "refunded" }).eq("id", row.id);
      }
    }

    result.cancelled += 1;
    if (refunded) result.refunded += 1;

    await notifyCancellation(row, { ...opts, refunded, refundOwed: owed });
  }
  return result;
}

async function notifyCancellation(
  row: BookingRow,
  opts: { by: "student" | "mentor"; offeringTitle: string; reason?: string; refunded: boolean; refundOwed: boolean },
) {
  try {
    const [{ sendMail }, { sessionCancelledEmailHtml }] = await Promise.all([import("@/lib/mailer"), import("@/lib/email-templates")]);

    if (opts.by === "mentor") {
      if (!row.student_email) return;
      const mentor = await lookupMentorContact(row.mentor_id);
      await sendMail({
        to: row.student_email,
        subject: `Cancelled: ${opts.offeringTitle}`,
        html: sessionCancelledEmailHtml({
          recipientName: row.student_name,
          title: opts.offeringTitle,
          date: row.session_date,
          startTime: row.start_time,
          headline: `${mentor?.name ?? "Your mentor"} had to cancel this session`,
          note: opts.reason?.trim() || null,
          refundNote: opts.refunded
            ? "Your payment has been refunded in full — it can take 5–7 business days to show up."
            : opts.refundOwed
              ? "We're processing your refund and will email you once it's done."
              : null,
        }),
      });
    } else {
      const mentor = await lookupMentorContact(row.mentor_id);
      if (!mentor?.email) return;
      await sendMail({
        to: mentor.email,
        subject: `Cancelled by student: ${opts.offeringTitle}`,
        html: sessionCancelledEmailHtml({
          recipientName: mentor.name,
          title: opts.offeringTitle,
          date: row.session_date,
          startTime: row.start_time,
          headline: `${row.student_name} cancelled their booking`,
          note: null,
          refundNote: null,
        }),
      });
    }
  } catch (err) {
    // Email is best-effort; the cancellation itself already happened.
    console.error(`[cancelBookings] notification failed for booking=${row.id}:`, err);
  }
}
