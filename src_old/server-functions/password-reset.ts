import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { generateOtp, hashOtp, generateResetToken, hashToken, sendOtpEmail } from "@/lib/otp";

const OTP_TTL_MS = 10 * 60 * 1000;          // code valid for 10 min
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;  // "verified" window to actually set a password
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

// STEP 1 — request a code.
// Always returns { ok: true } regardless of whether the email exists, is
// rate-limited, or trips the honeypot — so this endpoint can never be used
// to enumerate which emails have accounts, or to fingerprint rate limits.
export const requestPasswordResetOtp = createServerFn({ method: "POST" })
  .validator((data: { email: string; hp: string }) => data)
  .handler(async ({ data }) => {
    try {
      // Honeypot: a real user never fills this hidden field. Bots that fill
      // every field in a form will — so we silently no-op.
      if (data.hp) return { ok: true };

      const email = data.email.trim().toLowerCase();
      const ip = getClientIp();
      const db = await getDb();
      const now = new Date();

      const windowStart = new Date(now.getTime() - REQUEST_WINDOW_MS);
      const recentCount = await db.collection("otp_codes").countDocuments({
        purpose: "password-reset",
        createdAt: { $gte: windowStart },
        $or: [{ email }, { ip }],
      });
      if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
        console.warn(`[requestPasswordResetOtp] rate limited: email=${email} ip=${ip}`);
        return { ok: true };
      }

      const user = await adminAuth.getUserByEmail(email).catch((err) => {
        console.log(`[requestPasswordResetOtp] getUserByEmail miss for ${email}:`, err.code ?? err.message);
        return null;
      });

      if (user) {
        const code = generateOtp();

        await db.collection("otp_codes").insertOne({
          email,
          purpose: "password-reset",
          hashedCode: hashOtp(email, code),
          attempts: 0,
          consumed: false,
          ip,
          createdAt: now,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        });

        console.log(`[requestPasswordResetOtp] OTP stored for ${email}, sending email...`);

        await sendOtpEmail({
          toEmail: email,
          code,
          purposeLabel: "reset your password",
          expiryMinutes: OTP_TTL_MS / 60000,
        });

        console.log(`[requestPasswordResetOtp] email sent successfully to ${email}`);
      } else {
        console.log(`[requestPasswordResetOtp] no Firebase user for ${email} — silently skipping send`);
      }

      return { ok: true };
    } catch (err) {
      // Logged with full detail server-side; the client still only ever
      // sees the generic message via the catch in the UI component.
      console.error("[requestPasswordResetOtp] FAILED:", err);
      throw err;
    }
  });

// STEP 2 — verify the code. On success, issues a short-lived, single-use
// reset token. The client never sees the hash or anything else about the OTP.
export const verifyPasswordResetOtp = createServerFn({ method: "POST" })
  .validator((data: { email: string; code: string }) => data)
  .handler(async ({ data }) => {
    try {
      const email = data.email.trim().toLowerCase();
      const code = data.code.trim();
      const db = await getDb();
      const now = new Date();

      const record = await db
        .collection("otp_codes")
        .findOne({ email, purpose: "password-reset", consumed: false }, { sort: { createdAt: -1 } });

      if (!record || record.expiresAt < now) {
        console.log(`[verifyPasswordResetOtp] no valid record for ${email}`);
        return { ok: false, error: "This code has expired. Request a new one." };
      }
      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        console.log(`[verifyPasswordResetOtp] max attempts reached for ${email}`);
        return { ok: false, error: "Too many incorrect attempts. Request a new code." };
      }

      if (record.hashedCode !== hashOtp(email, code)) {
        await db.collection("otp_codes").updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        console.log(`[verifyPasswordResetOtp] incorrect code for ${email}, attempt ${record.attempts + 1}`);
        return { ok: false, error: "Incorrect code. Please try again." };
      }

      const resetToken = generateResetToken();
      await db.collection("otp_codes").updateOne(
        { _id: record._id },
        {
          $set: {
            consumed: true,
            resetTokenHash: hashToken(resetToken),
            // Reuse expiresAt for the reset-token's own window — keeps the TTL
            // index (set up below) valid for cleanup either way.
            expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
          },
        },
      );

      console.log(`[verifyPasswordResetOtp] verified OK for ${email}`);
      return { ok: true, resetToken };
    } catch (err) {
      console.error("[verifyPasswordResetOtp] FAILED:", err);
      throw err;
    }
  });

// STEP 3 — actually change the password using the one-time reset token.
export const resetPasswordWithToken = createServerFn({ method: "POST" })
  .validator((data: { email: string; resetToken: string; newPassword: string }) => data)
  .handler(async ({ data }) => {
    try {
      const email = data.email.trim().toLowerCase();
      const db = await getDb();
      const now = new Date();

      if (data.newPassword.length < 8) {
        return { ok: false, error: "Password must be at least 8 characters." };
      }

      const record = await db.collection("otp_codes").findOne({
        email,
        purpose: "password-reset",
        consumed: true,
        resetTokenHash: hashToken(data.resetToken),
      });

      if (!record || record.expiresAt < now) {
        console.log(`[resetPasswordWithToken] no valid reset session for ${email}`);
        return { ok: false, error: "This reset session has expired. Please start over." };
      }

      const user = await adminAuth.getUserByEmail(email).catch((err) => {
        console.log(`[resetPasswordWithToken] getUserByEmail miss for ${email}:`, err.code ?? err.message);
        return null;
      });
      if (!user) return { ok: false, error: "Account not found." };

      await adminAuth.updateUser(user.uid, { password: data.newPassword });
      // Force every device (including whoever might already be logged in
      // elsewhere) to re-authenticate — critical after a password change.
      await adminAuth.revokeRefreshTokens(user.uid);
      await db.collection("sessions").deleteMany({ uid: user.uid });
      // Single-use: delete the record so this token can never be replayed.
      await db.collection("otp_codes").deleteOne({ _id: record._id });

      console.log(`[resetPasswordWithToken] password updated for ${email}`);
      return { ok: true };
    } catch (err) {
      console.error("[resetPasswordWithToken] FAILED:", err);
      throw err;
    }
  });