// src/lib/blog-content.tsx
//
// A hand-rolled markdown → HTML renderer for EduRack.
// Safe HTML output with support for headings (with stable anchor ids),
// lists, tables, code blocks, quotes, images, links, custom inline CTA
// buttons, an accessible FAQ accordion, and responsive text wrapping.
//
// Rich-content authoring syntax (all of it renders on the server too, so SSR
// and SEO see the finished page):
//   - Math:      $E=mc^2$ inline, $$ ... $$ display (can span lines), or a
//                ```math fenced block. Chemistry: $\\ce{2H2 + O2 -> 2H2O}$
//                (KaTeX + mhchem). A literal dollar sign is written \\$.
//   - SVG:       paste raw <svg ...>...</svg> straight into the body, or wrap
//                it in a ```svg fence (text after "svg" on the fence line is
//                the caption). SVG is always rendered through an <img> data
//                URI, never inlined, so scripts / external loads inside a
//                pasted SVG can never execute on the page.
//   - Images:    ![alt](url) — add a caption with ![alt](url "Caption").
//   - Callouts:  :::note / :::tip / :::warning / :::important / :::example
//                (optional title after the keyword), closed by a lone :::.
//                Callouts can contain any of the syntax above.
//   - Inline:    ~~strikethrough~~ and ==highlight== on top of bold/italic.
//
// Accessibility notes (read before editing this file):
//   - Every heading gets a stable, deduped `id` so the Table of Contents
//     and any external "jump to section" link keeps working.
//   - Headings map markdown `#` → <h2>, `##` → <h3>, `###` → <h4>. This
//     assumes the page itself renders the post title as the single <h1>.
//     Authors should use `#` for major sections and `##` for sub-sections
//     so the visual hierarchy never skips a level. `###` is for rare,
//     deeply-nested detail and is intentionally left out of the generated
//     Table of Contents (see extractHeadings below) to keep it scannable.
//   - A section literally titled "Frequently Asked Questions" (any
//     heading level, case-insensitive) switches the parser into FAQ mode:
//     every subsequent **bold, standalone** line becomes a question and
//     the paragraph(s) that follow become its answer, rendered as a
//     native <details>/<summary> accordion. Native elements are used
//     deliberately — they're keyboard-operable and screen-reader
//     friendly with zero JavaScript.
//   - Tables are rendered with <thead>/<tbody>, scope="col" on header
//     cells, and are wrapped in a labelled, keyboard-scrollable region so
//     wide tables don't break horizontal layout on mobile.

import katex from "katex";
import "katex/dist/katex.min.css";
// Chemistry: enables \ce{...} and \pu{...} inside math — bundled with katex.
// @ts-ignore — no bundled type declarations for the contrib entry point
import "katex/contrib/mhchem";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return /^https?:\/\//i.test(trimmed);
}

// ── Math handling ─────────────────────────────────────────────────────────
// Math is pulled out of the markdown BEFORE any other parsing and replaced by
// a private-use-character token. That way `*`, `_`, `<` and friends inside a
// formula are never mangled by the markdown rules or HTML-escaping, and a
// multi-line $$ ... $$ block survives the line-by-line block parser. Tokens
// are swapped for KaTeX output at the very end of renderInline.
// Module-level store is safe: rendering is fully synchronous.
const MATH_OPEN = "\uE000";
const MATH_CLOSE = "\uE001";
const MATH_TOKEN_PATTERN = /\uE000(\d+)\uE001/g;

type MathEntry = { raw: string; html: string; display: boolean };
let mathStore: MathEntry[] = [];

function renderKatex(expr: string, display: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml",
    });
  } catch {
    return `<code class="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-mono">${escapeHtml(expr)}</code>`;
  }
}

