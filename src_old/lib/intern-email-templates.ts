// src/lib/intern-email-templates.ts
// SERVER-ONLY. Email builders for the Intern Program — invite, sample
// task (trial), and task-assignment notifications. Deliberately a
// separate file from email-templates.ts rather than appended into it:
// BRAND / FONT_STACK / emailBadge are module-private there (not
// exported), so this file re-declares its own copy of the same three
// primitives rather than reaching into that module's internals. If you'd
// rather have one source of truth, export BRAND/FONT_STACK/emailBadge
// from email-templates.ts and delete the local copies below — the
// function bodies don't need to change either way.
import { emailLayout, emailButton } from "./email-templates";

const BRAND = {
  name: "Edurack",
  text: "#1F2333",
  muted: "#6B7280",
  border: "#E4E9F1",
  bg: "#F5F7FB",
  cardTint: "#EEF3FA",
  mintSoft: "#CDF0DD",
  skySoft: "#DCEAFB",
  lemonSoft: "#F7ECC4",
  coralSoft: "#F9D9D3",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

// ─── Intern invite (admin issues a secret code, candidate self-signs-up) ──
export function internInviteEmailHtml(params: {
  candidateName: string;
  secretCode: string;
  signupUrl: string;
}): string {
  const body = `
    ${emailBadge("You're invited", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Welcome to the Edurack Intern Program, ${params.candidateName}
    </h1>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      You've been invited to join Edurack as a Question Ingestion intern. Use the invite code below
      to create your account and pick your own username and password.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 20px 0;">
      <tr>
        <td style="
          background-color: ${BRAND.bg};
          background-image: linear-gradient(145deg, ${BRAND.bg}, ${BRAND.cardTint});
          border: 1px solid ${BRAND.border};
          border-radius: 18px;
          padding: 20px 30px;
        ">
          <span style="font-family: 'SF Mono', Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: 4px; color: ${BRAND.text};">
            ${params.secretCode}
          </span>
        </td>
      </tr>
    </table>
    ${params.signupUrl ? emailButton(params.signupUrl, "Create your account") : ""}
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
      ${params.signupUrl ? "If the button doesn't work, go to the link above and enter the code shown." : "Go to the Edurack intern sign-up page and enter the code above."}
    </p>
  `;
  return emailLayout({ previewText: `Your Edurack intern invite code: ${params.secretCode}`, bodyHtml: body });
}

// ─── Sample task (pre-hire sandboxed trial) ──────────────────────────────
export function internTrialInviteEmailHtml(params: {
  candidateName: string;
  subjectLabel: string;
  taskUrl: string;
  referenceMaterialUrl: string | null;
}): string {
  const body = `
    ${emailBadge("Sample task")}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Hi ${params.candidateName}, here's your sample task
    </h1>
    <p style="margin: 0 0 8px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      As part of the selection process for Edurack's Question Ingestion internship, please complete
      this short sample task:
    </p>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.text}; font-weight: 700;">
      ${params.subjectLabel}
    </p>
    ${
      params.referenceMaterialUrl
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; margin-bottom: 16px; background-color: ${BRAND.bg};">
             <tr>
               <td style="padding: 14px 18px;">
                 <p style="margin: 0 0 4px 0; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.muted};">Reference material</p>
                 <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px;"><a href="${params.referenceMaterialUrl}" style="color: #4F8FE0; font-weight: 700;">Open the source material</a></p>
               </td>
             </tr>
           </table>`
        : ""
    }
    ${params.taskUrl ? emailButton(params.taskUrl, "Start the sample task") : ""}
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">
      No account or password needed — the link above is all you need. Take your time, but the sooner
      you submit, the sooner we can review it and get back to you.
    </p>
  `;
  return emailLayout({ previewText: `Your Edurack sample task: ${params.subjectLabel}`, bodyHtml: body });
}

// ─── Task assigned (real, post-hire intern portal) ───────────────────────
export function internTaskAssignedEmailHtml(params: {
  internName: string;
  subject: string;
  targetCount: number;
  instructions: string;
  referencePdfUrl: string | null;
  dashboardUrl: string;
}): string {
  const body = `
    ${emailBadge("New task", BRAND.lemonSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      New task: ${params.subject}
    </h1>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Hi ${params.internName}, you've been assigned <strong style="color: ${BRAND.text};">${params.targetCount} question${params.targetCount === 1 ? "" : "s"}</strong>
      for <strong style="color: ${BRAND.text};">${params.subject}</strong>.
    </p>
    ${
      params.instructions
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; margin-bottom: 16px; background-color: ${BRAND.bg};">
             <tr>
               <td style="padding: 14px 18px;">
                 <p style="margin: 0 0 4px 0; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.muted};">Instructions</p>
                 <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.text}; white-space: pre-wrap;">${params.instructions}</p>
               </td>
             </tr>
           </table>`
        : ""
    }
    ${
      params.referencePdfUrl
        ? emailButton(params.referencePdfUrl, "Open reference document")
        : `<p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.muted};">No reference document attached — the instructions above cover what's needed.</p>`
    }
    ${params.dashboardUrl ? emailButton(params.dashboardUrl, "Open your dashboard") : ""}
  `;
  return emailLayout({ previewText: `New task: ${params.subject}`, bodyHtml: body });
}

// ─── Draft approved ───────────────────────────────────────────────────────
export function internDraftApprovedEmailHtml(params: {
  internName: string;
  subject: string;
  questionNo: number;
  dashboardUrl: string;
}): string {
  const body = `
    ${emailBadge("Question approved", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Nice work, ${params.internName}
    </h1>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your question for <strong style="color: ${BRAND.text};">${params.subject}</strong> was approved and is now
      live as question ${params.questionNo}.
    </p>
    ${params.dashboardUrl ? emailButton(params.dashboardUrl, "Keep going") : ""}
  `;
  return emailLayout({ previewText: `Approved: your ${params.subject} question is live`, bodyHtml: body });
}

// ─── Draft rejected ───────────────────────────────────────────────────────
export function internDraftRejectedEmailHtml(params: {
  internName: string;
  subject: string;
  feedback: string;
  dashboardUrl: string;
}): string {
  const body = `
    ${emailBadge("Needs a fix", BRAND.lemonSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      One of your ${params.subject} questions needs a revision
    </h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; margin-bottom: 16px; background-color: ${BRAND.bg};">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin: 0 0 4px 0; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.muted};">Reviewer feedback</p>
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${BRAND.text};">${params.feedback}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Hi ${params.internName}, open the task, fix it up, and resubmit whenever you're ready — nothing else is
      affected.
    </p>
    ${params.dashboardUrl ? emailButton(params.dashboardUrl, "Fix and resubmit") : ""}
  `;
  return emailLayout({ previewText: `Feedback on your ${params.subject} question`, bodyHtml: body });
}

// ─── Internship dates confirmed ───────────────────────────────────────────
export function internDatesConfirmedEmailHtml(params: {
  internName: string;
  startDate: string;
  endDate: string;
  dashboardUrl: string;
}): string {
  const body = `
    ${emailBadge("Internship confirmed")}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Your internship dates are set, ${params.internName}
    </h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${BRAND.border}; border-radius: 18px; overflow: hidden; background-color: ${BRAND.bg}; margin-bottom: 16px;">
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">Start date</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid ${BRAND.border}; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.text}; text-align: right; font-weight: 700;">${params.startDate}</td>
      </tr>
      <tr>
        <td style="padding: 14px 18px; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.muted};">End date</td>
        <td style="padding: 14px 18px; font-family: ${FONT_STACK}; font-size: 14px; color: ${BRAND.text}; text-align: right; font-weight: 700;">${params.endDate}</td>
      </tr>
    </table>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      You can see these any time, along with your task progress and accuracy, on your Profile page.
    </p>
    ${params.dashboardUrl ? emailButton(params.dashboardUrl, "View your profile") : ""}
  `;
  return emailLayout({ previewText: `Your internship: ${params.startDate} – ${params.endDate}`, bodyHtml: body });
}

// ─── Offer letter uploaded ────────────────────────────────────────────────
export function internOfferLetterEmailHtml(params: { internName: string; offerLetterUrl: string }): string {
  const body = `
    ${emailBadge("Offer letter", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Your Edurack offer letter is ready, ${params.internName}
    </h1>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Welcome to the team — your offer letter is attached below and always available from your intern portal.
    </p>
    ${emailButton(params.offerLetterUrl, "View offer letter")}
  `;
  return emailLayout({ previewText: "Your Edurack offer letter is ready", bodyHtml: body });
}

// ─── Certificate uploaded (message adapts to lock state) ─────────────────
export function internCertificateEmailHtml(params: {
  internName: string;
  unlocked: boolean;
  unlockDate: string | null;
  certificateUrl: string | null;
  profileUrl: string;
}): string {
  const body = `
    ${emailBadge("Certificate", BRAND.lemonSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      ${params.unlocked ? `Your certificate is ready, ${params.internName}` : `Your certificate is on its way, ${params.internName}`}
    </h1>
    <p style="margin: 0 0 20px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      ${
        params.unlocked
          ? "It's ready to download from your intern portal right now."
          : `It's prepared and waiting — it'll unlock for download on <strong style="color: ${BRAND.text};">${params.unlockDate}</strong>.`
      }
    </p>
    ${
      params.unlocked && params.certificateUrl
        ? emailButton(params.certificateUrl, "Download certificate")
        : emailButton(params.profileUrl, "View your profile")
    }
  `;
  return emailLayout({
    previewText: params.unlocked ? "Your certificate is ready to download" : "Your certificate is on its way",
    bodyHtml: body,
  });
}

// ─── Public application received (candidate submits /join-intern form) ───
// Just a "we got it" receipt — no next-step link, since the next step
// (a sample-task invite) is entirely admin-initiated from here, same as
// creatorApplications on the mentor side.
export function internApplicationReceivedEmailHtml(params: { candidateName: string }): string {
  const body = `
    ${emailBadge("Application received", BRAND.lemonSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Thanks for applying, ${params.candidateName}
    </h1>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      We've received your application for the Edurack internship program. Our team reviews every
      application by hand — if yours looks like a fit, we'll email you a short sample task as the
      next step. No action is needed from you right now.
    </p>
  `;
  return emailLayout({ previewText: "We've received your Edurack internship application", bodyHtml: body });
}

// ─── Public application: advanced to sample task ─────────────────────────
export function internApplicationAdvancedEmailHtml(params: { candidateName: string }): string {
  const body = `
    ${emailBadge("Application update", BRAND.mintSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      🎉 Good news, ${params.candidateName}
    </h1>
    <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Your internship application stood out — we're moving you forward to the next step. You'll
      receive a short sample task by email shortly; no account needed, just a one-time link.
    </p>
  `;
  return emailLayout({ previewText: "You're moving forward in the Edurack internship process", bodyHtml: body });
}

// ─── Public application: rejected ─────────────────────────────────────────
export function internApplicationRejectedEmailHtml(params: { candidateName: string; reason: string }): string {
  const body = `
    ${emailBadge("Application update", BRAND.coralSoft)}
    <h1 style="margin: 0 0 12px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; letter-spacing: -0.02em; color: ${BRAND.text};">
      Hi ${params.candidateName}
    </h1>
    <p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 15px; line-height: 23px; color: ${BRAND.muted};">
      Thanks for applying to intern with ${BRAND.name}. After review, we're not able to move forward
      with your application at this time.
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
  return emailLayout({ previewText: "An update on your Edurack internship application", bodyHtml: body });
}