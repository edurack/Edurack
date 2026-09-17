// Renders a question/option/solution body the way it's actually meant to
// look: markdown images (![alt](url)) become real <img> tags, $inline$
// and $$display$$ LaTeX become real KaTeX-rendered equations, everything
// else stays as plain wrapped text. Used anywhere someone (admin or
// intern) needs to SEE a question the way it'll finally render, not the
// raw source string.
//
// ASSUMPTION: ImageInsertField (your admin question-ingestion form) is
// assumed to insert standard markdown image syntax into the plain-text
// value it manages. If it actually uses a different syntax, only
// TOKEN_REGEX below needs to change — everything else stays the same.
//
// Requires the `katex` package: `npm install katex`.
import { useEffect, useMemo, useState } from "react";
import "katex/dist/katex.min.css";

type Segment =
  | { type: "text"; value: string }
  | { type: "mathInline"; value: string }
  | { type: "mathDisplay"; value: string }
  | { type: "image"; src: string; alt: string };

// Order matters: display math ($$...$$) must be tried before inline math
// ($...$) or the outer $$ would get eaten as two empty inline matches.
const TOKEN_REGEX =
  /(\$\$[\s\S]+?\$\$)|(\$[^$\n]+?\$)|(!\[[^\]]*\]\([^)]+\))|(https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|svg)(?=[\s)]|$))/g;

function tokenize(raw: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(raw))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: raw.slice(lastIndex, match.index) });
    }
    const [full, display, inline, mdImage, bareImage] = match;
    if (display) {
      segments.push({ type: "mathDisplay", value: display.slice(2, -2) });
    } else if (inline) {
      segments.push({ type: "mathInline", value: inline.slice(1, -1) });
    } else if (mdImage) {
      const m = /!\[([^\]]*)\]\(([^)]+)\)/.exec(mdImage);
      segments.push({ type: "image", alt: m?.[1] ?? "", src: m?.[2] ?? "" });
    } else if (bareImage) {
      segments.push({ type: "image", alt: "", src: bareImage });
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < raw.length) segments.push({ type: "text", value: raw.slice(lastIndex) });
  return segments;
}

function MathSpan({ latex, display }: { latex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("katex").then(({ default: katex }) => {
      if (cancelled) return;
      try {
        setHtml(katex.renderToString(latex, { throwOnError: false, displayMode: display }));
      } catch {
        setHtml(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [latex, display]);

  if (html === null) {
    // Rendering (or failed) — fall back to showing the raw source so
    // nothing silently disappears.
    return <span className="text-foreground/40">{display ? `$$${latex}$$` : `$${latex}$`}</span>;
  }
  return display ? (
    <div className="my-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function QuestionContentRenderer({ content, className }: { content: string; className?: string }) {
  const segments = useMemo(() => tokenize(content ?? ""), [content]);

  if (!content?.trim()) {
    return <span className="text-sm italic text-foreground/30">Nothing entered yet.</span>;
  }

  return (
    <div className={`whitespace-pre-wrap break-words text-sm text-foreground ${className ?? ""}`}>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        if (seg.type === "mathInline") return <MathSpan key={i} latex={seg.value} display={false} />;
        if (seg.type === "mathDisplay") return <MathSpan key={i} latex={seg.value} display />;
        return (
          <img
            key={i}
            src={seg.src}
            alt={seg.alt}
            className="my-2 max-h-72 max-w-full rounded-2xl border border-foreground/10 object-contain"
            loading="lazy"
          />
        );
      })}
    </div>
  );
}
