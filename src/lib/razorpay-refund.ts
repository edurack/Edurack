// SERVER-ONLY. Refunds a captured Razorpay payment. Used when (a) a student
// cancels a paid session in time, (b) a mentor cancels a session, and (c) a
// payment was captured but the seat was gone by the time we tried to book it
// — previously that left the student charged with no booking.
//
// Refunds whatever is still refundable on the payment (amount minus anything
// already refunded) rather than the offering's list price, so a discounted
// payment never asks Razorpay for more than was charged, and calling this
// twice for the same payment is harmless.
export async function refundRazorpayPayment(
  paymentId: string,
  notes: Record<string, string> = {},
): Promise<{ refunded: boolean; amountPaise: number; refundId: string | null }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Server misconfigured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");

  const { default: Razorpay } = await import("razorpay");
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const payment: any = await razorpay.payments.fetch(paymentId);
  const refundable = Number(payment.amount) - Number(payment.amount_refunded ?? 0);
  if (refundable <= 0) return { refunded: false, amountPaise: 0, refundId: null };

  const refund: any = await razorpay.payments.refund(paymentId, { amount: refundable, speed: "normal", notes });
  return { refunded: true, amountPaise: refundable, refundId: refund?.id ?? null };
}
