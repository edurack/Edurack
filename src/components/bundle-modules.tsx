import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  Package,
  Plus,
  X,
  FileText,
  CalendarClock,
  CalendarX2,
  Pencil,
  Megaphone,
  Search,
  Upload,
} from "lucide-react";
import {
  createBundle,
  listBundles,
  updateBundle,
  postBundleAnnouncement,
  listBundleAnnouncements,
} from "@/server-functions/admin";
import {
  BUNDLE_THUMBNAILS_BUCKET,
  BUNDLE_DOCUMENTS_BUCKET,
  MAX_BUNDLE_IMAGE_BYTES,
  MAX_BUNDLE_DOCUMENT_BYTES,
  uploadToSupabase,
} from "@/lib/supabase";

type AdminUser = { getIdToken: () => Promise<string> };
type TrackOption = "11th" | "12th" | "Dropper";
type ExamOption = "neet" | "jee" | "cuet" | "ipmat";

const EXAM_LABELS: Record<ExamOption, string> = {
  neet: "NEET",
  jee: "JEE",
  cuet: "CUET",
  ipmat: "IPMAT",
};

type BundleRow = {
  id: string;
  title: string;
  track: string;
  exam: string;
  domainSubject: string | null;
  features: string[];
  sellingPrice: number;
  crossedPrice: number;
  uploadWindowStart: string;
  uploadWindowEnd: string;
  expiryDate: string;
  thumbnailUrl: string | null;
  mentorId: string | null;
  marketingPercent: number | null;
  syllabusPdfUrls: string[];
  plannerUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ClayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

const textareaClass =
  "clay-inset w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function fileNameFromUrl(url: string) {
  try {
    const decoded = decodeURIComponent(url);
    const last = decoded.split("/").pop() ?? decoded;
    // Strip the "<timestamp>-<random>." prefix our uploader adds, so the
    // admin sees something readable instead of a generated blob name.
    return last.replace(/^\d+-[a-z0-9]+\./i, "");
  } catch {
    return url;
  }
}

