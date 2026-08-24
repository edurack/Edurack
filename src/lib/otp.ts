// SERVER-ONLY.
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";

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

function otpEmailHtml(params: { code: string; purposeLabel: string; expiryMinutes: number }): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 4px;">Edurack</h2>
      <p>Use the code below to ${params.purposeLabel}:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">
        ${params.code}
      </p>
      <p style="color: #555; font-size: 14px;">
        This code expires in ${params.expiryMinutes} minutes. If you didn't request this, you can safely
        ignore this email.
      </p>
    </div>
  `;
}

// Sends the OTP via AWS SES (nodemailer's SES transport, see src/lib/mailer.ts).
// Replaces the old EmailJS REST call. Same signature and behavior as before,
// so callers (email-verification.ts, password-reset.ts) don't need to change
// how they call this — only how they handle it throwing (see MailSendError
// in mailer.ts, and the try/catch in each caller).
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