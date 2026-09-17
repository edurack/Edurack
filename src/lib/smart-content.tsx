import katex from "katex";
import "katex/dist/katex.min.css";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MATH_PATTERN = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;

export function renderMixedLatexHtml(text: string): string {
  let html = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MATH_PATTERN.lastIndex = 0;
  while ((match = MATH_PATTERN.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const isDisplay = match[1] !== undefined;
    const expr = (match[1] ?? match[2] ?? "").trim();
    try {
      html += katex.renderToString(expr, { throwOnError: false, displayMode: isDisplay });
    } catch {
      html += escapeHtml(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

// Admin-inserted diagrams look like ![alt](url) — see image-insert-field.tsx
const IMAGE_MD_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g;

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

// Legacy support: fields saved before the diagram-upload feature existed
// may just be a bare URL with nothing else in the field.
function isBareImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && IMAGE_EXTENSION_PATTERN.test(trimmed);
}

type Segment = { type: "text"; html: string } | { type: "image"; url: string };

function splitIntoSegments(value: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  IMAGE_MD_PATTERN.lastIndex = 0;
  while ((match = IMAGE_MD_PATTERN.exec(value)) !== null) {
    const textChunk = value.slice(lastIndex, match.index);
    if (textChunk.trim()) segments.push({ type: "text", html: renderMixedLatexHtml(textChunk) });
    segments.push({ type: "image", url: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  const rest = value.slice(lastIndex);
  if (rest.trim()) segments.push({ type: "text", html: renderMixedLatexHtml(rest) });
  return segments;
}

export function SmartContent({
  value,
  className,
  eager = false,
}: {
  value: string;
  className?: string;
  // Pass true only for the question currently on screen, so its image
  // starts downloading immediately instead of waiting on the browser's
  // lazy-load viewport check. Leave false everywhere else (review lists,
  // off-screen options, past-attempt pages) so those don't compete for
  // bandwidth with what the student is actually looking at right now.
  eager?: boolean;
}) {
  const trimmed = value.trim();

  if (!trimmed) {
    return <p className={`italic text-foreground/30 ${className ?? ""}`}>Empty</p>;
  }

  if (isBareImageUrl(trimmed)) {
    return (
      <img
        src={trimmed}
        alt="Question asset"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`max-h-64 max-w-full rounded-xl object-contain ${className ?? ""}`}
      />
    );
  }

  const segments = splitIntoSegments(trimmed);

  // whitespace-pre-wrap: without it, the line breaks / blank lines / extra
  // indentation someone typed into the input box (e.g. "Step 1: ...\n\nStep
  // 2: ...") get collapsed by normal HTML whitespace rules and vanish on
  // render — the box shows exactly what was typed, but only pre-wrap makes
  // the browser actually render it that way.
  // break-words: without it, one long unbroken run of text (a long URL, a
  // run-on chemical formula, etc.) won't wrap and can push the container —
  // and anything sharing a flex row with it — wider than its box.
  const wrapClass = "whitespace-pre-wrap break-words";

  if (segments.length === 0) {
    return <p className={`${wrapClass} ${className ?? ""}`}>{trimmed}</p>;
  }

  // Pure text/LaTeX, no diagram — keep this as the cheap single-node path.
  if (segments.length === 1 && segments[0].type === "text") {
    return (
      <div className={`${wrapClass} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: segments[0].html }} />
    );
  }

  return (
    <div className={`${wrapClass} ${className ?? ""}`}>
      {segments.map((seg, i) =>
        seg.type === "image" ? (
          <img
            key={i}
            src={seg.url}
            alt="Question diagram"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="my-2 max-h-64 max-w-full rounded-xl object-contain"
          />
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />
        ),
      )}
    </div>
  );
}