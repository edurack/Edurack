// src/lib/email-templates.ts
// SERVER-ONLY. HTML builders for every outbound email sent via Resend (see
// src/lib/mailer.ts). Everything shares emailLayout() below so all emails —
// OTP, purchase confirmations, announcements, mentor decisions — look like
// they came from the same product, styled to match the app's claymorphism
// theme (src/styles.css) as closely as email clients allow.
//
// IMPORTANT EMAIL-CSS CAVEATS (why this isn't just copy-pasted from styles.css):
// - Email clients don't support CSS custom properties (`var(--x)`) or
//   `oklch()` colors — every color below is a hardcoded hex, manually
//   converted from the oklch values in styles.css to match as closely as
//   possible.
// - Outlook desktop renders HTML with Word's engine: no `box-shadow`, no
//   `border-radius` on some elements, no CSS gradients on backgrounds. True
//   "clay" soft-shadow depth is impossible there — it'll render as a clean
//   flat card with a light border, which is the standard graceful fallback.
//   Gmail, Apple Mail, and most mobile mail apps DO render the soft
//   shadow/gradient touches below.
// - Table-based markup + inline styles only, for the same Outlook/Gmail
//   compatibility reasons as before.

const BRAND = {
  name: "Edurack",
  logoUrl: "https://i.postimg.cc/4NvD69v0/image-removebg-preview.png",

  // ── Hex approximations of styles.css's oklch() theme tokens ──────────
  // (light mode values — email clients don't support prefers-color-scheme
  // reliably enough to bother with a dark-mode email variant)
  bg: "#F5F7FB",           // --background
  card: "#FFFFFF",         // --card
  cardTint: "#EEF3FA",     // card → background gradient endpoint, for the "clay" card
  text: "#1F2333",         // --foreground
  muted: "#6B7280",        // --muted-foreground
  border: "#E4E9F1",       // --border

  primary: "#4F8FE0",      // --primary
  primaryDeep: "#3D6FC4",  // --sky-deep (used for clay-btn gradient + headings accent)
  skySoft: "#DCEAFB",      // --sky-soft (chips/badges)
  tealSoft: "#C9EEE8",     // --teal-soft
  mintSoft: "#CDF0DD",     // --mint-soft
  coralSoft: "#F8D9C6",    // --coral-soft
  lemonSoft: "#F7ECC4",    // --lemon-soft
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// Bricolage Grotesque / Plus Jakarta Sans (your app's fonts) aren't loadable
// reliably across email clients, so headings fall back to a clean system
// stack with slightly tighter letter-spacing to echo the display font's feel.

// Bulletproof CTA button — table-based so it renders as a real clickable
// button in Outlook too. Solid background-color is the safe base (Outlook
// requirement); the gradient is layered on top as a progressive enhancement
// for clients that honor it (Gmail, Apple Mail, etc.), echoing .clay-btn.
export function emailButton(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="
          border-radius: 999px;
          background-color: ${BRAND.primaryDeep};
          background-image: linear-gradient(145deg, ${BRAND.primary}, ${BRAND.primaryDeep});
        ">
          <a href="${url}"
             style="display: inline-block; padding: 13px 30px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 999px; letter-spacing: -0.01em;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

// Small pill/badge — echoes .clay-chip for eyebrow labels above headings.
function emailBadge(label: string, bg: string = BRAND.skySoft): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 14px 0;">
      <tr>
        <td style="background-color: ${bg}; border-radius: 999px; padding: 6px 14px;">
          <span style="font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${BRAND.text};">
            ${label}
          </span>
        </td>
      </tr>
    </table>
  `;
}

// Shared wrapper: logo header, clay-styled card body, muted footer.
// previewText is the snippet inbox lists show next to the subject line —
// hidden in the rendered email itself.
export function emailLayout(params: { previewText: string; bodyHtml: string }): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${BRAND.bg}; font-family: ${FONT_STACK};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      ${params.previewText}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.bg}; padding: 36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

            <!-- Logo header -->
            <tr>
              <td align="center" style="padding: 0 8px 24px 8px;">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="56" height="63"
                  style="display: block; height: 44px; width: auto; border: 0;" />
              </td>
            </tr>

            <!-- Card — layered background + soft border simulates the app's
                 "clay" card in clients that support it (Gmail, Apple Mail);
                 Outlook falls back to a flat white card with a light border. -->
            <tr>
              <td style="
                background-color: ${BRAND.card};
                background-image: linear-gradient(145deg, ${BRAND.card}, ${BRAND.cardTint});
                border: 1px solid ${BRAND.border};
                border-radius: 28px;
                padding: 36px 32px;
                box-shadow: 0 10px 30px rgba(30, 80, 140, 0.08);
              ">
                ${params.bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 22px 8px 0 8px;" align="center">
                <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${BRAND.muted};">
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
export function otpEmailHtml(params: { code: string; purposeLabel: string; expiryMinutes: number }): string {
  const body = `
    ${emailBadge("Verification code")}
    <h1 style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Use this code to ${params.purposeLabel}
    </h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px 0;">
      <tr>
        <td style="
          background-color: ${BRAND.bg};
          background-image: linear-gradient(145deg, ${BRAND.bg}, ${BRAND.cardTint});
          border: 1px solid ${BRAND.border};
          border-radius: 18px;
          padding: 20px 30px;
        ">
          <span style="font-family: 'SF Mono', Consolas, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: ${BRAND.text};">
            ${params.code}
          </span>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
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
    ${emailBadge("Payment successful", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      🎉 You're in — welcome to ${params.itemTitle}
    </h1>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your payment went through and you now have full access. Here's your receipt:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; overflow: hidden; background-color: ${BRAND.bg};">
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">Item</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.text}; text-align: right;">${params.itemTitle}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">Type</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.text}; text-align: right;">${itemLabel}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">Amount paid</td>
        <td style="padding: 14px 18px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 700; color: ${BRAND.text}; text-align: right;">₹${params.amount.toLocaleString("en-IN")}</td>
      </tr>
    </table>
    <p style="margin: 20px 0 0 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
      Head to your dashboard to get started. Good luck — we're rooting for you.
    </p>
  `;
  return emailLayout({ previewText: `Payment confirmed for ${params.itemTitle}`, bodyHtml: body });
}

// ─── Bundle announcement (to purchasers of one specific bundle) ─────────
export function bundleAnnouncementEmailHtml(params: { bundleTitle: string; message: string }): string {
  const body = `
    ${emailBadge(`Update · ${params.bundleTitle}`, BRAND.tealSoft)}
    <h1 style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 20px; line-height: 28px; letter-spacing: -0.02em; color: ${BRAND.text};">
      📢 New update on your test series
    </h1>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 24px; color: ${BRAND.text}; white-space: pre-wrap;">${params.message}</p>
  `;
  return emailLayout({ previewText: `Update on ${params.bundleTitle}`, bodyHtml: body });
}

// ─── Platform-wide announcement (opt-in, sent to a track) ────────────────
export function platformAnnouncementEmailHtml(params: { message: string }): string {
  const body = `
    ${emailBadge("Announcement", BRAND.lemonSoft)}
    <h1 style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 20px; line-height: 28px; letter-spacing: -0.02em; color: ${BRAND.text};">
      📢 ${BRAND.name} Update
    </h1>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 24px; color: ${BRAND.text}; white-space: pre-wrap;">${params.message}</p>
  `;
  return emailLayout({ previewText: "New announcement from Edurack", bodyHtml: body });
}

// ─── Mentor application: approved ─────────────────────────────────────────
export function mentorApprovedEmailHtml(params: { fullName: string; onboardingUrl: string | null }): string {
  const body = `
    ${emailBadge("Application approved", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      🎉 Welcome aboard, ${params.fullName}
    </h1>
    <p style="margin: 0 0 8px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your mentor application has been approved — we're excited to have you.
    </p>
    ${
      params.onboardingUrl
        ? `<p style="margin: 0 0 4px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
             One last step — complete your mentor onboarding to get set up:
           </p>
           ${emailButton(params.onboardingUrl, "Complete onboarding")}`
        : `<p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
             Our team will follow up shortly with the next steps to complete your onboarding.
           </p>`
    }
  `;
  return emailLayout({ previewText: "Your mentor application has been approved", bodyHtml: body });
}

// ─── Mentor application: rejected ─────────────────────────────────────────
export function mentorRejectedEmailHtml(params: { fullName: string; reason: string }): string {
  const body = `
    ${emailBadge("Application update", BRAND.coralSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Hi ${params.fullName}
    </h1>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Thanks for applying to mentor with ${BRAND.name}. After review, we're not able to move forward with your application at this time.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; margin-bottom: 16px; background-color: ${BRAND.bg};">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin: 0 0 4px 0; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.muted};">Reason</p>
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.text};">${params.reason}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
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
    ${emailBadge("Password reset")}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Hi ${params.fullName}, here's your new password
    </h1>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      An Edurack admin reset your mentor portal password. Use these to sign in, then change it once you're in.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; overflow: hidden; background-color: ${BRAND.bg};">
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">Username</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: monospace; font-size: 14px; color: ${BRAND.text}; text-align: right;">${params.username}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">New password</td>
        <td style="padding: 14px 18px; font-family: monospace; font-size: 15px; font-weight: 700; color: ${BRAND.text}; text-align: right;">${params.newPassword}</td>
      </tr>
    </table>
  `;
  return emailLayout({ previewText: "Your Edurack mentor password has been reset", bodyHtml: body });
}