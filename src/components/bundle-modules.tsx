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
} from "lucide-react";
import {
  createBundle,
  listBundles,
  updateBundle,
  postBundleAnnouncement,
  listBundleAnnouncements,
} from "@/server-functions/admin";

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

// ─── Multi-URL node input — shared by Syllabus PDFs and Planner URLs ───────
function MultiUrlField({
  label,
  urls,
  onChange,
  placeholder,
}: {
  label: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  placeholder: string;
}) {
  function updateAt(i: number, value: string) {
    const next = [...urls];
    next[i] = value;
    onChange(next);
  }
  function removeAt(i: number) {
    onChange(urls.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...urls, ""]);
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      <div className="space-y-2">
        {urls.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={u}
              onChange={(e) => updateAt(i, e.target.value)}
              placeholder={placeholder}
              className={inputClass}
            />
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
      </div>
    </div>
  );
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

  // Dual-timeline trackers — distinct concepts kept visually separated:
  // the Upload Duration Window is when new tests/content can still be added
  // to this bundle, while Expiry Date is when a student's access to the
  // bundle itself ends. Conflating the two would silently lock out content
  // uploads at the wrong time.
  const [uploadWindowStart, setUploadWindowStart] = useState("");
  const [uploadWindowEnd, setUploadWindowEnd] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const [syllabusPdfUrls, setSyllabusPdfUrls] = useState<string[]>([""]);
  const [plannerUrls, setPlannerUrls] = useState<string[]>([""]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateFeature(i: number, value: string) {
    const next = [...features];
    next[i] = value;
    setFeatures(next);
  }

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

    if (!title.trim()) return setError("Enter a bundle title.");
    if (exam === "cuet" && !domainSubject.trim()) return setError("Enter the CUET domain subject for this bundle.");
    const cleanFeatures = features.map((f) => f.trim()).filter(Boolean);
    if (cleanFeatures.length < 2) return setError("Add at least 2 marketing feature pointers.");

    const selling = Number(sellingPrice);
    const crossed = Number(crossedPrice);
    if (!selling || selling <= 0) return setError("Enter a valid selling price.");
    if (!crossed || crossed <= selling) return setError("Crossed price must be higher than the selling price.");

    if (!uploadWindowStart || !uploadWindowEnd) return setError("Set both ends of the Upload Duration Window.");
    if (new Date(uploadWindowEnd) <= new Date(uploadWindowStart)) {
      return setError("Upload window end must be after its start.");
    }
    if (!expiryDate) return setError("Set the student access Expiry Date.");
    if (new Date(expiryDate) <= new Date(uploadWindowEnd)) {
      return setError("Expiry Date should be after the Upload Duration Window closes.");
    }

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
            features: cleanFeatures,
            sellingPrice: selling,
            crossedPrice: crossed,
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
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Bundle details
            </h2>
          </div>

          <div className="space-y-4">
            <ClayField label="Bundle thumbnail URL">
              <input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://…/thumbnail.jpg"
                className={inputClass}
              />
            </ClayField>

            <ClayField label="Bundle title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
                    onClick={() => setTrack(t)}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                      track === t ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
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
                    onClick={() => setExam(e)}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                      exam === e ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
                    }`}
                  >
                    {EXAM_LABELS[e]}
                  </button>
                ))}
              </div>
            </ClayField>

            {exam === "cuet" && (
              <ClayField label="CUET domain subject (e.g. Accountancy, General Test)">
                <input
                  value={domainSubject}
                  onChange={(e) => setDomainSubject(e.target.value)}
                  placeholder="e.g. Accountancy"
                  className={inputClass}
                />
              </ClayField>
            )}

            <ClayField label="Marketing features (2-3 pointers)">
              <div className="space-y-2">
                {features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={f}
                      onChange={(e) => updateFeature(i, e.target.value)}
                      placeholder={`Feature ${i + 1}`}
                      className={inputClass}
                    />
                    {features.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setFeatures(features.filter((_, idx) => idx !== i))}
                        className="text-foreground/40 hover:text-foreground/70"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {features.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setFeatures([...features, ""])}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add feature
                  </button>
                )}
              </div>
            </ClayField>
          </div>
        </div>

        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Pricing
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ClayField label="Selling price (₹)">
              <input
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                inputMode="numeric"
                placeholder="4999"
                className={inputClass}
              />
            </ClayField>
            <ClayField label="Dummy crossed price (₹)">
              <input
                value={crossedPrice}
                onChange={(e) => setCrossedPrice(e.target.value)}
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
                  value={uploadWindowStart}
                  onChange={(e) => setUploadWindowStart(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="date"
                  value={uploadWindowEnd}
                  onChange={(e) => setUploadWindowEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <ClayField label="Expiry date — when student access to this bundle ends">
              <div className="relative">
                <CalendarX2 className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
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
            <MultiUrlField
              label="Syllabus PDFs"
              urls={syllabusPdfUrls}
              onChange={setSyllabusPdfUrls}
              placeholder="https://…/syllabus.pdf"
            />
            <MultiUrlField
              label="Planner URLs"
              urls={plannerUrls}
              onChange={setPlannerUrls}
              placeholder="https://…/planner.pdf"
            />
          </div>
        </div>

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

// ─── Bundle Management (list, inline edit, and per-bundle announcement) ────
export function BundleManagementModule({ adminUser }: { adminUser: AdminUser }) {
  const [bundles, setBundles] = useState<BundleRow[] | null>(null);

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { bundles: rows } = await listBundles({ data: { token } });
    setBundles(rows as BundleRow[]);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  return (
    <div>
      <ModuleHeader
        title="Manage Bundles"
        subtitle="Edit pricing and timelines, or send a targeted announcement to a bundle's buyers."
      />

      {bundles === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
        </div>
      ) : bundles.length === 0 ? (
        <div className="clay p-6 text-center text-sm text-foreground/60">
          No bundles created yet — use "Create Bundle" to add your first one.
        </div>
      ) : (
        <div className="space-y-4">
          {bundles.map((b) => (
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
  const [sellingPrice, setSellingPrice] = useState(String(bundle.sellingPrice));
  const [crossedPrice, setCrossedPrice] = useState(String(bundle.crossedPrice));
  const [expiryDate, setExpiryDate] = useState(bundle.expiryDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [announceOpen, setAnnounceOpen] = useState(false);

  async function save() {
    setError(null);
    const selling = Number(sellingPrice);
    const crossed = Number(crossedPrice);
    if (!selling || selling <= 0) return setError("Enter a valid selling price.");
    if (!crossed || crossed <= selling) return setError("Crossed price must be higher than selling price.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateBundle({
        data: {
          token,
          id: bundle.id,
          bundle: { sellingPrice: selling, crossedPrice: crossed, expiryDate },
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
            <p className="font-display text-base font-bold text-foreground">{bundle.title}</p>
            <p className="text-xs text-foreground/50">
              {EXAM_LABELS[bundle.exam as ExamOption] ?? bundle.exam} · {bundle.track} · ₹{bundle.sellingPrice}{" "}
              <span className="line-through opacity-60">₹{bundle.crossedPrice}</span> · expires{" "}
              {new Date(bundle.expiryDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
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
        <div className="clay-inset mt-4 space-y-3 rounded-2xl p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              inputMode="numeric"
              placeholder="Selling price"
              className={inputClass}
            />
            <input
              value={crossedPrice}
              onChange={(e) => setCrossedPrice(e.target.value)}
              inputMode="numeric"
              placeholder="Crossed price"
              className={inputClass}
            />
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="clay-btn rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save"}
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

      {announceOpen && (
        <BundleAnnouncementPanel bundleId={bundle.id} adminUser={adminUser} />
      )}
    </div>
  );
}

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
}