function stashMath(expr: string, display: boolean): string {
  const raw = display ? `$$${expr}$$` : `$${expr}$`;
  const rendered = renderKatex(expr.trim(), display);
  const html = display
    ? `<span class="blog-math-display my-4 block max-w-full overflow-x-auto overflow-y-hidden text-center">${rendered}</span>`
    : rendered;
  mathStore.push({ raw, html, display });
  return `${MATH_OPEN}${mathStore.length - 1}${MATH_CLOSE}`;
}

function restoreMathHtml(text: string): string {
  return text.replace(MATH_TOKEN_PATTERN, (_, n) => mathStore[Number(n)]?.html ?? "");
}

function restoreMathRaw(text: string): string {
  return text.replace(MATH_TOKEN_PATTERN, (_, n) => mathStore[Number(n)]?.raw ?? "");
}

// Inline: $...$ — the opening $ must be followed by a non-space, the closing
// $ preceded by a non-space and NOT followed by a digit. That is what keeps
// prose like "costs $5 and $10" from being read as a formula.
const INLINE_MATH_PATTERN = /(?<!\\)\$(?![\s$])([^$\n]*?[^\s$\\])\$(?!\d)/g;
const DISPLAY_MATH_PATTERN = /(?<!\\)\$\$([\s\S]+?)\$\$/g;

function extractMathFromText(text: string): string {
  // Leave `inline code` spans untouched — a $ in code is just a $.
  return text
    .split(/(`[^`\n]*`)/)
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      return part
        .replace(DISPLAY_MATH_PATTERN, (_, expr) => stashMath(expr, true))
        .replace(INLINE_MATH_PATTERN, (_, expr) => stashMath(expr, false));
    })
    .join("");
}

// Walks the document, skipping fenced code blocks and raw <svg> blocks, and
// extracts math from everything else.
function extractMath(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  let inFence = false;
  let inSvg = false;

  const flush = () => {
    if (buffer.length) {
      out.push(extractMathFromText(buffer.join("\n")));
      buffer = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (inFence) {
      out.push(line);
      if (t.startsWith("```")) inFence = false;
      continue;
    }
    if (inSvg) {
      out.push(line);
      if (/<\/svg>/i.test(t)) inSvg = false;
      continue;
    }
    if (t.startsWith("```")) {
      flush();
      out.push(line);
      inFence = true;
      continue;
    }
    if (/^<svg[\s>]/i.test(t)) {
      flush();
      out.push(line);
      if (!/<\/svg>/i.test(t)) inSvg = true;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out.join("\n");
}

// ── SVG handling ──────────────────────────────────────────────────────────
const MAX_SVG_CHARS = 300_000;

function svgOpeningTag(svg: string): string {
  const end = svg.indexOf(">");
  return end === -1 ? svg : svg.slice(0, end + 1);
}

function renderSvgFigure(svgCode: string, caption: string): string {
  let svg = svgCode.trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    return `<p class="my-4 text-sm text-rose-600">SVG block is incomplete — it must start with &lt;svg and end with &lt;/svg&gt;.</p>`;
  }
  if (svg.length > MAX_SVG_CHARS) {
    return `<p class="my-4 text-sm text-rose-600">SVG is too large to embed — upload it as an image instead.</p>`;
  }

  let open = svgOpeningTag(svg);
  let patched = open;
  // An <img> data-URI SVG is only valid with an xmlns.
  if (!/\sxmlns\s*=/.test(patched)) patched = patched.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  // No intrinsic size → the browser falls back to a tiny 300×150 box. If a
  // viewBox exists, derive width/height from it so the image scales properly.
  const hasWidth = /\swidth\s*=/.test(patched);
  const hasHeight = /\sheight\s*=/.test(patched);
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(patched);
  if (vb && (!hasWidth || !hasHeight)) {
    const extra = `${hasWidth ? "" : ` width="${vb[1]}"`}${hasHeight ? "" : ` height="${vb[2]}"`}`;
    patched = patched.replace(/^<svg/i, `<svg${extra}`);
  }
  svg = patched + svg.slice(open.length);

  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const alt = caption ? restoreMathRaw(caption) : "Diagram";
  const figcaption = caption
    ? `<figcaption class="mt-2 text-center text-xs text-foreground/60">${renderInline(caption)}</figcaption>`
    : "";
  // White card: pasted SVGs are usually drawn for a white background and
  // would disappear on a dark theme otherwise.
  return `<figure class="blog-figure blog-svg my-6"><div class="overflow-x-auto rounded-xl border border-foreground/10 bg-white p-3 text-center"><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" class="mx-auto h-auto max-w-full" /></div>${figcaption}</figure>`;
}

