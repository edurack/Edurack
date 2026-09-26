// src/lib/blog-content.tsx
//
// A hand-rolled markdown → HTML renderer for EduRack.
// Safe HTML output with support for headings (with stable anchor ids),
// lists, tables, code blocks, quotes, images, links, custom inline CTA
// buttons, an accessible FAQ accordion, and responsive text wrapping.
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

// Strips the inline markdown syntax we support so heading text can be
// turned into a clean slug and into an accessible accordion <summary>.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
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

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;

function renderInline(text: string): string {
  const parts = text.split(INLINE_PATTERN);
  return parts
    .map((part) => {
      if (!part) return "";

      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
      if (image) {
        const [, alt, url] = image;
        if (!isSafeUrl(url)) return escapeHtml(part);
        return `<img src="${escapeHtml(url.trim())}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" class="blog-inline-image rounded-xl max-w-full h-auto my-4" />`;
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

      if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code class="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-mono">${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 1) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }

      return escapeHtml(part);
    })
    .join("");
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

export function renderBlogMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: ListState = null;
  let inCodeFence = false;
  let codeLines: string[] = [];
  const headingIdCounts = new Map<string, number>();

  // FAQ accordion state. See module doc comment above for the authoring
  // convention this implements.
  let faqMode = false;
  let faqBlockIndex = 0;
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
    faqBlockIndex++;
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
        out.push(`<pre class="blog-code-block my-6 overflow-x-auto rounded-xl bg-foreground/5 p-4 text-xs font-mono"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCodeFence = false;
      } else {
        flushParagraph();
        flushList(list, out);
        list = null;
        inCodeFence = true;
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
      out.push(`<figure class="blog-figure my-6">${renderInline(trimmed)}</figure>`);
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
  if (inCodeFence && codeLines.length > 0) {
    out.push(`<pre class="blog-code-block my-6 overflow-x-auto rounded-xl bg-foreground/5 p-4 text-xs font-mono"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

const WORDS_PER_MINUTE = 200;

export function estimateReadingTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function stripMarkdownToText(markdown: string): string {
  return markdown
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
