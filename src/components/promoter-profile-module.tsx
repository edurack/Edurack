// Profile photo uploads go through the shared uploadToSupabase() helper
// and the dedicated PROMOTER_UPLOADS_BUCKET (see @/lib/supabase) — its
// own bucket, not shared with mentor uploads.
import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  User,
  Mail,
  Link2,
  Wallet,
  Plus,
  X,
  Upload,
  ImageIcon,
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Layers3,
  IndianRupee,
  Send,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { uploadToSupabase, PROMOTER_UPLOADS_BUCKET, MAX_PROMOTER_IMAGE_BYTES } from "@/lib/supabase";
import { getMyPromoterProfile, updateMyPromoterProfile } from "@/server-functions/promoter-auth";
import { getMyProfileStats, requestPromoterPayout, getMyPayoutStatus } from "@/server-functions/promoter-portal";
import type { Promoter, PromoterProfileStats, PromoterSocialLink } from "@/lib/promoter-types";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <AlertCircle className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="max-w-sm text-sm text-foreground/60">{message}</p>
      <button
        onClick={onRetry}
        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/70">
        <Icon className="h-3.5 w-3.5 text-foreground/40" />
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function PromoterProfileModule({ getToken }: { getToken: () => string }) {
  const [profile, setProfile] = useState<Promoter | null>(null);
  const [stats, setStats] = useState<PromoterProfileStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const [profileResult, statsResult] = await Promise.all([
        getMyPromoterProfile({ data: { token: getToken() } }),
        getMyProfileStats({ data: { token: getToken() } }),
      ]);
      setProfile(profileResult.profile as Promoter);
      setStats(statsResult.stats);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <div className="clay-inset h-48 animate-pulse rounded-2xl bg-foreground/5" />
        <div className="clay-inset h-64 animate-pulse rounded-2xl bg-foreground/5" />
      </div>
    );
  }
  if (status === "error" || !profile || !stats) {
    return (
      <div className="clay p-5">
        <ErrorState message="Couldn't load your profile." onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-foreground/60">Your details, payout info, and earnings history.</p>
      </div>

      <ProfileForm getToken={getToken} profile={profile} onSaved={load} />
      <StatsPanel stats={stats} />
      <PayoutPanel getToken={getToken} joinedAt={stats.joinedAt} />
    </div>
  );
}

