// SERVER-ONLY. Streak-reminder and outreach emails. Built on the existing
// emailLayout()/emailButton() from email-templates.ts so they look like every
// other Edurack email. Nothing in email-templates.ts needs to change.
import { emailButton, emailLayout } from "@/lib/email-templates";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const C = { text: "#1F2333", muted: "#6B7280", coral: "#F8D9C6", lemon: "#F7ECC4", sky: "#DCEAFB", mint: "#CDF0DD" };

export const SITE_URL = process.env.PUBLIC_SITE_URL ?? "https://www.edurack.in";

/** Student-supplied / admin-typed text is escaped before it goes into HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "there";

const badge = (label: string, bg: string) =>
  `<span style="display:inline-block;background:${bg};color:${C.text};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:14px;">${esc(label)}</span>`;

const p = (html: string) =>
  `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};">${html}</p>`;

const h1 = (html: string) =>
  `<h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:22px;line-height:30px;letter-spacing:-0.02em;color:${C.text};">${html}</h1>`;

function unsubscribeFooter(url: string, what: string): string {
  return `<p style="margin:22px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
    You're getting this ${esc(what)}. <a href="${esc(url)}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a>
  </p>`;
}

// ─── Streak reminder ───────────────────────────────────────────────────────
export type StreakReminderParams = {
  name: string;
  streakDays: number;
  hoursLeft: number;
  /** What they did last time, e.g. { answered: 12, correct: 9, topSubject: "Physics" } */
  lastSession: { answered: number; correct: number; topSubject?: string; topChapter?: string } | null;
  practiceUrl: string;
  unsubscribeUrl: string;
};

export function streakReminderSubject(p: Pick<StreakReminderParams, "name" | "streakDays">): string {
  return `🔥 ${p.name}, your ${p.streakDays}-day streak ends tonight`;
}

export function streakReminderEmailHtml(params: StreakReminderParams): string {
  const { name, streakDays, hoursLeft, lastSession } = params;
  const recap = lastSession
    ? p(
        `Last time you answered <strong>${lastSession.answered}</strong> PYQ${lastSession.answered === 1 ? "" : "s"}` +
          ` (<strong>${lastSession.correct}</strong> correct)` +
          (lastSession.topChapter ? ` — mostly <strong>${esc(lastSession.topChapter)}</strong>` : lastSession.topSubject ? ` — mostly <strong>${esc(lastSession.topSubject)}</strong>` : "") +
          `. Keep that momentum.`,
      )
    : "";
  const body = `
    ${badge(`${streakDays}-day streak`, C.coral)}
    ${h1(`${esc(name)}, don't let ${streakDays} days go to waste 🔥`)}
    ${p(`Your streak resets at midnight — about <strong>${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}</strong> from now. One answered question is enough to keep it alive.`)}
    ${recap}
    ${emailButton(params.practiceUrl, "Solve one PYQ now")}
    ${p(`<span style="color:${C.muted};font-size:13px;">Peeking at a solution without answering doesn't count — attempt it.</span>`)}
    ${unsubscribeFooter(params.unsubscribeUrl, "because you're on a practice streak on Edurack")}
  `;
  return emailLayout({ previewText: `Your ${streakDays}-day streak ends at midnight — one question keeps it alive.`, bodyHtml: body });
}

// ─── One-tap outreach ──────────────────────────────────────────────────────
export type OutreachAsset = { label: string; url: string };

export type OutreachEmailParams = {
  name: string;
  /** Admin-written body. {{name}} is replaced before this is called. Escaped here; line breaks kept. */
  message: string;
  assets: OutreachAsset[];
  unsubscribeUrl: string;
  previewText?: string;
};

/** Only http(s) links are allowed — an admin typo can't ship a javascript: URL into students' inboxes. */
export function safeUrl(u: string): string | null {
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function outreachEmailHtml(params: OutreachEmailParams): string {
  const paragraphs = params.message
    .split(/\n{2,}/)
    .map((chunk) => p(esc(chunk.trim()).replace(/\n/g, "<br />")))
    .join("");
  const assetButtons = params.assets
    .map((a) => ({ label: a.label, url: safeUrl(a.url) }))
    .filter((a): a is { label: string; url: string } => !!a.url && a.label.trim().length > 0)
    .map((a) => emailButton(a.url, esc(a.label)))
    .join("");
  const body = `
    ${badge("From Edurack", C.sky)}
    ${h1(`Hi ${esc(params.name)} 👋`)}
    ${paragraphs}
    ${assetButtons}
    ${unsubscribeFooter(params.unsubscribeUrl, "because you signed up on Edurack")}
  `;
  return emailLayout({ previewText: params.previewText ?? params.message.slice(0, 90), bodyHtml: body });
}
