// src/components/admin/image-insert-field.tsx
import { useRef, useState } from "react";
import { IconPhoto as ImageIcon, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { uploadQuestionImage, extractImageFromClipboard } from "@/lib/question-image-upload";

export function ImageInsertField({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  compact = false, // true for MCQ options — single line, icon-only trigger
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className: string;
  compact?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadQuestionImage(file);
      const markdown = `![diagram](${url})`;
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
    <div className={compact ? "relative flex-1" : "relative"}>
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
        rows={compact ? 1 : rows}
        placeholder={placeholder}
        className={compact ? `${className} resize-none pr-9` : className}
      />

      {compact ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Insert diagram (or paste directly into the field)"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="clay-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
            {uploading ? "Uploading…" : "Insert diagram"}
          </button>
          <span className="text-[11px] text-foreground/40">or paste (Ctrl+V) directly into the box</span>
        </div>
      )}
      {uploadError && (
        <span className={compact ? "absolute -bottom-4 left-0 text-[10px] text-rose-500" : "ml-2 text-[11px] text-rose-500"}>
          {uploadError}
        </span>
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