// ─── Single-file upload field (bundle thumbnail) ────────────────────────────
function FileUploadField({
  label,
  bucket,
  accept,
  maxBytes,
  currentUrl,
  onUploaded,
}: {
  label: string;
  bucket: string;
  accept: string;
  maxBytes: number;
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > maxBytes) {
      setError(`File is too large — max ${Math.round(maxBytes / (1024 * 1024))}MB.`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToSupabase(bucket, file);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ClayField label={label}>
      <div className="space-y-2">
        {currentUrl && (
          <div className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-2.5">
            <img src={currentUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs font-medium text-[var(--sky-deep)] hover:underline"
            >
              {fileNameFromUrl(currentUrl)}
            </a>
            <button
              type="button"
              onClick={() => onUploaded("")}
              className="ml-auto shrink-0 text-foreground/40 hover:text-foreground/70"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <label className="clay-btn-ghost flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-foreground/70">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : currentUrl ? "Replace image" : "Upload image"}
          <input type="file" accept={accept} onChange={handleFile} className="hidden" disabled={uploading} />
        </label>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </ClayField>
  );
}

// ─── Multi-file upload field — shared by Syllabus PDFs and Planner docs ────
function MultiFileUploadField({
  label,
  bucket,
  accept,
  maxBytes,
  urls,
  onChange,
}: {
  label: string;
  bucket: string;
  accept: string;
  maxBytes: number;
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function removeAt(i: number) {
    onChange(urls.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...urls, ""]);
  }

  async function uploadAt(i: number, file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(`File is too large — max ${Math.round(maxBytes / (1024 * 1024))}MB.`);
      return;
    }
    setUploadingIndex(i);
    try {
      const url = await uploadToSupabase(bucket, file);
      const next = [...urls];
      next[i] = url;
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploadingIndex(null);
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      <div className="space-y-2">
        {urls.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            {u ? (
              <div className="clay-inset flex flex-1 items-center gap-2 rounded-2xl px-4 py-2.5">
                <FileText className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs font-medium text-[var(--sky-deep)] hover:underline"
                >
                  {fileNameFromUrl(u)}
                </a>
              </div>
            ) : (
              <label className="clay-btn-ghost flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-foreground/70">
                {uploadingIndex === i ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploadingIndex === i ? "Uploading…" : "Upload document"}
                <input
                  type="file"
                  accept={accept}
                  className="hidden"
                  disabled={uploadingIndex !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadAt(i, file);
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-foreground/40 hover:text-foreground/70"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Add document
        </button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

// ─── Shared field group — used by both Create and the full Edit panel ──────
// Keeping one definition means the create form and the edit form can never
// silently drift apart on which fields exist or how they're validated.
type BundleFieldsState = {
  title: string;
  setTitle: (v: string) => void;
  track: TrackOption;
  setTrack: (v: TrackOption) => void;
  exam: ExamOption;
  setExam: (v: ExamOption) => void;
  domainSubject: string;
  setDomainSubject: (v: string) => void;
  features: string[];
  setFeatures: (v: string[]) => void;
  sellingPrice: string;
  setSellingPrice: (v: string) => void;
  crossedPrice: string;
  setCrossedPrice: (v: string) => void;
  thumbnailUrl: string;
  setThumbnailUrl: (v: string) => void;
  uploadWindowStart: string;
  setUploadWindowStart: (v: string) => void;
  uploadWindowEnd: string;
  setUploadWindowEnd: (v: string) => void;
  expiryDate: string;
  setExpiryDate: (v: string) => void;
  syllabusPdfUrls: string[];
  setSyllabusPdfUrls: (v: string[]) => void;
  plannerUrls: string[];
  setPlannerUrls: (v: string[]) => void;
};

function BundleFieldsForm(s: BundleFieldsState) {
  function updateFeature(i: number, value: string) {
    const next = [...s.features];
    next[i] = value;
    s.setFeatures(next);
  }

  return (
    <div className="space-y-6">
      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Package className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Bundle details
          </h2>
        </div>

        <div className="space-y-4">
          <FileUploadField
            label="Bundle thumbnail"
            bucket={BUNDLE_THUMBNAILS_BUCKET}
            accept="image/*"
            maxBytes={MAX_BUNDLE_IMAGE_BYTES}
            currentUrl={s.thumbnailUrl}
            onUploaded={s.setThumbnailUrl}
          />

          <ClayField label="Bundle title">
            <input
              value={s.title}
              onChange={(e) => s.setTitle(e.target.value)}
              placeholder="e.g. NEET Dropper Full Test Series 2027"
              className={inputClass}
            />
          </ClayField>

          <ClayField label="Target audience">
            <div className="grid grid-cols-3 gap-2">
              {(["11th", "12th", "Dropper"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => s.setTrack(t)}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    s.track === t ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </ClayField>

          <ClayField label="Exam">
            <div className="grid grid-cols-4 gap-2">
              {(["neet", "jee", "cuet", "ipmat"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => s.setExam(e)}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    s.exam === e ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
                  }`}
                >
                  {EXAM_LABELS[e]}
                </button>
              ))}
            </div>
          </ClayField>

          {s.exam === "cuet" && (
            <ClayField label="CUET domain subject (e.g. Accountancy, General Test)">
              <input
                value={s.domainSubject}
                onChange={(e) => s.setDomainSubject(e.target.value)}
                placeholder="e.g. Accountancy"
                className={inputClass}
              />
            </ClayField>
          )}

          <ClayField label="Marketing features (2-3 pointers)">
            <div className="space-y-2">
              {s.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={f}
                    onChange={(e) => updateFeature(i, e.target.value)}
                    placeholder={`Feature ${i + 1}`}
                    className={inputClass}
                  />
                  {s.features.length > 2 && (
                    <button
                      type="button"
                      onClick={() => s.setFeatures(s.features.filter((_, idx) => idx !== i))}
                      className="text-foreground/40 hover:text-foreground/70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => s.setFeatures([...s.features, ""])}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add feature
              </button>
            </div>
          </ClayField>
        </div>
      </div>

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Pricing</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ClayField label="Selling price (₹)">
            <input
              value={s.sellingPrice}
              onChange={(e) => s.setSellingPrice(e.target.value)}
              inputMode="numeric"
              placeholder="4999"
              className={inputClass}
            />
          </ClayField>
          <ClayField label="Dummy crossed price (₹)">
            <input
              value={s.crossedPrice}
              onChange={(e) => s.setCrossedPrice(e.target.value)}
              inputMode="numeric"
              placeholder="7999"
              className={inputClass}
            />
          </ClayField>
        </div>
      </div>

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Dual timeline trackers
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Upload duration window — when tests can still be added to this bundle
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={s.uploadWindowStart}
                onChange={(e) => s.setUploadWindowStart(e.target.value)}
                className={inputClass}
              />
              <input
                type="date"
                value={s.uploadWindowEnd}
                onChange={(e) => s.setUploadWindowEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <ClayField label="Expiry date — when student access to this bundle ends">
            <div className="relative">
              <CalendarX2 className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
              <input
                type="date"
                value={s.expiryDate}
                onChange={(e) => s.setExpiryDate(e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
          </ClayField>
        </div>
      </div>

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Reference documents
          </h2>
        </div>
        <div className="space-y-5">
          <MultiFileUploadField
            label="Syllabus PDFs"
            bucket={BUNDLE_DOCUMENTS_BUCKET}
            accept="application/pdf"
            maxBytes={MAX_BUNDLE_DOCUMENT_BYTES}
            urls={s.syllabusPdfUrls}
            onChange={s.setSyllabusPdfUrls}
          />
          <MultiFileUploadField
            label="Planner documents"
            bucket={BUNDLE_DOCUMENTS_BUCKET}
            accept="application/pdf"
            maxBytes={MAX_BUNDLE_DOCUMENT_BYTES}
            urls={s.plannerUrls}
            onChange={s.setPlannerUrls}
          />
        </div>
      </div>
    </div>
  );
}

function validateBundleFields(s: {
  title: string;
  exam: ExamOption;
  domainSubject: string;
  features: string[];
  sellingPrice: string;
  crossedPrice: string;
  uploadWindowStart: string;
  uploadWindowEnd: string;
  expiryDate: string;
}): string | null {
  if (!s.title.trim()) return "Enter a bundle title.";
  if (s.exam === "cuet" && !s.domainSubject.trim()) return "Enter the CUET domain subject for this bundle.";
  const cleanFeatures = s.features.map((f) => f.trim()).filter(Boolean);
  if (cleanFeatures.length < 2) return "Add at least 2 marketing feature pointers.";

  const selling = Number(s.sellingPrice);
  const crossed = Number(s.crossedPrice);
  if (!selling || selling <= 0) return "Enter a valid selling price.";
  if (!crossed || crossed <= selling) return "Crossed price must be higher than the selling price.";

  if (!s.uploadWindowStart || !s.uploadWindowEnd) return "Set both ends of the Upload Duration Window.";
  if (new Date(s.uploadWindowEnd) <= new Date(s.uploadWindowStart)) {
    return "Upload window end must be after its start.";
  }
  if (!s.expiryDate) return "Set the student access Expiry Date.";
  if (new Date(s.expiryDate) <= new Date(s.uploadWindowEnd)) {
    return "Expiry Date should be after the Upload Duration Window closes.";
  }
  return null;
}

// ─── Module 1 & 2: Bundle Creation ───────────────────────────────────────────
export function BundleCreationModule({ adminUser }: { adminUser: AdminUser }) {
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState<TrackOption>("Dropper");
  const [exam, setExam] = useState<ExamOption>("neet");
  const [domainSubject, setDomainSubject] = useState("");
  const [features, setFeatures] = useState<string[]>(["", ""]);
  const [sellingPrice, setSellingPrice] = useState("");
  const [crossedPrice, setCrossedPrice] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [uploadWindowStart, setUploadWindowStart] = useState("");
  const [uploadWindowEnd, setUploadWindowEnd] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [syllabusPdfUrls, setSyllabusPdfUrls] = useState<string[]>([""]);
  const [plannerUrls, setPlannerUrls] = useState<string[]>([""]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function resetForm() {
    setTitle("");
    setTrack("Dropper");
    setExam("neet");
    setDomainSubject("");
    setFeatures(["", ""]);
    setSellingPrice("");
    setCrossedPrice("");
    setThumbnailUrl("");
    setUploadWindowStart("");
    setUploadWindowEnd("");
    setExpiryDate("");
    setSyllabusPdfUrls([""]);
    setPlannerUrls([""]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const validationError = validateBundleFields({
      title,
      exam,
      domainSubject,
      features,
      sellingPrice,
      crossedPrice,
      uploadWindowStart,
      uploadWindowEnd,
      expiryDate,
    });
    if (validationError) return setError(validationError);

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await createBundle({
        data: {
          token,
          bundle: {
            title: title.trim(),
            track,
            exam,
            domainSubject: exam === "cuet" ? domainSubject.trim() : null,
            features: features.map((f) => f.trim()).filter(Boolean),
            sellingPrice: Number(sellingPrice),
            crossedPrice: Number(crossedPrice),
            uploadWindowStart,
            uploadWindowEnd,
            expiryDate,
            thumbnailUrl: thumbnailUrl.trim() || null,
            syllabusPdfUrls: syllabusPdfUrls.map((u) => u.trim()).filter(Boolean),
            plannerUrls: plannerUrls.map((u) => u.trim()).filter(Boolean),
          },
        },
      });
      setSuccess(true);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the bundle. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Test Series Bundle Creator"
        subtitle="Package tests into a sellable bundle with pricing, timelines, and reference documents."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <BundleFieldsForm
          title={title}
          setTitle={setTitle}
          track={track}
          setTrack={setTrack}
          exam={exam}
          setExam={setExam}
          domainSubject={domainSubject}
          setDomainSubject={setDomainSubject}
          features={features}
          setFeatures={setFeatures}
          sellingPrice={sellingPrice}
          setSellingPrice={setSellingPrice}
          crossedPrice={crossedPrice}
          setCrossedPrice={setCrossedPrice}
          thumbnailUrl={thumbnailUrl}
          setThumbnailUrl={setThumbnailUrl}
          uploadWindowStart={uploadWindowStart}
          setUploadWindowStart={setUploadWindowStart}
          uploadWindowEnd={uploadWindowEnd}
          setUploadWindowEnd={setUploadWindowEnd}
          expiryDate={expiryDate}
          setExpiryDate={setExpiryDate}
          syllabusPdfUrls={syllabusPdfUrls}
          setSyllabusPdfUrls={setSyllabusPdfUrls}
          plannerUrls={plannerUrls}
          setPlannerUrls={setPlannerUrls}
        />

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
            Bundle created.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create bundle"}
        </button>
      </form>
    </div>
  );
}

// ─── Bundle Management (list, search, full edit, and per-bundle announcement) ──
export function BundleManagementModule({ adminUser }: { adminUser: AdminUser }) {
  const [bundles, setBundles] = useState<BundleRow[] | null>(null);
  const [query, setQuery] = useState("");

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { bundles: rows } = await listBundles({ data: { token } });
    setBundles(rows as BundleRow[]);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  const filtered = (bundles ?? []).filter((b) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      b.title.toLowerCase().includes(q) ||
      b.track.toLowerCase().includes(q) ||
      b.exam.toLowerCase().includes(q) ||
      (b.domainSubject ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <ModuleHeader
        title="Manage Bundles"
        subtitle="Edit any field, search by name, or send a targeted announcement to a bundle's buyers."
      />

      <div className="clay mb-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bundles by title, track, exam, or domain subject…"
            className={inputClass + " pl-10"}
          />
        </div>
        {bundles && (
          <p className="mt-2 text-xs text-foreground/50">
            {filtered.length} of {bundles.length} bundles
          </p>
        )}
      </div>

      {bundles === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      ) : bundles.length === 0 ? (
        <div className="clay p-6 text-center text-sm text-foreground/60">
          No bundles created yet — use "Create Bundle" to add your first one.
        </div>
      ) : filtered.length === 0 ? (
        <div className="clay p-6 text-center text-sm text-foreground/60">No bundles match your search.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((b) => (
            <BundleCard key={b.id} bundle={b} adminUser={adminUser} onSaved={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function BundleCard({
  bundle,
  adminUser,
  onSaved,
}: {
  bundle: BundleRow;
  adminUser: AdminUser;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  // Full editable state — seeded from the bundle every time edit mode opens,
  // so re-opening after a save always starts from the latest saved values.
  const [title, setTitle] = useState(bundle.title);
  const [track, setTrack] = useState<TrackOption>(bundle.track as TrackOption);
  const [exam, setExam] = useState<ExamOption>(bundle.exam as ExamOption);
  const [domainSubject, setDomainSubject] = useState(bundle.domainSubject ?? "");
  const [features, setFeatures] = useState<string[]>(bundle.features.length ? bundle.features : ["", ""]);
  const [sellingPrice, setSellingPrice] = useState(String(bundle.sellingPrice));
  const [crossedPrice, setCrossedPrice] = useState(String(bundle.crossedPrice));
  const [thumbnailUrl, setThumbnailUrl] = useState(bundle.thumbnailUrl ?? "");
  const [uploadWindowStart, setUploadWindowStart] = useState(bundle.uploadWindowStart);
  const [uploadWindowEnd, setUploadWindowEnd] = useState(bundle.uploadWindowEnd);
  const [expiryDate, setExpiryDate] = useState(bundle.expiryDate);
  const [syllabusPdfUrls, setSyllabusPdfUrls] = useState<string[]>(
    bundle.syllabusPdfUrls.length ? bundle.syllabusPdfUrls : [""],
  );
  const [plannerUrls, setPlannerUrls] = useState<string[]>(bundle.plannerUrls.length ? bundle.plannerUrls : [""]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setTitle(bundle.title);
    setTrack(bundle.track as TrackOption);
    setExam(bundle.exam as ExamOption);
    setDomainSubject(bundle.domainSubject ?? "");
    setFeatures(bundle.features.length ? bundle.features : ["", ""]);
    setSellingPrice(String(bundle.sellingPrice));
    setCrossedPrice(String(bundle.crossedPrice));
    setThumbnailUrl(bundle.thumbnailUrl ?? "");
    setUploadWindowStart(bundle.uploadWindowStart);
    setUploadWindowEnd(bundle.uploadWindowEnd);
    setExpiryDate(bundle.expiryDate);
    setSyllabusPdfUrls(bundle.syllabusPdfUrls.length ? bundle.syllabusPdfUrls : [""]);
    setPlannerUrls(bundle.plannerUrls.length ? bundle.plannerUrls : [""]);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    const validationError = validateBundleFields({
      title,
      exam,
      domainSubject,
      features,
      sellingPrice,
      crossedPrice,
      uploadWindowStart,
      uploadWindowEnd,
      expiryDate,
    });
    if (validationError) return setError(validationError);

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateBundle({
        data: {
          token,
          id: bundle.id,
          bundle: {
            title: title.trim(),
            track,
            exam,
            domainSubject: exam === "cuet" ? domainSubject.trim() : null,
            features: features.map((f) => f.trim()).filter(Boolean),
            sellingPrice: Number(sellingPrice),
            crossedPrice: Number(crossedPrice),
            uploadWindowStart,
            uploadWindowEnd,
            expiryDate,
            thumbnailUrl: thumbnailUrl.trim() || null,
            syllabusPdfUrls: syllabusPdfUrls.map((u) => u.trim()).filter(Boolean),
            plannerUrls: plannerUrls.map((u) => u.trim()).filter(Boolean),
          },
        },
      });
      setEditing(false);
      onSaved();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

return (
    <div className="clay p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="clay-inset flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
            {bundle.thumbnailUrl ? (
              <img src={bundle.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-5 w-5 text-foreground/30" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-display text-base font-bold text-foreground">{bundle.title}</p>
              {bundle.mentorId && (
                <span className="clay-chip shrink-0 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                  Mentor-submitted
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/50">
              {EXAM_LABELS[bundle.exam as ExamOption] ?? bundle.exam} · {bundle.track} · ₹{bundle.sellingPrice}{" "}
              <span className="line-through opacity-60">₹{bundle.crossedPrice}</span> · expires{" "}
              {new Date(bundle.expiryDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => (editing ? setEditing(false) : openEdit())}
            className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
          >
            <Pencil className="h-3.5 w-3.5" /> {editing ? "Close edit" : "Edit"}
          </button>
          <button
            onClick={() => setAnnounceOpen((v) => !v)}
            className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
          >
            <Megaphone className="h-3.5 w-3.5" /> Announce
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 space-y-4">
          <BundleFieldsForm
            title={title}
            setTitle={setTitle}
            track={track}
            setTrack={setTrack}
            exam={exam}
            setExam={setExam}
            domainSubject={domainSubject}
            setDomainSubject={setDomainSubject}
            features={features}
            setFeatures={setFeatures}
            sellingPrice={sellingPrice}
            setSellingPrice={setSellingPrice}
            crossedPrice={crossedPrice}
            setCrossedPrice={setCrossedPrice}
            thumbnailUrl={thumbnailUrl}
            setThumbnailUrl={setThumbnailUrl}
            uploadWindowStart={uploadWindowStart}
            setUploadWindowStart={setUploadWindowStart}
            uploadWindowEnd={uploadWindowEnd}
            setUploadWindowEnd={setUploadWindowEnd}
            expiryDate={expiryDate}
            setExpiryDate={setExpiryDate}
            syllabusPdfUrls={syllabusPdfUrls}
            setSyllabusPdfUrls={setSyllabusPdfUrls}
            plannerUrls={plannerUrls}
            setPlannerUrls={setPlannerUrls}
          />

          {error && (
            <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="clay-btn rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save all changes"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs font-semibold text-foreground/50 hover:text-foreground/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {announceOpen && <BundleAnnouncementPanel bundleId={bundle.id} adminUser={adminUser} />}
    </div>
  );

type BundleAnnouncementRow = {
  id: string;
  bundleId: string;
  message: string | null;
  thumbnailUrl: string | null;
  sendAt: string | null;
  createdAt: string | null;
};

function BundleAnnouncementPanel({ bundleId, adminUser }: { bundleId: string; adminUser: AdminUser }) {
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<BundleAnnouncementRow[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { announcements } = await listBundleAnnouncements({ data: { token } });
    setRows((announcements as BundleAnnouncementRow[]).filter((a) => a.bundleId === bundleId));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);

  async function post() {
    setError(null);
    if (!message.trim()) return setError("Write a message first.");
    setPosting(true);
    try {
      const token = await adminUser.getIdToken();
      await postBundleAnnouncement({
        data: { token, announcement: { bundleId, message: message.trim(), thumbnailUrl: null, sendAt: null } },
      });
      setMessage("");
      await refresh();
    } catch {
      setError("Could not post. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="clay-inset mt-4 space-y-3 rounded-2xl p-4">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Write an announcement for buyers of this bundle…"
        className={textareaClass}
      />
      {error && (
        <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          {error}
        </p>
      )}
      <button
        onClick={post}
        disabled={posting}
        className="clay-btn rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-70"
      >
        {posting ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
        Post announcement
      </button>

      {rows && rows.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl bg-background/60 px-3 py-2 text-xs text-foreground/70">
              {a.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}}