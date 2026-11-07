// src/lib/svg-safe.ts
//
// Inline SVG diagrams inside question text (body, options, solution). Authors paste markup like
//   <svg viewBox='0 0 330 225' ...><line .../><text ...>1</text></svg>
// straight into the question. formatInlineHtml escapes all HTML (on purpose), so without this the student saw the raw
// markup as text. This file turns such a block into SAFE inline SVG instead.
//
// SAFETY: nothing the author typed is passed through as-is. The block is re-built from a fixed list of drawing tags and
// attributes. Scripts, <style>, <foreignObject>, <image>, <use>, <a>, animations, event handlers (onload=...), links,
// data:/javascript: values and url() pointing anywhere except #id are all dropped. Text inside <text>/<tspan>/<title>/
// <desc> is HTML-escaped. Pure string code (no DOMParser), so it gives the same result on the server and in the browser.

/** Matches one complete <svg ...> ... </svg> block. Use with a fresh `lastIndex = 0` before looping. */
export const SVG_BLOCK = /<svg\b[\s\S]*?<\/svg\s*>/gi;

const TAGS = new Set([
  "svg", "g", "defs", "line", "rect", "circle", "ellipse", "path", "polygon", "polyline", "text", "tspan", "title", "desc",
  "marker", "lineargradient", "radialgradient", "stop", "clippath",
]);
// Elements whose whole content must be thrown away, not shown as text.
const DROP_CONTENT = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "animate", "set", "animatetransform", "animatemotion"]);
const TEXT_TAGS = new Set(["text", "tspan", "title", "desc"]);

const ATTRS = new Set(
  (
    "xmlns viewbox width height preserveaspectratio x y x1 y1 x2 y2 cx cy r rx ry d points transform " +
    "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity " +
    "font-family font-size font-weight font-style text-anchor dominant-baseline dx dy letter-spacing text-decoration " +
    "id marker-start marker-mid marker-end markerwidth markerheight refx refy orient markerunits " +
    "offset stop-color stop-opacity gradientunits gradienttransform fx fy clip-path clippathunits style"
  ).split(" "),
);

// Only these CSS properties survive in a style="" attribute (the typical `max-width:330px;background:#fff;border:...`).
const STYLE_PROPS = new Set(["max-width", "width", "height", "background", "background-color", "border", "border-radius", "display", "margin", "font-family", "font-size", "fill", "stroke", "stroke-width", "opacity"]);

function safeValue(v: string): string | null {
  const flat = v.replace(/[\u0000-\u0020\u007f-\u009f]+/g, "").toLowerCase();
  if (/javascript:|vbscript:|data:|expression\(|@import|&#|<|>/.test(flat)) return null;
  const urls = v.match(/url\([^)]*\)/gi) ?? [];
  if (urls.some((u) => !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(u))) return null;
  return v;
}

function safeStyle(v: string): string | null {
  const kept: string[] = [];
  for (const decl of v.split(";")) {
    const i = decl.indexOf(":");
    if (i < 1) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop) || !val) continue;
    if (!/^[\w\s.,#%()'"-]+$/.test(val) || /url\(|expression|javascript|import/i.test(val)) continue;
    kept.push(`${prop}:${val}`);
  }
  return kept.length ? kept.join(";") : null;
}

// Text keeps entities the author already wrote (&lt; &#176; ...) instead of double-escaping them.
const esc = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cleanAttrs(raw: string, isRoot: boolean): string {
  const out: string[] = [];
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4];
    if (value === undefined || !ATTRS.has(name.toLowerCase())) continue;
    const ok = name.toLowerCase() === "style" ? safeStyle(value) : safeValue(value);
    if (ok === null) continue;
    out.push(`${name}="${escAttr(ok)}"`);
  }
  if (isRoot) out.push('role="img"', 'aria-label="Diagram"', 'focusable="false"');
  return out.length ? " " + out.join(" ") : "";
}

/** Rebuild one `<svg>…</svg>` block as safe markup. Returns "" if nothing drawable is left. */
export function sanitizeSvg(raw: string): string {
  const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g;
  const out: string[] = [];
  const stack: string[] = [];
  let dropName: string | null = null;
  let dropDepth = 0;
  let rootDone = false;
  let m: RegExpExecArray | null;

  while ((m = TOKEN.exec(raw)) !== null) {
    const [, closing, rawName, attrs, text] = m;

    if (text !== undefined) {
      if (dropName === null && stack.length > 0 && TEXT_TAGS.has(stack[stack.length - 1].toLowerCase())) out.push(esc(text));
      continue;
    }
    if (!rawName) continue; // comment, CDATA or a stray "<"

    const name = rawName.toLowerCase();
    const selfClosing = /\/\s*$/.test(attrs ?? "");

    if (dropName !== null) {
      if (name === dropName) {
        if (closing) {
          dropDepth -= 1;
          if (dropDepth === 0) dropName = null;
        } else if (!selfClosing) dropDepth += 1;
      }
      continue;
    }
    if (DROP_CONTENT.has(name)) {
      if (!closing && !selfClosing) {
        dropName = name;
        dropDepth = 1;
      }
      continue;
    }
    if (!TAGS.has(name)) continue; // unknown tag: drop the tag itself, its allowed children are still handled

    if (closing) {
      const at = stack.map((t) => t.toLowerCase()).lastIndexOf(name);
      if (at === -1) continue;
      while (stack.length > at) out.push(`</${stack.pop()}>`);
      continue;
    }
    if (!rootDone && name !== "svg") continue;
    const isRoot = !rootDone;
    rootDone = true;
    const a = cleanAttrs((attrs ?? "").replace(/\/\s*$/, ""), isRoot);
    if (selfClosing) out.push(`<${rawName}${a}/>`);
    else {
      out.push(`<${rawName}${a}>`);
      stack.push(rawName);
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  const html = out.join("");
  // Nothing drawable left (empty block, or everything was stripped): show nothing rather than an empty box.
  return /^<svg[\s>]/i.test(html) && /<(?:line|rect|circle|ellipse|path|polygon|polyline|text)\b/i.test(html) ? html : "";
}