function parseImageTarget(raw: string): { url: string; caption: string } {
  const m = /^(\S+)\s+"([^"]*)"\s*$/.exec(raw.trim());
  return m ? { url: m[1], caption: m[2] } : { url: raw.trim(), caption: "" };
}

// Strips the inline markdown syntax we support so heading text can be
// turned into a clean slug and into an accessible accordion <summary>.
function stripInlineMarkdown(text: string): string {
  return restoreMathRaw(text)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/~~|==/g, "")
    .replace(/[*`_]/g, "")
    .trim();
}

function slugify(text: string): string {
  const base = stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base || "section";
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|~~[^~]+~~|==[^=]+==|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;

function renderInline(text: string): string {
  const parts = text.split(INLINE_PATTERN);
  const joined = parts
    .map((part) => {
      if (!part) return "";

      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
      if (image) {
        const [, alt, target] = image;
        const { url, caption } = parseImageTarget(target);
        if (!isSafeUrl(url)) return escapeHtml(part);
        const titleAttr = caption ? ` title="${escapeHtml(caption)}"` : "";
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(restoreMathRaw(alt))}"${titleAttr} loading="lazy" decoding="async" class="blog-inline-image rounded-xl max-w-full h-auto my-4" />`;
      }

      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const [, label, url] = link;
        if (!isSafeUrl(url)) return escapeHtml(part);

        // Custom CTA button syntax: [button:Label](url)
        // Optional pipe-separated modifiers after the label, in order:
        //   align  — left | center (default) | right
        //   style  — primary (default) | outline
        // e.g. [button:Explore NEET batches|left|outline](/course/mentorship/abc)
        // Old plain [button:Label](url) posts keep working unchanged —
        // both modifiers just fall back to their defaults when omitted.
        if (label.startsWith("button:")) {
          const raw = label.slice(7).trim();
          const [textPart, alignPart, stylePart] = raw.split("|").map((s) => s.trim());
          const buttonText = textPart || "Learn more";
          const align = alignPart === "left" || alignPart === "right" ? alignPart : "center";
          const style = stylePart === "outline" ? "outline" : "primary";
          const external = /^https?:\/\//i.test(url.trim());
          const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
          const alignClass = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
          const btnClass =
            style === "outline"
              ? "inline-flex items-center justify-center rounded-xl border-2 border-foreground px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-foreground hover:text-background active:scale-[0.99]"
              : "inline-flex items-center justify-center rounded-xl bg-foreground px-6 py-3 text-sm font-bold text-background shadow-md transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]";
          const externalSuffix = external ? '<span class="sr-only"> (opens in a new tab)</span>' : "";
          return `<span class="blog-cta my-6 block ${alignClass}"><a href="${escapeHtml(url.trim())}"${relAttr} class="${btnClass}">${escapeHtml(buttonText)} →${externalSuffix}</a></span>`;
        }

        const external = /^https?:\/\//i.test(url.trim());
        const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        const externalSuffix = external ? '<span class="sr-only"> (opens in a new tab)</span>' : "";
        return `<a href="${escapeHtml(url.trim())}"${relAttr} class="font-medium text-primary underline underline-offset-4 break-all">${escapeHtml(label)}${externalSuffix}</a>`;
      }

      if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
        return `<del>${escapeHtml(part.slice(2, -2))}</del>`;
      }
      if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
        return `<mark class="rounded bg-yellow-200/70 px-1 text-foreground">${escapeHtml(part.slice(2, -2))}</mark>`;
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code class="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-mono">${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 1) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }

      return escapeHtml(part).replace(/\\\$/g, "$");
    })
    .join("");
  return restoreMathHtml(joined);
}

