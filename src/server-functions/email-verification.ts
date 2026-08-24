import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/otp";
import { MailSendError } from "@/lib/mailer";

const OTP_TTL_MS = 10 * 60 * 1000;          // code valid for 10 min
const MAX_OTP_ATTEMPTS = 5;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;

// Relaxed in development so you're not fighting the rate limiter while
// testing locally — still strict (3 per 15 min) in production.
const MAX_REQUESTS_PER_WINDOW = process.env.NODE_ENV === "development" ? 100 : 3;

function getClientIp(): string {
  const request = getRequest();
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown"
  );
}

// STEP 1 — send (or resend) a code to the SIGNED-IN user's own email.
// Requires a valid Firebase ID token, so unlike password reset, there's no
// enumeration risk here — only the account owner can trigger a send.
export const sendEmailVerificationOtp = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    try {
      const decoded = await adminAuth.verifyIdToken(data.token);

      if (decoded.email_verified) {
        console.log(`[sendEmailVerificationOtp] uid=${decoded.uid} already verified, skipping`);
        return { ok: true, alreadyVerified: true };
      }

      const email = (decoded.email ?? "").toLowerCase();
      if (!email) {
        return { ok: false, error: "No email on this account." };
      }

      const ip = getClientIp();
      const db = await getDb();
      const now = new Date();

      const windowStart = new Date(now.getTime() - REQUEST_WINDOW_MS);
      const recentCount = await db.collection("otp_codes").countDocuments({
        purpose: "email-verify",
        createdAt: { $gte: windowStart },
        $or: [{ uid: decoded.uid }, { ip }],
      });
      if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
        console.warn(`[sendEmailVerificationOtp] rate limited: uid=${decoded.uid} ip=${ip}`);
        return { ok: true };
      }

      const code = generateOtp();

      await db.collection("otp_codes").insertOne({
        uid: decoded.uid,
        email,
        purpose: "email-verify",
        hashedCode: hashOtp(email, code),
        attempts: 0,
        consumed: false,
        ip,
        createdAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      });

      console.log(`[sendEmailVerificationOtp] OTP stored for uid=${decoded.uid}, sending email...`);

      try {
        await sendOtpEmail({
          toEmail: email,
          code,
          purposeLabel: "verify your email",
          expiryMinutes: OTP_TTL_MS / 60000,
        });
      } catch (mailErr) {
        // The OTP record is already saved, so the code itself is still
        // valid if the user gets it another way — but the send failed, so
        // tell the client plainly rather than pretending it worked.
        if (mailErr instanceof MailSendError) {
          console.error(`[sendEmailVerificationOtp] SES send failed for uid=${decoded.uid}:`, mailErr.cause);
          return { ok: false, error: "Couldn't send the verification email. Please try again in a moment." };
        }
        throw mailErr;
      }

      console.log(`[sendEmailVerificationOtp] email sent successfully to ${email}`);
      return { ok: true };
    } catch (err) {
      console.error("[sendEmailVerificationOtp] FAILED:", err);
      throw err;
    }
  });

// STEP 2 — verify the code. On success, flips Firebase's own emailVerified
// flag, which is the single source of truth checked everywhere else in the app.
export const verifyEmailVerificationOtp = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string }) => data)
  .handler(async ({ data }) => {
    try {
      const decoded = await adminAuth.verifyIdToken(data.token);
      const email = (decoded.email ?? "").toLowerCase();
      const code = data.code.trim();
      const db = await getDb();
      const now = new Date();

      const record = await db
        .collection("otp_codes")
        .findOne(
          { uid: decoded.uid, purpose: "email-verify", consumed: false },
          { sort: { createdAt: -1 } },
        );

      if (!record || record.expiresAt < now) {
        console.log(`[verifyEmailVerificationOtp] no valid record for uid=${decoded.uid}`);
        return { ok: false, error: "This code has expired. Request a new one." };
      }

      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        console.log(`[verifyEmailVerificationOtp] max attempts reached for uid=${decoded.uid}`);
        return { ok: false, error: "Too many incorrect attempts. Request a new code." };
      }

      if (record.hashedCode !== hashOtp(email, code)) {
        await db.collection("otp_codes").updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        console.log(`[verifyEmailVerificationOtp] incorrect code for uid=${decoded.uid}, attempt ${record.attempts + 1}`);
        return { ok: false, error: "Incorrect code. Please try again." };
      }

      // Correct code — mark the Firebase account as verified and clean up.
      await adminAuth.updateUser(decoded.uid, { emailVerified: true });

      await db.collection("otp_codes").deleteOne({ _id: record._id });

      await db.collection("profiles").updateOne(
        { uid: decoded.uid },
        { $set: { emailVerified: true, updatedAt: now } },
      );

      console.log(`[verifyEmailVerificationOtp] verified OK for uid=${decoded.uid}`);
      return { ok: true };
    } catch (err) {
      console.error("[verifyEmailVerificationOtp] FAILED:", err);
      throw err;
    }
  });