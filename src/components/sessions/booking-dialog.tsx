// The booking flow: review -> (pay) -> confirmation. Same props as the old
// BookingDialog so the dashboard, browse module and detail page keep working;
// `slots` is optional and, when given, lets the student change time without
// leaving the dialog.
//
// What changed in behaviour:
//  - There is now a confirmation screen (add to calendar, what happens next).
//    Before, the dialog just vanished and the student had to guess it worked.
//  - `onBooked` fires when the student dismisses that screen, so the parent
//    refreshes after they've seen it rather than yanking it away instantly.
//  - Cancellation terms are shown *before* paying.
//  - If payment succeeds but the seat is gone, the server refunds
//    automatically and the error here says so.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  IconLoader2 as Loader2,
  IconX as X,
  IconCircleCheck as CircleCheck,
  IconCalendarEvent as CalendarEvent,
  IconDownload as Download,
  IconClock as Clock,
  IconChevronDown as ChevronDown,
  IconLock as Lock,
} from "@tabler/icons-react";
import { createRazorpayOrder, verifyRazorpayPayment, claimFreeItem } from "@/server-functions/payments";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";
import {
  SESSION_FREE_CANCEL_HOURS,
  buildIcs,
  downloadIcs,
  formatDateLong,
  formatTimeRange,
  googleCalendarUrl,
  slotEnd,
  slotStart,
} from "@/lib/session-time";
import { SITE_URL } from "@/lib/seo";
import { FormatBadge, MentorAvatar, SessionCover, formatLabel, priceLabel, seatsNote } from "@/components/sessions/session-ui";
import { SlotPicker } from "@/components/sessions/slot-picker";

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment gateway. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

export function BookingDialog({
  offering,
  slot,
  slots,
  getToken,
  onClose,
  onBooked,
}: {
  offering: PublicMentorOffering;
  slot: OpenSlot;
  slots?: OpenSlot[];
  getToken: () => Promise<string>;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [current, setCurrent] = useState<OpenSlot>(slot);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const canChange = (slots?.length ?? 0) > 1;
  const seats = seatsNote(offering, current);
  const start = useMemo(() => slotStart(current.date, current.startTime), [current]);
  const end = useMemo(() => slotEnd(current.date, current.startTime, current.durationMinutes), [current]);

  function finish() {
    if (booked) onBooked();
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booked, submitting]);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();

      if (offering.isFree) {
        await claimFreeItem({
          data: { token, itemType: "mentorSession", itemId: offering.id, sessionDate: current.date, sessionStartTime: current.startTime, studentNote: note },
        });
        setBooked(true);
        setSubmitting(false);
        return;
      }

      const order = await createRazorpayOrder({
        data: { token, itemType: "mentorSession", itemId: offering.id, sessionDate: current.date, sessionStartTime: current.startTime },
      });

      await loadRazorpayScript();
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: offering.title,
        handler: async (response: any) => {
          try {
            await verifyRazorpayPayment({
              data: {
                token,
                itemType: "mentorSession",
                itemId: offering.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                studentNote: note,
              },
            });
            setBooked(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Payment went through but we couldn't confirm the booking. Contact support with your payment ID.");
          } finally {
            setSubmitting(false);
          }
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book this session.");
      setSubmitting(false);
    }
  }

  const calTitle = `${offering.title} with ${offering.mentorName}`;
  const calDetails = `Edurack mentor session. Find your meeting link in My Sessions: ${SITE_URL}/my-sessions`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={() => !submitting && finish()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={booked ? "Booking confirmed" : "Confirm booking"}
        className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {booked ? (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CircleCheck className="h-7 w-7" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">You're booked</h3>
            <p className="mt-1 text-sm text-muted-foreground">A confirmation is on its way to your email.</p>

            <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-left">
              <p className="font-display text-base font-bold leading-snug">{offering.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">with {offering.mentorName}</p>
              <p className="mt-3 text-sm font-bold">{formatDateLong(current.date)}</p>
              <p className="text-sm text-muted-foreground">
                {formatTimeRange(current.startTime, current.durationMinutes)} IST · {current.durationMinutes} min
              </p>
              <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                Your mentor adds the meeting link before the session. You'll find it in <strong className="text-foreground">My Sessions</strong> and get a reminder email shortly before it starts.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={googleCalendarUrl({ title: calTitle, details: calDetails, start, end })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-sm font-bold hover:border-foreground/40"
              >
                <CalendarEvent className="h-4 w-4" />
                Google Calendar
              </a>
              <button
                type="button"
                onClick={() => downloadIcs(`edurack-session-${current.date}`, buildIcs({ uid: `${offering.id}-${current.date}-${current.startTime}`, title: calTitle, description: calDetails, start, end }))}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-sm font-bold hover:border-foreground/40"
              >
                <Download className="h-4 w-4" />
                Apple / Outlook
              </button>
            </div>

            <Link to="/my-sessions" className="clay-btn mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-bold">
              View in My Sessions
            </Link>
            <button type="button" onClick={finish} className="mt-2 min-h-11 w-full text-sm font-semibold text-muted-foreground hover:text-foreground">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold tracking-tight">Confirm your session</h3>
              <button type="button" onClick={finish} disabled={submitting} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex gap-3 p-3">
                <SessionCover offering={offering} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <p className="font-display text-base font-bold leading-snug">{offering.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <MentorAvatar name={offering.mentorName} photoUrl={offering.mentorPhotoUrl} size={18} />
                    <span className="truncate text-xs text-muted-foreground">{offering.mentorName}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{formatDateLong(current.date)}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTimeRange(current.startTime, current.durationMinutes)} IST · {current.durationMinutes} min
                    </p>
                  </div>
                  <FormatBadge offering={offering} className="border border-border" />
                </div>
                {seats && <p className={`mt-2 text-xs font-semibold ${seats.urgent ? "text-amber-700" : "text-muted-foreground"}`}>{seats.text}</p>}
                {canChange && (
                  <button type="button" onClick={() => setChanging((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                    {changing ? "Hide times" : "Change time"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${changing ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
              {changing && canChange && (
                <div className="border-t border-border bg-background px-3 py-3">
                  <SlotPicker
                    slots={slots as OpenSlot[]}
                    selected={current}
                    showSeats
                    compact
                    onSelect={(s) => {
                      setCurrent(s);
                      setChanging(false);
                    }}
                  />
                </div>
              )}
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">What would you like to cover? (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. my strategy for the last 60 days, a chapter I keep getting wrong…"
                className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </label>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
              <span className="text-sm text-muted-foreground">{formatLabel(offering)} session</span>
              <span className="font-display text-lg font-extrabold">{priceLabel(offering)}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {offering.isFree
                ? "Free to book, and free to cancel any time before it starts."
                : `Cancel at least ${SESSION_FREE_CANCEL_HOURS} hours ahead for a full automatic refund. If the mentor cancels, you're always refunded in full.`}{" "}
              <Link to="/legal/refund" className="font-semibold underline">
                Refund policy
              </Link>
            </p>

            {error && (
              <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-medium leading-relaxed text-rose-800">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="clay-btn mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-bold disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : !offering.isFree && <Lock className="h-3.5 w-3.5" />}
              {offering.isFree ? "Confirm free booking" : `Pay ${priceLabel(offering)} & confirm`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