type ListState = { kind: "ul" | "ol"; items: string[] } | null;

function flushList(state: ListState, out: string[]) {
  if (!state || state.items.length === 0) return;
  const tag = state.kind;
  out.push(`<${tag} class="blog-list my-4 ml-6 ${tag === "ul" ? "list-disc" : "list-decimal"} space-y-2 break-words [overflow-wrap:anywhere]">${state.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`);
}

// A single row is anything of the form "| a | b | c |" (a leading/trailing
// pipe is not required, but almost every author includes both). We
// deliberately don't support escaped pipes inside cells — not needed for
// the syllabus/weightage tables this renderer is built for.
function isTableRowLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  const stripped = t.replace(/^\|/, "").replace(/\|$/, "");
  return stripped.includes("|") || (t.startsWith("|") && t.endsWith("|"));
}

function isTableSeparatorLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-")) return false;
  const cells = splitTableRow(t);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function tableCellAlignClass(sep: string): string {
  const t = sep.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "text-center";
  if (right) return "text-right";
  return "text-left";
}

function renderTable(headerLine: string, sepLine: string, bodyLines: string[]): string {
  const headers = splitTableRow(headerLine);
  const aligns = splitTableRow(sepLine).map(tableCellAlignClass);
  const rows = bodyLines.map((l) => splitTableRow(l));

  const thead = `<thead><tr>${headers
    .map((h, i) => `<th scope="col" class="${aligns[i] ?? "text-left"} border-b-2 border-foreground/15 px-3 py-2 font-semibold">${renderInline(h)}</th>`)
    .join("")}</tr></thead>`;

  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr class="border-b border-foreground/10 last:border-0">${row
          .map((cell, i) => `<td class="${aligns[i] ?? "text-left"} px-3 py-2 align-top">${renderInline(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody>`;

  // role="region" + tabindex + aria-label make a horizontally-scrollable
  // table keyboard-reachable and announced correctly by screen readers,
  // instead of silently clipping on narrow viewports.
  return `<div class="blog-table-wrap my-6 overflow-x-auto rounded-xl border border-foreground/10" role="region" tabindex="0" aria-label="Table: ${escapeHtml(stripInlineMarkdown(headers[0] ?? "data"))} and related columns"><table class="blog-table w-full min-w-max border-collapse text-sm">${thead}${tbody}</table></div>`;
}

export type BlogHeading = { id: string; level: 2 | 3; text: string };

// Pulls out only the "navigable" headings (`#` and `##` — rendered as
// <h2>/<h3>) for the Table of Contents. `###` (<h4>) is intentionally
// excluded: it's used for granular, often-repeated sub-points (e.g. a
// "Solved Example" appearing under three different sections) that would
// make the TOC long and confusing rather than useful.
export function extractHeadings(markdown: string): BlogHeading[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const counts = new Map<string, number>();
  const headings: BlogHeading[] = [];
  let inCodeFence = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = /^(#{1,2})\s+(.*)$/.exec(trimmed);
    if (!match) continue;

    const level = (match[1].length + 1) as 2 | 3;
    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;

    const base = slugify(text);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;

    headings.push({ id, level, text });
  }

  return headings;
}

const FAQ_HEADING_PATTERN = /frequently asked questions/i;

// Plain-text version of the post's FAQ section, for FAQPage JSON-LD. Mirrors
// the authoring convention the renderer uses above: after a heading titled
// "Frequently Asked Questions", every standalone **bold** paragraph is a
// question and the paragraph(s) after it are its answer. Stops at the next
// heading. Markdown (links, bold, code) is stripped to plain text.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFaqItems(markdown: string): { question: string; answer: string }[] {
  const blocks = markdown.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const items: { question: string; answer: string[] }[] = [];
  let inFaq = false;
  for (const block of blocks) {
    const raw = block.trim();
    if (!raw) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(raw.split("\n")[0]);
    if (heading) {
      if (inFaq) break; // next section ends the FAQ
      inFaq = FAQ_HEADING_PATTERN.test(heading[1]);
      continue;
    }
    if (!inFaq) continue;
    const joined = raw.split("\n").join(" ").trim();
    const q = /^\*\*(.+)\*\*$/.exec(joined);
    if (q) items.push({ question: stripInlineMarkdown(q[1]), answer: [] });
    else if (items.length > 0) items[items.length - 1].answer.push(stripInlineMarkdown(joined));
  }
  return items
    .filter((i) => i.answer.length > 0)
    .map((i) => ({ question: i.question, answer: i.answer.join(" ") }));
}

type RenderShared = { headingIdCounts: Map<string, number>; faqBlockIndex: number };

const CALLOUT_OPEN = /^:::(note|tip|warning|important|example)\b[ \t]*(.*)$/i;

const CALLOUT_STYLES: Record<string, { label: string; box: string; tag: string }> = {
  note: { label: "Note", box: "border-primary/60 bg-primary/5", tag: "text-primary" },
  tip: { label: "Tip", box: "border-emerald-500/70 bg-emerald-500/10", tag: "text-emerald-600" },
  warning: { label: "Warning", box: "border-amber-500/70 bg-amber-500/10", tag: "text-amber-600" },
  important: { label: "Important", box: "border-rose-500/70 bg-rose-500/10", tag: "text-rose-600" },
  example: { label: "Example", box: "border-violet-500/70 bg-violet-500/10", tag: "text-violet-600" },
};

function renderBlocks(lines: string[], shared: RenderShared): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: ListState = null;
  let inCodeFence = false;
  let fenceInfo = "";
  let codeLines: string[] = [];
  const headingIdCounts = shared.headingIdCounts;

  // A closed (or end-of-document) fence becomes one of: an SVG figure, a
  // display-math block, or a plain code block.
  function emitFence() {
    const lang = fenceInfo.split(/\s+/)[0]?.toLowerCase() ?? "";
    const rest = fenceInfo.slice(lang.length).trim();
    const body = codeLines.join("\n");
    if (lang === "svg") {
      out.push(renderSvgFigure(body, rest));
    } else if (lang === "math" || lang === "latex" || lang === "tex") {
      out.push(`<div class="blog-math-block">${stashMathBlockHtml(body)}</div>`);
    } else {
      out.push(`<pre class="blog-code-block my-6 overflow-x-auto rounded-xl bg-foreground/5 p-4 text-xs font-mono"><code>${escapeHtml(body)}</code></pre>`);
    }
    codeLines = [];
    fenceInfo = "";
    inCodeFence = false;
  }

  // FAQ accordion state. See module doc comment above for the authoring
  // convention this implements.
  let faqMode = false;
  let faqItems: { question: string; answerParagraphs: string[] }[] = [];

  function nextHeadingId(text: string): string {
    const base = slugify(text);
    const seen = headingIdCounts.get(base) ?? 0;
    headingIdCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  }

  function flushFaq() {
    if (faqItems.length === 0) {
      faqMode = false;
      return;
    }
    shared.faqBlockIndex++;
    const faqBlockIndex = shared.faqBlockIndex;
    const itemsHtml = faqItems
      .map((item, i) => {
        const qId = `faq-${faqBlockIndex}-${i + 1}`;
        const answerHtml = item.answerParagraphs
          .map((p) => `<p class="mt-2 leading-relaxed break-words [overflow-wrap:anywhere]">${renderInline(p)}</p>`)
          .join("");
        return `<details class="blog-faq-item group border-b border-foreground/10 py-3 last:border-0" id="${qId}">
  <summary class="blog-faq-question flex cursor-pointer list-none items-start justify-between gap-3 font-semibold text-foreground marker:content-none">
    <span>${renderInline(item.question)}</span>
    <span class="blog-faq-icon mt-0.5 shrink-0 transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
  </summary>
  <div class="blog-faq-answer text-foreground/75">${answerHtml}</div>
</details>`;
      })
      .join("\n");
    out.push(`<div class="blog-faq my-6 divide-y divide-foreground/10 rounded-2xl border border-foreground/10 px-4">${itemsHtml}</div>`);
    faqItems = [];
    faqMode = false;
  }

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const raw = paragraph.join(" ").trim();
    paragraph = [];

    if (faqMode) {
      const qMatch = /^\*\*(.+)\*\*$/.exec(raw);
      if (qMatch) {
        faqItems.push({ question: qMatch[1], answerParagraphs: [] });
        return;
      }
      if (faqItems.length > 0) {
        faqItems[faqItems.length - 1].answerParagraphs.push(raw);
        return;
      }
      // A stray paragraph before the first question (e.g. an intro
      // sentence right under the FAQ heading) — render it normally.
    }

    out.push(`<p class="my-4 leading-relaxed break-words [overflow-wrap:anywhere]">${renderInline(raw)}</p>`);
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeFence) {
        emitFence();
      } else {
        flushParagraph();
        flushList(list, out);
        list = null;
        inCodeFence = true;
        fenceInfo = line.trim().slice(3).trim();
      }
      i++;
      continue;
    }
    if (inCodeFence) {
      codeLines.push(line);
      i++;
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      flushList(list, out);
      list = null;
      i++;
      continue;
    }

    // Raw pasted SVG: <svg ...> ... </svg> — collected up to the closing tag.
    if (/^<svg[\s>]/i.test(trimmed)) {
      flushParagraph();
      flushList(list, out);
      list = null;
      if (faqMode) flushFaq();
      const svgLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        svgLines.push(lines[j]);
        if (/<\/svg>/i.test(lines[j])) break;
        j++;
      }
      out.push(renderSvgFigure(svgLines.join("\n"), ""));
      i = j + 1;
      continue;
    }

    // Callout box: :::tip Optional title ... :::
    const calloutOpen = CALLOUT_OPEN.exec(trimmed);
    if (calloutOpen) {
      flushParagraph();
      flushList(list, out);
      list = null;
      if (faqMode) flushFaq();
      const kind = calloutOpen[1].toLowerCase();
      const title = calloutOpen[2].trim();
      const inner: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ":::") {
        inner.push(lines[j]);
        j++;
      }
      const style = CALLOUT_STYLES[kind];
      const innerHtml = renderBlocks(inner, shared);
      out.push(
        `<aside class="blog-callout my-6 rounded-xl border-l-4 px-4 py-3 ${style.box}"><p class="mb-1 text-xs font-bold uppercase tracking-wide ${style.tag}">${escapeHtml(style.label)}${title ? ` · <span class="normal-case tracking-normal text-foreground">${renderInline(title)}</span>` : ""}</p><div class="blog-callout-body [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">${innerHtml}</div></aside>`,
      );
      i = j + 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList(list, out);
      list = null;
      if (faqMode) flushFaq();

      const level = heading[1].length + 1; // Markdown h1 maps to h2
      const headingText = heading[2];
      const id = nextHeadingId(headingText);
      const headingClasses = level === 2 ? "text-xl sm:text-2xl font-bold mt-8 mb-4" : "text-lg sm:text-xl font-bold mt-6 mb-3";
      out.push(
        `<h${level} id="${id}" class="blog-heading ${headingClasses} tracking-tight break-words [overflow-wrap:anywhere] scroll-mt-24">${renderInline(headingText)}</h${level}>`
      );

      if (FAQ_HEADING_PATTERN.test(stripInlineMarkdown(headingText))) {
        faqMode = true;
        faqItems = [];
      }
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList(list, out);
      list = null;
      if (faqMode) flushFaq();
      out.push('<hr class="blog-rule my-8 border-foreground/10" />');
      i++;
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push(`<blockquote class="blog-quote my-6 border-l-4 border-foreground/20 pl-4 italic text-foreground/80 break-words [overflow-wrap:anywhere]">${renderInline(quote[1])}</blockquote>`);
      i++;
      continue;
    }

    const standaloneImage = /^!\[[^\]]*\]\([^)]+\)$/.exec(trimmed);
    if (standaloneImage) {
      flushParagraph();
      flushList(list, out);
      list = null;
      const imgParts = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
      const imgCaption = imgParts ? parseImageTarget(imgParts[2]).caption : "";
      out.push(
        `<figure class="blog-figure my-6">${renderInline(trimmed)}${imgCaption ? `<figcaption class="mt-2 text-center text-xs text-foreground/60">${renderInline(imgCaption)}</figcaption>` : ""}</figure>`,
      );
      i++;
      continue;
    }

    // Tables — a header row immediately followed by a valid separator row.
    if (isTableRowLine(trimmed) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      flushParagraph();
      flushList(list, out);
      list = null;
      const headerLine = trimmed;
      const sepLine = lines[i + 1].trim();
      const bodyLines: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== "" && isTableRowLine(lines[j].trim())) {
        bodyLines.push(lines[j].trim());
        j++;
      }
      out.push(renderTable(headerLine, sepLine, bodyLines));
      i = j;
      continue;
    }

    const ulItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ulItem) {
      flushParagraph();
      if (list && list.kind !== "ul") flushList(list, out);
      if (!list || list.kind !== "ul") list = { kind: "ul", items: [] };
      list.items.push(ulItem[1]);
      i++;
      continue;
    }

    const olItem = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (olItem) {
      flushParagraph();
      if (list && list.kind !== "ol") flushList(list, out);
      if (!list || list.kind !== "ol") list = { kind: "ol", items: [] };
      list.items.push(olItem[1]);
      i++;
      continue;
    }

    flushList(list, out);
    list = null;
    paragraph.push(trimmed);
    i++;
  }

  flushParagraph();
  flushList(list, out);
  if (faqMode) flushFaq();
  if (inCodeFence && codeLines.length > 0) emitFence();

  return out.join("\n");
}

