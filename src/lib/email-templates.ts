// src/lib/email-templates.ts
// SERVER-ONLY. HTML builders for every outbound email sent via AWS SES (see
// src/lib/mailer.ts). Everything shares emailLayout() below so all emails —
// OTP, purchase confirmations, announcements, mentor decisions — look like
// they came from the same product instead of six different one-off designs.
//
// Table-based markup on purpose, not divs: Outlook (desktop) renders email
// HTML with Word's engine, which ignores most CSS layout properties but
// respects table structure. Divs + flexbox look fine in Gmail/Apple Mail
// and break in Outlook. Inline styles only, for the same reason — email
// clients strip <style> blocks unpredictably.

const BRAND = {
  name: "Edurack",
  color: "#4F46E5", // swap for your real brand color — this is a placeholder
  colorDark: "#3730A3",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#1F2330",
  muted: "#6B7280",
  border: "#E5E7EB",
};

// Bulletproof CTA button — table-based so it renders as a real clickable
// button in Outlook too, not just a styled <a> tag (which Outlook's Word
// engine frequently mangles).
export function emailButton(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="border-radius: 8px; background-color: ${BRAND.color};">
          <a href="${url}"
             style="display: inline-block; padding: 12px 28px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

// Shared wrapper: header with wordmark, white card body, muted footer.
// previewText is the snippet inbox lists show next to the subject line
// (Gmail/Outlook/Apple Mail all support this) — hidden in the rendered
// email itself.
export function emailLayout(params: { previewText: string; bodyHtml: string }): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${BRAND.bg}; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      ${params.previewText}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.bg}; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

            <!-- Header -->
            <tr>
              <td style="padding: 0 8px 20px 8px;">
                <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: ${BRAND.colorDark};">
                  ${BRAND.name}
                </span>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background-color: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 32px;">
                ${params.bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 8px 0 8px;" align="center">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${BRAND.muted};">
                  © ${year} ${BRAND.name}. You're receiving this because of activity on your ${BRAND.name} account.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── OTP (email verification / password reset) ──────────────────────────
// Kept here alongside every other template rather than in otp.ts, so the
// visual language stays in one place. otp.ts imports this function.
export function otpEmailHtml(params: { code: string; purposeLabel: string; expiryMinutes: number }): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Verification code
    </p>
    <h1 style="margin: 0 0 16px 0; font-size: 22px; line-height: 30px; color: ${BRAND.text};">
      Use this code to ${params.purposeLabel}
    </h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px 0;">
      <tr>
        <td style="background-color: ${BRAND.bg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 18px 28px;">
          <span style="font-family: 'SF Mono', Consolas, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: ${BRAND.text};">
            ${params.code}
          </span>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
      This code expires in ${params.expiryMinutes} minutes. If you didn't request this, you can safely ignore this email.
    </p>
  `;
  return emailLayout({ previewText: `Your ${BRAND.name} code: ${params.code}`, bodyHtml: body });
}

// ─── Purchase confirmation (combined congrats + payment successful) ─────
export function purchaseConfirmationEmailHtml(params: {
  itemTitle: string;
  itemType: "bundle" | "mentorship";
  amount: number;
}): string {
  const itemLabel = params.itemType === "bundle" ? "Test Series" : "Mentorship Batch";
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Payment successful
    </p>
    <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 30px; color: ${BRAND.text};">
      🎉 You're in — welcome to ${params.itemTitle}
    </h1>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your payment went through and you now have full access. Here's your receipt:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 10px; overflow: hidden;">
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.muted};">Item</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.text}; text-align: right;">${params.itemTitle}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.muted};">Type</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.text}; text-align: right;">${itemLabel}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-size: 14px; color: ${BRAND.muted};">Amount paid</td>
        <td style="padding: 14px 18px; font-size: 15px; font-weight: 700; color: ${BRAND.text}; text-align: right;">₹${params.amount.toLocaleString("en-IN")}</td>
      </tr>
    </table>
    <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
      Head to your dashboard to get started. Good luck — we're rooting for you.
    </p>
  `;
  return emailLayout({ previewText: `Payment confirmed for ${params.itemTitle}`, bodyHtml: body });
}