function ProfileForm({
  getToken,
  profile,
  onSaved,
}: {
  getToken: () => string;
  profile: Promoter;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [profilePictureUrl, setProfilePictureUrl] = useState(profile.profilePictureUrl ?? "");
  const [socialLinks, setSocialLinks] = useState<PromoterSocialLink[]>(
    profile.socialLinks.length ? profile.socialLinks : [{ platform: "Instagram", url: "" }],
  );
  const [upiIds, setUpiIds] = useState<string[]>(profile.upiIds.length ? profile.upiIds : [""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateSocialLink(i: number, field: "platform" | "url", value: string) {
    const next = [...socialLinks];
    next[i] = { ...next[i], [field]: value };
    setSocialLinks(next);
  }
  function updateUpi(i: number, value: string) {
    const next = [...upiIds];
    next[i] = value;
    setUpiIds(next);
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (!name.trim()) return setError("Enter your name.");
    if (!email.trim() || !email.includes("@")) return setError("Enter a valid email address.");

    setSaving(true);
    try {
      await updateMyPromoterProfile({
        data: {
          token: getToken(),
          profile: {
            name: name.trim(),
            profilePictureUrl: profilePictureUrl.trim() || null,
            email: email.trim(),
            socialLinks: socialLinks.filter((l) => l.url.trim()),
            upiIds: upiIds.filter((u) => u.trim()),
          },
        },
      });
      setSuccess(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="space-y-4">
        <PhotoUpload value={profilePictureUrl} onChange={setProfilePictureUrl} />

        <Field label="Full name" icon={User}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email" icon={Mail}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/70">
            <Link2 className="h-3.5 w-3.5 text-foreground/40" />
            Social links (where you'll promote)
          </p>
          <div className="space-y-2">
            {socialLinks.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.platform}
                  onChange={(e) => updateSocialLink(i, "platform", e.target.value)}
                  className={inputClass + " w-32 shrink-0 appearance-none"}
                >
                  {["Instagram", "YouTube", "Telegram", "LinkedIn", "X (Twitter)", "Other"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  value={l.url}
                  onChange={(e) => updateSocialLink(i, "url", e.target.value)}
                  placeholder="Profile link"
                  className={inputClass}
                />
                {socialLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSocialLinks(socialLinks.filter((_, idx) => idx !== i))}
                    className="text-foreground/40 hover:text-foreground/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSocialLinks([...socialLinks, { platform: "Instagram", url: "" }])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground/70">
            <Wallet className="h-3.5 w-3.5 text-foreground/40" />
            UPI IDs (for payment)
          </p>
          <div className="space-y-2">
            {upiIds.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={u}
                  onChange={(e) => updateUpi(i, e.target.value)}
                  placeholder="yourname@upi"
                  className={inputClass}
                />
                {upiIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setUpiIds(upiIds.filter((_, idx) => idx !== i))}
                    className="text-foreground/40 hover:text-foreground/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setUpiIds([...upiIds, ""])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add UPI ID
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">{error}</p>
        )}
        {success && (
          <p className="rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">Saved.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}

function PhotoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > MAX_PROMOTER_IMAGE_BYTES) {
      return setError(
        `That file is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_PROMOTER_IMAGE_BYTES)}.`,
      );
    }

    setUploading(true);
    try {
      const url = await uploadToSupabase(PROMOTER_UPLOADS_BUCKET, file);
      onChange(url);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <Field label="Profile photo" icon={User}>
        <div className="flex items-center gap-3">
          <div className="clay-inset relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            ) : value ? (
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-foreground/30" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="hidden"
              id="promoter-photo-upload"
            />
            <label
              htmlFor="promoter-photo-upload"
              className={`clay-btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${
                uploading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              {value ? "Replace photo" : "Upload photo"}
            </label>
            <p className="text-[11px] text-foreground/40">Max {formatBytes(MAX_PROMOTER_IMAGE_BYTES)}</p>
          </div>
        </div>
      </Field>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function StatsPanel({ stats }: { stats: PromoterProfileStats }) {
  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="clay-inset rounded-2xl px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            <CalendarDays className="h-3 w-3" /> Joined
          </p>
          <p className="text-sm font-bold text-foreground">{formatDate(stats.joinedAt)}</p>
        </div>
        <div className="clay-inset rounded-2xl px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            <Layers3 className="h-3 w-3" /> Batches opted
          </p>
          <p className="text-sm font-bold text-foreground">{stats.totalBatchesOpted}</p>
        </div>
        <div className="clay-inset rounded-2xl px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            <IndianRupee className="h-3 w-3" /> Total earned
          </p>
          <p className="text-sm font-bold text-foreground">{currency.format(stats.totalEarned)}</p>
        </div>
      </div>

      {stats.monthly.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">Monthly earnings</p>
          <ul className="space-y-1.5">
            {stats.monthly.map((m) => (
              <li key={m.month} className="clay-inset flex items-center justify-between rounded-2xl px-4 py-2 text-sm">
                <span className="text-foreground/70">{monthLabel(m.month)}</span>
                <span className="font-semibold text-foreground">{currency.format(m.amountEarned)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function suggestedPaymentDay(joinedAt: string | null): number {
  if (!joinedAt) return 1;
  return new Date(joinedAt).getDate();
}

function PayoutPanel({ getToken, joinedAt }: { getToken: () => string; joinedAt: string | null }) {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [existing, setExisting] = useState<{
    status: "pending" | "approved" | "rejected";
    requestedPaymentDay: number;
  } | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [day, setDay] = useState(suggestedPaymentDay(joinedAt));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const result = await getMyPayoutStatus({ data: { token: getToken() } });
      setExisting(result.request);
    } finally {
      setStatus("ready");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await requestPromoterPayout({ data: { token: getToken(), requestedPaymentDay: day } });
      setShowPopup(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="clay p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Payments</h2>

      {status === "loading" ? (
        <div className="clay-inset h-12 animate-pulse rounded-2xl bg-foreground/5" />
      ) : existing ? (
        <div className="clay-inset flex items-center gap-2 rounded-2xl px-4 py-3">
          {existing.status === "pending" && <Clock className="h-4 w-4 text-foreground/50" />}
          {existing.status === "approved" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <p className="text-sm text-foreground/70">
            {existing.status === "pending" &&
              `Payout on the ${existing.requestedPaymentDay}th of each month — awaiting admin approval.`}
            {existing.status === "approved" &&
              `Payout scheduled for the ${existing.requestedPaymentDay}th of each month.`}
            {existing.status === "rejected" && "Your last payout request was declined — you can submit a new one below."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-foreground/60">No payout schedule set up yet.</p>
      )}

      {(!existing || existing.status === "rejected") && (
        <button
          onClick={() => setShowPopup(true)}
          className="clay-btn mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          <Send className="h-4 w-4" />
          Request Payment
        </button>
      )}

      {showPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowPopup(false)}
        >
          <div className="clay w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-bold text-foreground">Set your payment day</h3>
            <p className="mt-1 text-xs text-foreground/60">
              Based on when you joined, we suggest the {suggestedPaymentDay(joinedAt)}th of each month. You can adjust
              it below.
            </p>
            <input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className={inputClass + " mt-4"}
            />
            {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="clay-btn flex-1 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-70"
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
              <button
                onClick={() => setShowPopup(false)}
                className="clay-btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}