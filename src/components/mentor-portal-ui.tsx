// Shared primitives for the mentor portal. Every module (Profile,
// Scheduler, Chat, Announcements, Library, Support, Overview) imports from
// here instead of redefining its own ModuleHeader/ClayField/inputClass —
// that duplication across 6+ files was why a spacing or color tweak meant
// hunting down and editing the same code six times.
//
// Deliberately built only on top of classes already used throughout the
// codebase (clay, clay-inset, clay-btn, clay-btn-ghost, clay-chip, the
// --sky-soft/--mint-soft/--coral-soft/--sky-deep CSS vars) rather than
// inventing new ones — nothing here requires a global CSS change.
import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2, Inbox, AlertCircle, CheckCircle2, Upload, X, Camera, FileText, Video } from "lucide-react";
import { uploadMentorImage, uploadMentorFile, uploadMentorLecture, MAX_IMAGE_BYTES, MAX_FILE_BYTES, MAX_LECTURE_BYTES, formatBytes } from "@/lib/mentor-uploads";

// ─── Shared input styling ──────────────────────────────────────────────
export const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

// ─── Page header — now supports an optional right-side action so a module
// can put e.g. a "New" button up top instead of burying it in a form. ────
export function ModuleHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── Field wrapper — adds an optional hint line under the input, which no
// version of this component had before despite several forms needing one. ─
export function ClayField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-foreground/40">{hint}</span>}
    </label>
  );
}

// ─── Panel — the "icon + uppercase title + card" wrapper that appeared,
// slightly differently written, in every single module. One version now. ──
export function Panel({
  icon: Icon,
  title,
  action,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`clay p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          <Icon className="h-4 w-4" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Stat chip — now with a `tone` prop so a metric can read as
// good/attention-needed/neutral at a glance instead of everything looking
// the same regardless of what the number means. ─────────────────────────
export function StatChip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "neutral" | "sky" | "mint" | "coral";
}) {
  const bg = {
    neutral: "",
    sky: "bg-[var(--sky-soft)]/40",
    mint: "bg-[var(--mint-soft)]/40",
    coral: "bg-[var(--coral-soft)]/40",
  }[tone];
  return (
    <div className={`clay-inset px-3 py-2.5 ${bg}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

// ─── Loading / empty / error / success states — every module hand-rolled
// its own spinner div and its own banner styling with tiny inconsistencies
// (different padding, different icon-or-no-icon). One version now. ──────
export function LoadingBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex justify-center ${compact ? "py-6" : "py-12"}`}>
      <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, message }: { icon?: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <Icon className="h-5 w-5 text-foreground/30" />
      </div>
      <p className="text-sm text-foreground/60">{message}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="clay-inset flex items-center gap-2 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2.5 text-xs font-medium text-foreground">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <p className="clay-inset flex items-center gap-2 rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2.5 text-xs font-medium text-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

// ─── Real file upload fields ───────────────────────────────────────────
// Three variants matching the three Supabase buckets/caps this portal
// uses: images (50MB, thumbnail preview), generic files (100MB, PDFs —
// name only, no preview), and lectures (500MB, resumable with a progress
// bar since these can take minutes). Each just needs a label, current
// value (a URL, or empty string), an onChange, and a storage path prefix
// unique to whatever it's attached to (a mentor id, a batch id, etc.) —
// the actual upload always gets a fresh timestamped filename under that
// prefix, so replacing a file is always a new object, never an overwrite.

export function ImageUploadField({
  label,
  value,
  onChange,
  storagePath,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  storagePath: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");

    setUploading(true);
    try {
      const url = await uploadMentorImage(file, storagePath);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <ClayField label={label} hint={`Max ${formatBytes(MAX_IMAGE_BYTES)}`}>
      <div className="flex items-center gap-3">
        <div className="clay-inset flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          ) : value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5 text-foreground/30" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
            id={`img-upload-${storagePath}`}
          />
          <label
            htmlFor={disabled || uploading ? undefined : `img-upload-${storagePath}`}
            className={`clay-btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${
              disabled || uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {value ? "Replace photo" : "Upload photo"}
          </label>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground/40 hover:text-rose-600"
            >
              <X className="h-3 w-3" />
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </ClayField>
  );
}

export function FileUploadField({
  label,
  value,
  fileName,
  onChange,
  storagePath,
  accept = "application/pdf",
}: {
  label: string;
  value: string;
  fileName?: string;
  onChange: (url: string, fileName: string) => void;
  storagePath: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    setUploading(true);
    try {
      const url = await uploadMentorFile(file, storagePath);
      onChange(url, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <ClayField label={label} hint={`Max ${formatBytes(MAX_FILE_BYTES)}`}>
      <div className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          ) : (
            <FileText className="h-4 w-4 text-foreground/40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {value ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-medium text-[var(--sky-deep)] hover:underline"
            >
              {fileName || "Uploaded file"}
            </a>
          ) : (
            <span className="text-sm text-foreground/40">No file uploaded</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          id={`file-upload-${storagePath}`}
        />
        <label
          htmlFor={uploading ? undefined : `file-upload-${storagePath}`}
          className={`clay-btn-ghost inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${
            uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          {value ? "Replace" : "Upload"}
        </label>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </ClayField>
  );
}

export function LectureUploadField({
  label,
  value,
  onChange,
  storagePath,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  storagePath: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/")) return setError("Please choose a video file.");

    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadMentorLecture(file, storagePath, setProgress);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <ClayField
      label={label}
      hint={`Max ${formatBytes(MAX_LECTURE_BYTES)} — large files upload in the background and can resume if interrupted.`}
    >
      <div className="clay-inset rounded-2xl p-4">
        {value && !uploading && (
          <p className="mb-2 flex items-center gap-1.5 truncate text-xs font-medium text-[var(--sky-deep)]">
            <Video className="h-3.5 w-3.5 shrink-0" />
            Video uploaded
          </p>
        )}
        {uploading && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-foreground/60">
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-[var(--sky-deep)] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          id={`video-upload-${storagePath}`}
        />
        <label
          htmlFor={uploading ? undefined : `video-upload-${storagePath}`}
          className={`clay-btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${
            uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          {value ? "Replace video" : "Upload video"}
        </label>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </ClayField>
  );
}