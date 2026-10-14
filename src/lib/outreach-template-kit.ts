// Small builder used by the extended template library (outreach-templates-*.ts).
// Pure data helpers — safe on client and server. Type-only import avoids a runtime cycle.
import type { OutreachTemplate, TemplateCategory } from "@/lib/outreach-templates";
import type { OutreachCampaign } from "@/lib/outreach-types";

export const SITE = "https://www.edurack.in";

type Aud = OutreachCampaign["audience"];
export const A = (exam: Aud["exam"] = "neet", track: Aud["track"] = "any", nonBuyersOnly = false): Aud => ({ exam, track, nonBuyersOnly });

/** Card-header pastel per category, so the gallery stays visually grouped. */
export const CATEGORY_TINT: Record<TemplateCategory, string> = {
  Welcome: "#DCEAFB", Habit: "#F7ECC4", Strategy: "#E5DDF7", "By class": "#C9EEE8", Growth: "#CDF0DD",
  "By exam": "#DCEAFB", "Exam countdown": "#F8D9C6", "Tests & results": "#E5DDF7", "Win-back": "#F7ECC4",
  "Live & mentors": "#C9EEE8", Community: "#CDF0DD", Updates: "#DCEAFB", Sales: "#F8D9C6", Support: "#E4E9F1",
  Motivation: "#F7ECC4", Hinglish: "#CDF0DD", Parents: "#C9EEE8",
};

export type Link = [label: string, path: string];

/**
 * T(category, key, emoji, title, tagline, sendWhen, subject, message, links?, audience?)
 * - links: [label, "/path"] (relative to the site) or [label, "https://…"].
 * - Anything in [square brackets] in subject/message is a blank the admin must fill; the card shows a badge.
 */
export function T(
  category: TemplateCategory, key: string, emoji: string, title: string, tagline: string, sendWhen: string,
  subject: string, message: string, links: Link[] = [], audience: Aud = A(),
): OutreachTemplate {
  return {
    key, emoji, category, title, tagline, sendWhen, tint: CATEGORY_TINT[category],
    needsEdit: /\[[^\]]+\]/.test(subject + message),
    campaign: {
      name: title, subject, message: message.trim(),
      assets: links.map(([label, p]) => ({ label, url: /^https?:\/\//i.test(p) ? p : `${SITE}${p}` })),
      audience,
    },
  };
}