// ─── Bundle announcement (to purchasers of one specific bundle) ─────────
export function bundleAnnouncementEmailHtml(params: { bundleTitle: string; message: string }): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Update · ${params.bundleTitle}
    </p>
    <h1 style="margin: 0 0 16px 0; font-size: 20px; line-height: 28px; color: ${BRAND.text};">
      📢 New update on your test series
    </h1>
    <p style="margin: 0; font-size: 15px; line-height: 24px; color: ${BRAND.text}; white-space: pre-wrap;">${params.message}</p>
  `;
  return emailLayout({ previewText: `Update on ${params.bundleTitle}`, bodyHtml: body });
}

// ─── Platform-wide announcement (opt-in, sent to a track) ────────────────
export function platformAnnouncementEmailHtml(params: { message: string }): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Announcement
    </p>
    <h1 style="margin: 0 0 16px 0; font-size: 20px; line-height: 28px; color: ${BRAND.text};">
      📢 ${BRAND.name} Update
    </h1>
    <p style="margin: 0; font-size: 15px; line-height: 24px; color: ${BRAND.text}; white-space: pre-wrap;">${params.message}</p>
  `;
  return emailLayout({ previewText: "New announcement from Edurack", bodyHtml: body });
}

// ─── Mentor application: approved ─────────────────────────────────────────
export function mentorApprovedEmailHtml(params: { fullName: string; onboardingUrl: string | null }): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Application approved
    </p>
    <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 30px; color: ${BRAND.text};">
      🎉 Welcome aboard, ${params.fullName}
    </h1>
    <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your mentor application has been approved — we're excited to have you.
    </p>
    ${
      params.onboardingUrl
        ? `<p style="margin: 0 0 4px 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
             One last step — complete your mentor onboarding to get set up:
           </p>
           ${emailButton(params.onboardingUrl, "Complete onboarding")}`
        : `<p style="margin: 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
             Our team will follow up shortly with the next steps to complete your onboarding.
           </p>`
    }
  `;
  return emailLayout({ previewText: "Your mentor application has been approved", bodyHtml: body });
}

// ─── Mentor application: rejected ─────────────────────────────────────────
export function mentorRejectedEmailHtml(params: { fullName: string; reason: string }): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.muted};">
      Application update
    </p>
    <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 30px; color: ${BRAND.text};">
      Hi ${params.fullName}
    </h1>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Thanks for applying to mentor with ${BRAND.name}. After review, we're not able to move forward with your application at this time.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 10px; margin-bottom: 16px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: ${BRAND.muted};">Reason</p>
          <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${BRAND.text};">${params.reason}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      You're welcome to apply again in the future.
    </p>
  `;
  return emailLayout({ previewText: "An update on your mentor application", bodyHtml: body });
}

// ─── Mentor password reset (admin-triggered) ──────────────────────────────
export function mentorPasswordResetEmailHtml(params: {
  fullName: string;
  username: string;
  newPassword: string;
}): string {
  const body = `
    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.color};">
      Password reset
    </p>
    <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 30px; color: ${BRAND.text};">
      Hi ${params.fullName}, here's your new password
    </h1>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      An Edurack admin reset your mentor portal password. Use these to sign in, then change it once you're in.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 10px; overflow: hidden;">
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.muted};">Username</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; color: ${BRAND.text}; text-align: right; font-family: monospace;">${params.username}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-size: 14px; color: ${BRAND.muted};">New password</td>
        <td style="padding: 14px 18px; font-size: 15px; font-weight: 700; color: ${BRAND.text}; text-align: right; font-family: monospace;">${params.newPassword}</td>
      </tr>
    </table>
  `;
  return emailLayout({ previewText: "Your Edurack mentor password has been reset", bodyHtml: body });
}