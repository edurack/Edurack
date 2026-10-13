// SERVER-ONLY. Streak-reminder and outreach emails. Built on the existing
// emailLayout()/emailButton() from email-templates.ts so they look like every
// other Edurack email. Nothing in email-templates.ts needs to change.
import { emailButton, emailLayout } from "@/lib/email-templates";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const C = { text: "#1F2333", muted: "#6B7280", coral: "#F8D9C6", lemon: "#F7ECC4", sky: "#DCEAFB", mint: "#CDF0DD" };

export const SITE_URL = (typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined) ?? "https://www.edurack.in";

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
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 22px 0;"><tr>
      <td align="center" style="background:${C.coral};background-image:linear-gradient(145deg,#FBE3D3,#F8CDB3);border-radius:22px;padding:26px 16px;">
        <div style="font-family:${FONT};font-size:44px;line-height:48px;">🔥</div>
        <div style="font-family:${FONT};font-size:54px;line-height:58px;font-weight:800;letter-spacing:-0.03em;color:${C.text};">${streakDays}</div>
        <div style="font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A4B2B;">day streak</div>
        <div style="margin-top:14px;"><span style="display:inline-block;background:#ffffff;border-radius:999px;padding:6px 14px;font-family:${FONT};font-size:12px;font-weight:700;color:${C.text};">⏳ ~${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} left today</span></div>
      </td>
    </tr></table>
    ${h1(`${esc(name)}, don't let ${streakDays} days go to waste`)}
    ${p(`Your streak resets at midnight. <strong>One answered question</strong> is enough to keep it alive.`)}
    ${recap}
    ${emailButton(params.practiceUrl, "Solve one PYQ now")}
    ${p(`<span style="color:${C.muted};font-size:13px;">Peeking at a solution without answering doesn't count, so attempt it.</span>`)}
    ${unsubscribeFooter(params.unsubscribeUrl, "because you're on a practice streak on Edurack")}
  `;
  return emailLayout({ previewText: `Your ${streakDays}-day streak ends at midnight — one question keeps it alive.`, bodyHtml: body });
}

// ─── One-tap outreach ──────────────────────────────────────────────────────
export type OutreachAsset = { label: string; url: string };

export type OutreachEmailParams = {
  name: string;
  /** Admin-written body. {{name}} is replaced before this is called. Escaped here. */
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

/** Inline formatting on already-escaped text: **bold**. */
const inline = (escaped: string) => escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const headline = (t: string) =>
  `<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:26px;line-height:33px;font-weight:800;letter-spacing:-0.025em;color:${C.text};">${t}</h1>`;

const checkList = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px 0;width:100%;">${items
    .map(
      (it) => `<tr>
      <td width="30" valign="top" style="padding:5px 0;"><span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:999px;background:${C.mint};color:#1B6B45;font-family:${FONT};font-size:12px;font-weight:800;">&#10003;</span></td>
      <td valign="top" style="padding:4px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};">${inline(it)}</td>
    </tr>`,
    )
    .join("")}</table>`;

const callout = (html: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px 0;"><tr>
    <td style="background:${C.lemon};border-radius:16px;padding:16px 18px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};">${html}</td>
  </tr></table>`;

/** Plain-text → email blocks. Supports "# headline", "**bold**", "- list", "> callout", blank-line paragraphs. */
export function renderRichText(message: string): string {
  return message
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n");
      if (lines[0].startsWith("# ")) {
        const rest = lines.slice(1).join("\n").trim();
        return headline(inline(esc(lines[0].slice(2).trim()))) + (rest ? renderRichText(rest) : "");
      }
      if (lines.every((l) => /^\s*[-•✓]\s+/.test(l))) return checkList(lines.map((l) => esc(l.replace(/^\s*[-•✓]\s+/, "").trim())));
      if (lines.every((l) => l.startsWith(">"))) return callout(inline(esc(lines.map((l) => l.replace(/^>\s?/, "")).join(" ").trim())));
      return p(inline(esc(chunk)).replace(/\n/g, "<br />"));
    })
    .join("");
}

const secondaryButton = (url: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;"><tr>
    <td style="border-radius:999px;border:2px solid #C9D6EA;">
      <a href="${url}" style="display:inline-block;padding:11px 26px;font-family:${FONT};font-size:14px;font-weight:700;color:#3D6FC4;text-decoration:none;border-radius:999px;">${label}</a>
    </td>
  </tr></table>`;

export function outreachEmailHtml(params: OutreachEmailParams): string {
  const body_ = renderRichText(params.message);
  const buttons = params.assets
    .map((a) => ({ label: a.label, url: safeUrl(a.url) }))
    .filter((a): a is { label: string; url: string } => !!a.url && a.label.trim().length > 0)
    .map((a, i) => (i === 0 ? emailButton(a.url, esc(a.label)) : secondaryButton(a.url, esc(a.label))))
    .join("");
  const body = `
    ${body_}
    ${buttons}
    <p style="margin:22px 0 0 0;font-family:${FONT};font-size:14px;line-height:22px;color:${C.text};">Keep going,<br /><strong>Team Edurack</strong></p>
    ${unsubscribeFooter(params.unsubscribeUrl, "because you signed up on Edurack")}
  `;
  const preview = (params.previewText ?? params.message.replace(/^#\s.*\n+/, "").replace(/[#>*\-•]/g, "")).replace(/\s+/g, " ").trim().slice(0, 110);
  return emailLayout({ previewText: esc(preview), bodyHtml: body });
}
