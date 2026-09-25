// src/components/admin/blog-image-insert-field.tsx
//
// Deliberate near-duplicate of image-insert-field.tsx rather than a shared,
// parameterized component — same project convention as the rest of the
// blog feature (own file per concern). Inserts ![alt](url) into the body
// textarea, which blog-content.tsx's renderer already knows how to render.
import { useRef, useState } from "react";
import { IconPhoto as ImageIcon, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { uploadBlogImage, extractImageFromClipboard } from "@/lib/blog-image-upload";

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

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadBlogImage(file);
      const markdown = `![](${url})`;
      const el = textareaRef.current;
      if (el) {
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? value.length;
        onChange(value.slice(0, start) + markdown + value.slice(end));
      } else {
        onChange(value + markdown);
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
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
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="clay-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
          {uploading ? "Uploading…" : "Insert image"}
        </button>
        <span className="text-[11px] text-foreground/40">
          or paste (Ctrl+V) directly into the body — supports # headings, **bold**, lists, &gt; quotes, [links](url), ``` code
        </span>
      </div>
      {uploadError && <span className="text-[11px] text-rose-500">{uploadError}</span>}

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
