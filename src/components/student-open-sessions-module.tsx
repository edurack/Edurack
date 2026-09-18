import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconLoader2 as Loader2, IconClock as Clock, IconX as X, IconUsers as Users } from "@tabler/icons-react";
import { listOpenMentorSessions } from "@/server-functions/student-sessions";
import { createRazorpayOrder, verifyRazorpayPayment, claimFreeItem } from "@/server-functions/payments";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type PriceFilter = "all" | "free" | "paid";

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load payment gateway."));
    document.body.appendChild(script);
  });
}

export function StudentOpenSessionsModule({ getToken, subjectFilter }: { getToken: () => Promise<string>; subjectFilter?: string }) {
  const [offerings, setOfferings] = useState<PublicMentorOffering[] | null>(null);
  const [slotsByOffering, setSlotsByOffering] = useState<Record<string, OpenSlot[]>>({});
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [query, setQuery] = useState(subjectFilter ?? "");
  const [booking, setBooking] = useState<{ offering: PublicMentorOffering; slot: OpenSlot } | null>(null);

  async function load() {
    const token = await getToken();
    const { offerings: rows, slotsByOffering: slots } = await listOpenMentorSessions({ data: { token } });
    setOfferings(rows as PublicMentorOffering[]);
    setSlotsByOffering(slots as Record<string, OpenSlot[]>);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!offerings) return [];
    const q = query.trim().toLowerCase();
    return offerings.filter((o) => {
      if (priceFilter === "free" && !o.isFree) return false;
      if (priceFilter === "paid" && o.isFree) return false;
      if ((slotsByOffering[o.id] ?? []).length === 0) return false;
      if (q && !`${o.title} ${o.mentorName} ${o.description} ${o.subject ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [offerings, priceFilter, query, slotsByOffering]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mentors, topics, or subjects…"
          className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none sm:max-w-xs"
        />
        <div className="flex gap-1.5">
          {(["all", "free", "paid"] as PriceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setPriceFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${priceFilter === f ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
            >
              {f === "all" ? "All" : f === "free" ? "Free" : "Paid"}
            </button>
          ))}
        </div>
      </div>

      {offerings === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="clay p-8 text-center text-sm text-foreground/60">No open sessions match right now — check back soon.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filtered.map((o) => (
            <OfferingCard key={o.id} offering={o} slots={slotsByOffering[o.id] ?? []} onPick={(slot) => setBooking({ offering: o, slot })} />
          ))}
        </div>
      )}

      {booking && (
        <BookingDialog
          offering={booking.offering}
          slot={booking.slot}
          getToken={getToken}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function OfferingCard({ offering, slots, onPick }: { offering: PublicMentorOffering; slots: OpenSlot[]; onPick: (slot: OpenSlot) => void }) {
  const preview = slots.slice(0, 4);
  const isGroup = offering.capacity > 1;
  return (
    <div className="clay flex flex-col overflow-hidden p-3">
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl bg-[var(--pink-soft,#FCE7F3)]">
        {offering.thumbnailUrl ? (
          <img src={offering.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Clock className="h-9 w-9 text-[var(--pink-deep,#BE185D)] opacity-50" strokeWidth={1.5} />
        )}
        {isGroup && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-foreground/70 shadow-sm">
            <Users className="h-3 w-3" />
            Group
          </span>
        )}
      </div>
      <div className="p-3 pt-4">
        <div className="mb-1 flex items-center gap-2">
          {offering.mentorPhotoUrl && <img src={offering.mentorPhotoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />}
          <p className="truncate text-xs font-semibold text-foreground/60">{offering.mentorName}</p>
          {offering.subject && (
            <span className="shrink-0 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--sky-deep)]">{offering.subject}</span>
          )}
        </div>
        <Link to="/mentor-session/$offeringId" params={{ offeringId: offering.id }} className="block font-display text-base font-bold text-foreground hover:underline">
          {offering.title}
        </Link>
        <p className="mt-1 text-sm font-bold text-foreground">{offering.isFree ? "Free" : currency.format(offering.price)}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {preview.map((s) => (
            <button
              key={`${s.date}-${s.startTime}`}
              onClick={() => onPick(s)}
              className="clay-chip flex flex-col items-start rounded-2xl px-3 py-1.5 text-[11px] font-semibold text-foreground/70 transition-colors hover:bg-foreground/5"
            >
              <span>
                {new Date(s.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {s.startTime}
              </span>
              {isGroup && <span className="text-[10px] font-normal text-foreground/40">{s.seatsRemaining} seats left</span>}
            </button>
          ))}
          {slots.length > preview.length && <span className="self-center text-[11px] text-foreground/40">+{slots.length - preview.length} more</span>}
        </div>
      </div>
    </div>
  );
}

// Exported so other pages (the dashboard's free-sessions banner, the
// future premium session detail page) can open the exact same booking
// flow without duplicating the Razorpay/claimFreeItem logic.
export function BookingDialog({
  offering,
  slot,
  getToken,
  onClose,
  onBooked,
}: {
  offering: PublicMentorOffering;
  slot: OpenSlot;
  getToken: () => Promise<string>;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();

      if (offering.isFree) {
        await claimFreeItem({
          data: { token, itemType: "mentorSession", itemId: offering.id, sessionDate: slot.date, sessionStartTime: slot.startTime, studentNote: note },
        });
        onBooked();
        return;
      }

      const order = await createRazorpayOrder({
        data: { token, itemType: "mentorSession", itemId: offering.id, sessionDate: slot.date, sessionStartTime: slot.startTime },
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
            onBooked();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Payment succeeded but booking failed — contact support with your payment ID.");
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      rzp.open();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book this session.");
      setSubmitting(false);
    }
  }

  const isGroup = offering.capacity > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="clay w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">Confirm booking</h3>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="clay-inset mb-4 rounded-2xl p-4">
          <p className="font-semibold text-foreground">{offering.title}</p>
          <p className="text-sm text-foreground/60">with {offering.mentorName}</p>
          <p className="mt-1 text-sm text-foreground/60">
            {new Date(slot.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} · {slot.startTime} · {slot.durationMinutes} min
          </p>
          {isGroup && (
            <p className="mt-1 flex items-center gap-1 text-xs text-foreground/50">
              <Users className="h-3.5 w-3.5" />
              Group session — {slot.seatsRemaining} of {slot.capacity} seats left
            </p>
          )}
          <p className="mt-2 font-bold text-foreground">{offering.isFree ? "Free" : currency.format(offering.price)}</p>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What would you like to discuss? (optional)"
          rows={2}
          className="clay-inset mb-3 w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
        />
        {error && <p className="mb-2 text-xs font-medium text-rose-600">{error}</p>}
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="clay-btn inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {offering.isFree ? "Confirm booking" : "Pay & confirm"}
        </button>
      </div>
    </div>
  );
}