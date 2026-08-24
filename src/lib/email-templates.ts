// src/lib/email-templates.ts
// SERVER-ONLY. HTML builders for transactional/announcement emails sent via
// AWS SES (see src/lib/mailer.ts). Kept separate from otp.ts's template so
// verification-code logic doesn't accumulate unrelated email markup.

function emailShell(bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 4px;">Edurack</h2>
      ${bodyHtml}
    </div>
  `;
}

// Combined "congratulations + payment successful" email — sent once per
// purchase, right after a Razorpay payment is verified.
export function purchaseConfirmationEmailHtml(params: {
  itemTitle: string;
  itemType: "bundle" | "mentorship";
  amount: number;
}): string {
  const itemLabel = params.itemType === "bundle" ? "Test Series" : "Mentorship Batch";
  return emailShell(`
    <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">🎉 You're in!</p>
    <p>Congratulations — your payment for <strong>${params.itemTitle}</strong> (${itemLabel}) was successful.</p>
    <table style="margin: 16px 0; border-collapse: collapse;">
      <tr><td style="padding: 4px 12px 4px 0; color: #555;">Item</td><td>${params.itemTitle}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #555;">Amount paid</td><td>₹${params.amount.toLocaleString("en-IN")}</td></tr>
    </table>
    <p>You can access it right away from your dashboard. Good luck — we're rooting for you.</p>
  `);
}

// Announcement tied to a specific test-series bundle — sent to that
// bundle's purchasers only.
export function bundleAnnouncementEmailHtml(params: { bundleTitle: string; message: string }): string {
  return emailShell(`
    <p style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">📢 Update: ${params.bundleTitle}</p>
    <p style="white-space: pre-wrap;">${params.message}</p>
  `);
}

// Platform-wide announcement — sent to every student matching the chosen
// track (All / Dropper / 11th / 12th). Can reach a large audience; see the
// caveat on sendMailBatch in mailer.ts before enabling this broadly.
export function platformAnnouncementEmailHtml(params: { message: string }): string {
  return emailShell(`
    <p style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">📢 Edurack Announcement</p>
    <p style="white-space: pre-wrap;">${params.message}</p>
  `);
}

// Sent to an applicant (not yet a platform user — this comes from their
// application's own personal.email, not a Firebase account) once an admin
// approves their mentor application. onboardingUrl is null when APP_URL
// isn't configured — the email still sends, just without the link.
export function mentorApprovedEmailHtml(params: { fullName: string; onboardingUrl: string | null }): string {
  return emailShell(`
    <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">🎉 You're approved!</p>
    <p>Hi ${params.fullName}, your mentor application has been approved.</p>
    ${
      params.onboardingUrl
        ? `<p>Next step — complete your mentor onboarding here:</p>
           <p><a href="${params.onboardingUrl}" style="color: #2563eb;">${params.onboardingUrl}</a></p>`
        : `<p>Our team will follow up shortly with the next steps to complete your onboarding.</p>`
    }
  `);
}

// Sent to an applicant when an admin rejects their mentor application.
export function mentorRejectedEmailHtml(params: { fullName: string; reason: string }): string {
  return emailShell(`
    <p style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">Application update</p>
    <p>Hi ${params.fullName}, thanks for applying to mentor with Edurack.</p>
    <p>After review, we're not able to move forward with your application at this time.</p>
    <p style="color: #555;"><strong>Reason:</strong> ${params.reason}</p>
    <p>You're welcome to apply again in the future.</p>
  `);
}