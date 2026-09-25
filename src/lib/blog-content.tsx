// src/lib/blog-content.tsx
//
// A hand-rolled markdown → HTML renderer for EduRack.
// Safe HTML output with support for headings, lists, code blocks, quotes,
// images, links, custom inline CTA buttons, and responsive text wrapping.

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

        // Custom CTA Button Syntax: [button:Button Label](https://...)
        if (label.startsWith("button:")) {
          const buttonText = label.replace(/^button:/, "").trim();
          const external = /^https?:\/\//i.test(url.trim());
          const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
          return `<span class="my-6 block text-center"><a href="${escapeHtml(url.trim())}"${relAttr} class="inline-flex items-center justify-center rounded-xl bg-foreground px-6 py-3 text-sm font-bold text-background shadow-md transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]">${escapeHtml(buttonText)} →</a></span>`;
        }

        const external = /^https?:\/\//i.test(url.trim());
        const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeHtml(url.trim())}"${relAttr} class="font-medium text-primary underline underline-offset-4 break-all">${escapeHtml(label)}</a>`;
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

export function renderBlogMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: ListState = null;
  let inCodeFence = false;
  let codeLines: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    out.push(`<p class="my-4 leading-relaxed break-words [overflow-wrap:anywhere]">${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = rawLine;

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
      const level = heading[1].length + 1; // Markdown h1 maps to h2
      const headingClasses = level === 2 ? "text-xl sm:text-2xl font-bold mt-8 mb-4" : "text-lg sm:text-xl font-bold mt-6 mb-3";
      out.push(`<h${level} class="blog-heading ${headingClasses} tracking-tight break-words [overflow-wrap:anywhere]">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push('<hr class="blog-rule my-8 border-foreground/10" />');
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push(`<blockquote class="blog-quote my-6 border-l-4 border-foreground/20 pl-4 italic text-foreground/80 break-words [overflow-wrap:anywhere]">${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    const standaloneImage = /^!\[[^\]]*\]\([^)]+\)$/.exec(trimmed);
    if (standaloneImage) {
      flushParagraph();
      flushList(list, out);
      list = null;
      out.push(`<figure class="blog-figure my-6">${renderInline(trimmed)}</figure>`);
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