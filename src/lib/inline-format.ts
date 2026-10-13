// src/lib/inline-format.ts
//
// Light inline formatting for question text (body, options, solution) so an
// admin can type  **bold**  or  *italic*  and have students see real
// formatting instead of literal asterisks.
//
// Deliberately NOT a full markdown parser — question text is mostly prose +
// LaTeX, and a general parser would mangle things like "2 * 3", snake_case,
// or "a < b". Everything here is conservative and single-line.
//
// Supported:
//   ***bold italic***   **bold**   *italic*   _italic_   ~~strike~~   `code`
//   <b> <strong> <i> <em> <u> <s> <sub> <sup> <br>   (whitelisted tags only)
//
// SAFETY: input is HTML-escaped FIRST. Formatting is then re-introduced only
// through the fixed set of tags above — no attributes, no other tags — so
// output is safe to feed to dangerouslySetInnerHTML.
//
// This file has no KaTeX dependency on purpose, so the lazy-loading
// QuestionContentRenderer can use it without pulling KaTeX in statically.

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Placeholders for pre-rendered chunks (KaTeX output) that must pass through
// formatting untouched. Private-use characters can't occur in real input.
export const PH_OPEN = "\uE000";
export const PH_CLOSE = "\uE001";

const ALLOWED_TAGS = "b|strong|i|em|u|s|sub|sup";

/** Escape `text` and apply inline formatting. Returns safe HTML. */
export function formatInlineHtml(text: string): string {
  let h = escapeHtml(text);

  // Whitelisted raw tags (they were just escaped, so un-escape only these).
  h = h.replace(new RegExp(`&lt;(\\/?)(${ALLOWED_TAGS})&gt;`, "gi"), (_m, slash, tag) => `<${slash}${String(tag).toLowerCase()}>`);
  h = h.replace(/&lt;br\s*\/?&gt;/gi, "<br/>");

  // Inline code first, and stash it so its contents aren't formatted.
  const codes: string[] = [];
  h = h.replace(/`([^`\n]+)`/g, (_m, c) => {
    codes.push(`<code class="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.9em]">${c}</code>`);
    return `${PH_OPEN}c${codes.length - 1}${PH_CLOSE}`;
  });

  // No regex lookbehind anywhere here: older Safari (<16.4) throws a
  // SyntaxError on it at module load, which would take the whole page down.
  // Order matters: longest delimiters first.
  h = h.replace(/\*\*\*(\S(?:[^\n]*?\S)?)\*\*\*/g, "<strong><em>$1</em></strong>");
  h = h.replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/~~(\S(?:[^\n]*?\S)?)~~/g, "<s>$1</s>");
  // Single * / _ : must not touch a word on either side, so "m*a", "v*t",
  // "2 * 3", and snake_case are left exactly as typed.
  h = h.replace(/(^|[^\w*])\*([^\s*](?:[^\n*]*?[^\s*])?)\*(?![\w*])/g, "$1<em>$2</em>");
  h = h.replace(/(^|[^\w_])_([^\s_](?:[^\n_]*?[^\s_])?)_(?![\w_])/g, "$1<em>$2</em>");

  h = h.replace(new RegExp(`${PH_OPEN}c(\\d+)${PH_CLOSE}`, "g"), (_m, i) => codes[Number(i)] ?? "");
  return h;
}

/**
 * Format text that contains already-rendered chunks (e.g. KaTeX HTML).
 * `chunks` are swapped out for placeholders before formatting and restored
 * after, so `**Find $x$ now**` bolds across the equation and the equation's
 * own characters (*, _, ^) are never reinterpreted.
 */
export function formatWithChunks(textWithPlaceholders: string, chunks: string[]): string {
  const html = formatInlineHtml(textWithPlaceholders);
  return html.replace(new RegExp(`${PH_OPEN}m(\\d+)${PH_CLOSE}`, "g"), (_m, i) => chunks[Number(i)] ?? "");
}
