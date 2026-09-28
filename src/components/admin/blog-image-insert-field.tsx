// src/components/admin/blog-image-insert-field.tsx
//
// Deliberate near-duplicate of image-insert-field.tsx rather than a shared,
// parameterized component — same project convention as the rest of the
// blog feature (own file per concern). Inserts ![alt](url) into the body
// textarea, which blog-content.tsx's renderer already knows how to render.
import { useEffect, useRef, useState } from "react";
import {
  IconPhoto as ImageIcon,
  IconLoader2 as Loader2,
  IconClick as CtaIcon,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconMathFunction as MathIcon,
  IconCode as CodeIcon,
  IconInfoCircle as CalloutIcon,
} from "@tabler/icons-react";
import { uploadBlogImage, extractImageFromClipboard } from "@/lib/blog-image-upload";
import { BlogBody } from "@/lib/blog-content";

type CtaAlign = "left" | "center" | "right";
type CtaStyle = "primary" | "outline";
type ToolPanel = "cta" | "math" | "svg" | "callout" | null;
type CalloutKind = "note" | "tip" | "warning" | "important" | "example";

export function BlogImageInsertField({
  value,
  onChange,
  placeholder,
  rows = 14,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCaretRef = useRef<number>(0);

  // An uploaded image waits here — not yet in the body — until the admin
  // gives it alt text. Every reader who can't see the image (screen
  // reader users, and search crawlers) depends on that text; defaulting
  // to `![](url)` silently ships an unlabelled image every time.
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pendingImageAlt, setPendingImageAlt] = useState("");
  const altInputRef = useRef<HTMLInputElement>(null);

  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaAlign, setCtaAlign] = useState<CtaAlign>("center");
  const [ctaStyle, setCtaStyle] = useState<CtaStyle>("primary");

  // Rich-content tools (equation / SVG / callout). Only one panel is open at
  // a time; the CTA panel keeps its own flag (ctaOpen) for backward-compat.
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [mathSrc, setMathSrc] = useState("");
  const [mathDisplay, setMathDisplay] = useState(false);
  const [svgSrc, setSvgSrc] = useState("");
  const [svgCaption, setSvgCaption] = useState("");
  const [calloutKind, setCalloutKind] = useState<CalloutKind>("note");
  const [calloutTitle, setCalloutTitle] = useState("");
  const [calloutText, setCalloutText] = useState("");

  // The insert button is outside the textarea, so clicking it blurs the
  // field and loses selectionStart before we can read it — track the
  // caret on every interaction instead, so "insert at cursor" still means
  // wherever the admin was actually positioned, i.e. genuinely "in
  // between the block" they were writing, not always appended at the end.
  function trackCaret() {
    const el = textareaRef.current;
    if (el) lastCaretRef.current = el.selectionStart ?? value.length;
  }

  function insertAtCaret(markdown: string) {
    const pos = Math.min(lastCaretRef.current, value.length);
    // A block element (image or CTA) should sit on its own line — pad
    // with blank lines unless it's already at a clean paragraph boundary,
    // so it never fuses onto the end of the previous sentence.
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const leadGap = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const trailGap = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    onChange(before + leadGap + markdown + trailGap + after);
  }

  // Inline insert (no blank-line padding) — used for $...$ math that has to
  // sit inside a sentence rather than on its own line.
  function insertInline(text: string) {
    const pos = Math.min(lastCaretRef.current, value.length);
    onChange(value.slice(0, pos) + text + value.slice(pos));
  }

  function togglePanel(next: Exclude<ToolPanel, null>) {
    setCtaOpen(false);
    setPanel((cur) => (cur === next ? null : next));
  }

  function handleInsertMath() {
    const expr = mathSrc.trim();
    if (!expr) return;
    if (mathDisplay) insertAtCaret(`$$\n${expr}\n$$`);
    else insertInline(`$${expr}$`);
    setMathSrc("");
    setPanel(null);
  }

  function handleInsertSvg() {
    const code = svgSrc.trim();
    if (!code) return;
    const cap = svgCaption.trim().replace(/\n/g, " ");
    insertAtCaret("```svg" + (cap ? ` ${cap}` : "") + "\n" + code + "\n```");
    setSvgSrc("");
    setSvgCaption("");
    setPanel(null);
  }

  function handleInsertCallout() {
    const title = calloutTitle.trim();
    insertAtCaret(`:::${calloutKind}${title ? ` ${title}` : ""}\n${calloutText.trim() || "Write the callout text here."}\n:::`);
    setCalloutTitle("");
    setCalloutText("");
    setPanel(null);
  }

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadBlogImage(file);
      setPendingImageUrl(url);
      setPendingImageAlt("");
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function confirmPendingImage() {
    if (!pendingImageUrl) return;
    const alt = pendingImageAlt.trim();
    // Square brackets would break the ![]() syntax if left in the alt
    // text — swap them for parentheses rather than silently truncating.
    const safeAlt = alt.replace(/\[/g, "(").replace(/\]/g, ")");
    insertAtCaret(`![${safeAlt}](${pendingImageUrl})`);
    setPendingImageUrl(null);
    setPendingImageAlt("");
  }

  function cancelPendingImage() {
    setPendingImageUrl(null);
    setPendingImageAlt("");
  }

  useEffect(() => {
    if (pendingImageUrl) altInputRef.current?.focus();
  }, [pendingImageUrl]);

  function handleInsertCta() {
    if (!ctaLabel.trim() || !ctaUrl.trim()) return;
    const modifiers = [ctaAlign !== "center" ? ctaAlign : "", ctaStyle !== "primary" ? ctaStyle : ""].filter(Boolean);
    const labelToken = modifiers.length > 0 ? `${ctaLabel.trim()}|${modifiers.join("|")}` : ctaLabel.trim();
    insertAtCaret(`[button:${labelToken}](${ctaUrl.trim()})`);
    setCtaLabel("");
    setCtaUrl("");
    setCtaAlign("center");
    setCtaStyle("primary");
    setCtaOpen(false);
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const file = extractImageFromClipboard(e);
          if (file) {
            e.preventDefault();
            insertImage(file);
          }
        }}
        onSelect={trackCaret}
        onKeyUp={trackCaret}
        onClick={trackCaret}
        onBlur={trackCaret}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="clay-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
          {uploading ? "Uploading…" : "Insert image"}
        </button>

        <button
          type="button"
          onClick={() => {
            setPanel(null);
            setCtaOpen((v) => !v);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
            ctaOpen ? "bg-foreground text-background" : "clay-chip text-foreground/60"
          }`}
        >
          <CtaIcon className="h-3 w-3" />
          Insert CTA button
        </button>

        {(
          [
            { key: "math" as const, label: "Equation / LaTeX", Icon: MathIcon },
            { key: "svg" as const, label: "SVG code", Icon: CodeIcon },
            { key: "callout" as const, label: "Callout box", Icon: CalloutIcon },
          ]
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => togglePanel(key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
              panel === key ? "bg-foreground text-background" : "clay-chip text-foreground/60"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}

        <span className="text-[11px] text-foreground/40">
          or paste (Ctrl+V) directly into the body — supports # headings, **bold**, lists, &gt; quotes, [links](url), ``` code,
          $LaTeX$, pasted &lt;svg&gt; code and images (SVG files too)
        </span>
      </div>
      {uploadError && <span className="text-[11px] text-rose-500">{uploadError}</span>}

      {pendingImageUrl && (
        <div className="clay-inset mt-2 space-y-2.5 rounded-2xl p-3.5">
          <div className="flex items-center gap-3">
            <img src={pendingImageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <label htmlFor="blog-image-alt-input" className="mb-1 block text-[11px] font-semibold text-foreground/60">
                Alt text <span className="font-normal text-foreground/40">— describe what's in the image, for screen readers and search</span>
              </label>
              <input
                id="blog-image-alt-input"
                ref={altInputRef}
                value={pendingImageAlt}
                onChange={(e) => setPendingImageAlt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmPendingImage();
                  }
                  if (e.key === "Escape") cancelPendingImage();
                }}
                placeholder="e.g. Bar chart comparing Physics chapter weightage in JEE Main 2025 and 2026"
                className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={confirmPendingImage}
              disabled={!pendingImageAlt.trim()}
              className="clay-btn rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-40"
            >
              Insert image
            </button>
            <button type="button" onClick={cancelPendingImage} className="text-[11px] font-semibold text-foreground/40 hover:text-foreground/70">
              Discard
            </button>
          </div>
        </div>
      )}

      {panel === "math" && (
        <div className="clay-inset mt-2 space-y-2.5 rounded-2xl p-3.5">
          <p className="text-[11px] font-semibold text-foreground/50">
            Type LaTeX without the $ signs. Chemistry works too: \ce{"{2H2 + O2 -> 2H2O}"}. Inline math lands at your cursor inside the
            sentence; display math goes on its own centred line.
          </p>
          <textarea
            value={mathSrc}
            onChange={(e) => setMathSrc(e.target.value)}
            rows={3}
            placeholder="e.g. \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
            className="w-full resize-y rounded-xl bg-background px-3 py-2 font-mono text-xs focus:outline-none"
          />
          <div className="flex overflow-hidden rounded-lg border border-foreground/10 text-[11px] font-semibold w-fit">
            {([false, true] as const).map((d) => (
              <button
                key={String(d)}
                type="button"
                onClick={() => setMathDisplay(d)}
                className={`px-3 py-1.5 ${mathDisplay === d ? "bg-foreground text-background" : "bg-background text-foreground/50 hover:text-foreground"}`}
              >
                {d ? "Display (own line)" : "Inline (in sentence)"}
              </button>
            ))}
          </div>
          {mathSrc.trim() && (
            <div className="rounded-xl bg-background px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Preview</p>
              <BlogBody markdown={mathDisplay ? `$$\n${mathSrc}\n$$` : `$${mathSrc}$`} />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleInsertMath} disabled={!mathSrc.trim()} className="clay-btn rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-40">
              Insert
            </button>
            <button type="button" onClick={() => setPanel(null)} className="text-[11px] font-semibold text-foreground/40 hover:text-foreground/70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === "svg" && (
        <div className="clay-inset mt-2 space-y-2.5 rounded-2xl p-3.5">
          <p className="text-[11px] font-semibold text-foreground/50">
            Paste the full &lt;svg&gt;…&lt;/svg&gt; code. It is shown as a picture, so scripts inside it never run. (Have an .svg
            file instead? Use “Insert image” — SVG files upload as-is and stay sharp.)
          </p>
          <textarea
            value={svgSrc}
            onChange={(e) => setSvgSrc(e.target.value)}
            rows={6}
            placeholder={'<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">…</svg>'}
            className="w-full resize-y rounded-xl bg-background px-3 py-2 font-mono text-xs focus:outline-none"
          />
          <input
            value={svgCaption}
            onChange={(e) => setSvgCaption(e.target.value)}
            placeholder="Caption / description (shown under the figure, and read by screen readers)"
            className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
          />
          {svgSrc.trim() && (
            <div className="rounded-xl bg-background px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Preview</p>
              <BlogBody markdown={"```svg" + (svgCaption.trim() ? ` ${svgCaption.trim()}` : "") + "\n" + svgSrc.trim() + "\n```"} />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleInsertSvg} disabled={!svgSrc.trim()} className="clay-btn rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-40">
              Insert
            </button>
            <button type="button" onClick={() => setPanel(null)} className="text-[11px] font-semibold text-foreground/40 hover:text-foreground/70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === "callout" && (
        <div className="clay-inset mt-2 space-y-2.5 rounded-2xl p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {(["note", "tip", "warning", "important", "example"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setCalloutKind(k)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${calloutKind === k ? "bg-foreground text-background" : "bg-background text-foreground/60"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <input
            value={calloutTitle}
            onChange={(e) => setCalloutTitle(e.target.value)}
            placeholder="Optional title — e.g. Formula to remember"
            className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
          />
          <textarea
            value={calloutText}
            onChange={(e) => setCalloutText(e.target.value)}
            rows={3}
            placeholder="Callout text — markdown, $math$ and images all work inside"
            className="w-full resize-y rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
          />
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleInsertCallout} className="clay-btn rounded-full px-4 py-1.5 text-[11px] font-bold">
              Insert
            </button>
            <button type="button" onClick={() => setPanel(null)} className="text-[11px] font-semibold text-foreground/40 hover:text-foreground/70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {ctaOpen && (
        <div className="clay-inset mt-2 space-y-2.5 rounded-2xl p-3.5">
          <p className="text-[11px] font-semibold text-foreground/50">
            Drops a button exactly where your cursor was in the body — click into the text first to place it precisely.
          </p>
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Button name — e.g. Explore NEET batches"
            className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
          />
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="Link — e.g. /course/bundle/abc123 or a full https:// URL"
            className="w-full rounded-xl bg-background px-3 py-2 text-xs font-mono focus:outline-none"
          />

          <div className="flex items-center gap-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Position</p>
              <div className="flex overflow-hidden rounded-lg border border-foreground/10">
                {(
                  [
                    { v: "left" as const, Icon: IconAlignLeft },
                    { v: "center" as const, Icon: IconAlignCenter },
                    { v: "right" as const, Icon: IconAlignRight },
                  ]
                ).map(({ v, Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCtaAlign(v)}
                    aria-label={v}
                    className={`px-2.5 py-1.5 ${ctaAlign === v ? "bg-foreground text-background" : "bg-background text-foreground/50 hover:text-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Style</p>
              <div className="flex overflow-hidden rounded-lg border border-foreground/10 text-[11px] font-semibold">
                {(["primary", "outline"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCtaStyle(s)}
                    className={`px-2.5 py-1.5 capitalize ${ctaStyle === s ? "bg-foreground text-background" : "bg-background text-foreground/50 hover:text-foreground"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleInsertCta}
              disabled={!ctaLabel.trim() || !ctaUrl.trim()}
              className="clay-btn rounded-full px-4 py-1.5 text-[11px] font-bold disabled:opacity-40"
            >
              Insert
            </button>
            <button type="button" onClick={() => setCtaOpen(false)} className="text-[11px] font-semibold text-foreground/40 hover:text-foreground/70">
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
