// src/lib/otp.ts
// SERVER-ONLY.
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { otpEmailHtml } from "@/lib/email-templates";

const OTP_PEPPER = process.env.OTP_PEPPER;
if (!OTP_PEPPER) throw new Error("OTP_PEPPER is not set");

// Cryptographically secure 6-digit code (not Math.random — that's predictable).
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// We never store the OTP in plaintext — only this HMAC digest, keyed with a
// server-only secret (the "pepper"). Even a full DB leak doesn't expose codes.
export function hashOtp(email: string, code: string): string {
  return crypto.createHmac("sha256", OTP_PEPPER!).update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHmac("sha256", OTP_PEPPER!).update(token).digest("hex");
}

// Sends the OTP via Resend (see src/lib/mailer.ts), using the shared
// branded template (src/lib/email-templates.ts) so this looks consistent
// with every other email the app sends.
export async function sendOtpEmail(params: {
  toEmail: string;
  code: string;
  purposeLabel: string;
  expiryMinutes: number;
}) {
  console.log(`[sendOtpEmail] sending to=${params.toEmail} purpose="${params.purposeLabel}"`);

  await sendMail({
    to: params.toEmail,
    subject: `Your Edurack code: ${params.code}`,
    html: otpEmailHtml(params),
  });

  console.log(`[sendOtpEmail] email sent successfully to ${params.toEmail}`);
}
