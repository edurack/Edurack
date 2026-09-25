// src/lib/blog-content.tsx
//
// A deliberately hand-rolled markdown → HTML renderer, not a new npm
// dependency (react-markdown, remark, etc). This mirrors the project's
// existing pattern in smart-content.tsx: escape all raw text first, then
// build up ONLY the HTML this parser itself generates. Since only admins
// can author blog posts today, this is already safe — but "only admins
// can post" is a fact about today, not a guarantee, and this renderer
// costs nothing extra to keep safe regardless of who ends up writing
// posts later.
//
// Supports: # / ## / ### headings, **bold**, *italic*, `inline code`,
// [text](url) links, ![alt](url) images (same convention as
// blog-image-insert-field.tsx / the existing ImageInsertField), > blockquotes,
// - / * unordered lists, 1. ordered lists, ``` fenced code blocks, --- rules,
// and paragraphs. Anything it doesn't recognize is rendered as an escaped
// paragraph rather than silently dropped.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A safe-ish URL check — blocks javascript:/data: schemes in an authored
// link or image src so a compromised admin session can't turn a blog post
// into a stored-XSS vector via markdown link syntax.
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return /^https?:\/\//i.test(trimmed);
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
        return `<img src="${escapeHtml(url.trim())}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" class="blog-inline-image" />`;
      }

      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const [, label, url] = link;
        if (!isSafeUrl(url)) return escapeHtml(part);
        const external = /^https?:\/\//i.test(url.trim());
        const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeHtml(url.trim())}"${relAttr}>${escapeHtml(label)}</a>`;
      }

      if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
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
  out.push(`<${tag} class="blog-list">${state.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`);
}

export function renderBlogMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: ListState = null;
  let inCodeFence = false;
  let codeLines: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (inCodeFence) {
        out.push(`<pre class="blog-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCodeFence = false;
      } else {
        flushParagraph();
        flushList(list, out);
        list = null;
        inCodeFence = true;
      }
      continue;
    }
    if (inCodeFence) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      flushList(list, out);
      list = null;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList(list, out);
      list = null;
      const level = heading[1].length + 1; // markdown h1 stays out (post title IS the h1) — body headings start at h2
      out.push(`<h${level} class="blog-heading">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push('<hr class="blog-rule" />');
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push(`<blockquote class="blog-quote">${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    const standaloneImage = /^!\[[^\]]*\]\([^)]+\)$/.exec(trimmed);
    if (standaloneImage) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push(`<figure class="blog-figure">${renderInline(trimmed)}</figure>`);
      continue;
    }

    const ulItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ulItem) {
      flushParagraph();
      if (list && list.kind !== "ul") flushList(list, out);
      if (!list || list.kind !== "ul") list = { kind: "ul", items: [] };
      list.items.push(ulItem[1]);
      continue;
    }

    const olItem = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (olItem) {
      flushParagraph();
      if (list && list.kind !== "ol") flushList(list, out);
      if (!list || list.kind !== "ol") list = { kind: "ol", items: [] };
      list.items.push(olItem[1]);
      continue;
    }

    flushList(list, out);
    list = null;
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList(list, out);
  if (inCodeFence && codeLines.length > 0) {
    out.push(`<pre class="blog-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

// Used both server-side (blog-admin.ts, at save time — cached onto the
// post rather than recomputed on every render) and client-side (live word
// count in the editor). Pure string math, no DOM dependency either side.
const WORDS_PER_MINUTE = 200;

export function estimateReadingTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// Plain-text approximation of the body, used for the JSON-LD wordCount
// field and anywhere a markdown-free preview snippet is useful (never for
// the excerpt shown to readers — that should always be hand-written, see
// blog-types.ts).
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
  return <div className={`blog-body ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
