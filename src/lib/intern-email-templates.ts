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