// A ```math fence is display math without needing $$ delimiters.
function stashMathBlockHtml(expr: string): string {
  const token = stashMath(expr, true);
  return restoreMathHtml(token);
}

export function renderBlogMarkdownToHtml(markdown: string): string {
  mathStore = [];
  const normalized = markdown.replace(/\r\n/g, "\n");
  const withMathStashed = extractMath(normalized);
  const html = renderBlocks(withMathStashed.split("\n"), { headingIdCounts: new Map(), faqBlockIndex: 0 });
  mathStore = [];
  return html;
}

const WORDS_PER_MINUTE = 200;

// SVG source and LaTeX are markup, not prose — counting their characters as
// "words" would make a diagram-heavy post look like a 40-minute read.
function stripNonProse(markdown: string): string {
  return markdown
    .replace(/```(?:svg|math|latex|tex)[^\n]*\n[\s\S]*?```/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/\$\$[\s\S]+?\$\$/g, " ");
}

export function estimateReadingTimeMinutes(markdown: string): number {
  const words = stripNonProse(markdown).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function stripMarkdownToText(markdown: string): string {
  return stripNonProse(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function BlogBody({ markdown, className }: { markdown: string; className?: string }) {
  const html = renderBlogMarkdownToHtml(markdown);
  return (
    <div
      className={`blog-body max-w-full break-words [overflow-wrap:anywhere] ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}