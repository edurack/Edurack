import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  User,
  GraduationCap,
  Lock,
  Trophy,
  Building2,
  BookMarked,
  Video,
  ExternalLink,
  Check,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import type { MentorProfileExtended, YearOfStudy } from "@/lib/admin-types";
import { getMentorProfile, updateMyMentorProfile } from "@/server-functions/mentor-auth";
import { getMyIntroVideoStatus, setIntroVideoUploadedStatus } from "@/server-functions/mentor-profile-extras";
import { listMyAssignedBatches } from "@/server-functions/mentor-portal";
import { getBatchPromotionSettings, setBatchPromotionPercent } from "@/server-functions/mentor-earnings";
import { DEFAULT_BATCH_PROMOTION_PERCENT, MAX_BATCH_PROMOTION_PERCENT } from "@/lib/admin-types";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  ErrorBanner,
  SuccessBanner,
  ImageUploadField,
  inputClass,
  textareaClass,
} from "@/components/mentor-portal-ui";

const YEAR_OPTIONS: YearOfStudy[] = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
  "Internship",
  "Post-Graduation",
];

export function MentorProfileModule({ mentorToken }: { mentorToken: string }) {
  const [profile, setProfile] = useState<MentorProfileExtended | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { profile: p } = await getMentorProfile({ data: { token: mentorToken } });
      setProfile(p as MentorProfileExtended);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <div>
      <ModuleHeader
        title="Mentor Profile Control"
        subtitle="Update the details students see on your mentorship page, and manage your batch promotion settings."
      />

      {loadError && (
        <div className="mb-6">
          <ErrorBanner message={loadError} />
        </div>
      )}

      {!profile && !loadError ? (
        <LoadingBlock />
      ) : profile ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <EditableProfileForm profile={profile} mentorToken={mentorToken} onSaved={refresh} />
            <IntroVideoDriveLinkPanel mentorToken={mentorToken} />
            <BatchPromotionPanel mentorToken={mentorToken} />
          </div>
          <div className="sticky top-6 lg:col-span-1">
            <LockedInfoPanel profile={profile} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Editable section ───────────────────────────────────────────────────
function EditableProfileForm({
  profile,
  mentorToken,
  onSaved,
}: {
  profile: MentorProfileExtended;
  mentorToken: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [profilePictureUrl, setProfilePictureUrl] = useState(profile.profilePictureUrl ?? "");
  const [aboutText, setAboutText] = useState(profile.aboutText ?? "");
  const [yearOfStudy, setYearOfStudy] = useState<YearOfStudy | "">(profile.yearOfStudy ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) return setError("Enter your full name.");
    if (!aboutText.trim()) return setError("Add an About section — your academic and career roadmap.");
    if (!yearOfStudy) return setError("Select your current year of study.");

    setSaving(true);
    try {
      await updateMyMentorProfile({
        data: {
          token: mentorToken,
          profile: {
            name: name.trim(),
            profilePictureUrl: profilePictureUrl.trim() || null,
            aboutText: aboutText.trim(),
            yearOfStudy,
          },
        },
      });
      setSuccess(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel icon={User} title="Updateable details">
      <form onSubmit={handleSubmit} className="space-y-5">
        <ImageUploadField
          label="Profile photo"
          value={profilePictureUrl}
          onChange={setProfilePictureUrl}
          storagePath={`mentor-profiles/${profile.id}/photo`}
        />

        <ClayField label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </ClayField>

        <ClayField label="About — your academic & career roadmap">
          <textarea
            value={aboutText}
            onChange={(e) => setAboutText(e.target.value)}
            rows={6}
            placeholder="Share your journey — school, coaching, rank story, what you specialize in mentoring…"
            className={textareaClass}
          />
        </ClayField>

        <ClayField label="Current year of study">
          <div className="relative">
            <select
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value as YearOfStudy)}
              className={inputClass + " appearance-none pr-10"}
            >
              <option value="" disabled>
                Select year
              </option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <GraduationCap className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          </div>
        </ClayField>

        {error && <ErrorBanner message={error} />}
        {success && <SuccessBanner message="Profile updated." />}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </button>
      </form>
    </Panel>
  );
}

// ─── Self-introduction video — Google Drive link workflow ─────────────────
// Replaces the old direct-upload flow entirely. Edurack shares a Drive
// folder link where the mentor manually drops the file; this panel just
// shows that link, admin's shooting instructions, and lets the mentor
// flip a self-reported "I've uploaded it" status once they've done so.
function IntroVideoDriveLinkPanel({ mentorToken }: { mentorToken: string }) {
  const [status, setStatus] = useState<{
    driveUploadLink: string | null;
    instructions: string;
    uploaded: boolean;
    markedUploadedAt: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const { status: s } = await getMyIntroVideoStatus({ data: { token: mentorToken } });
    setStatus(s);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  async function toggleUploaded() {
    if (!status) return;
    setSaving(true);
    try {
      await setIntroVideoUploadedStatus({ data: { token: mentorToken, uploaded: !status.uploaded } });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel icon={Video} title="Self-introduction video">
      {status === null ? (
        <LoadingBlock compact />
      ) : (
        <div className="space-y-4">
          <div className="clay-inset rounded-2xl px-4 py-3.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
              How we'd like it shot
            </p>
            <p className="text-sm text-foreground/70">{status.instructions}</p>
          </div>

          {status.driveUploadLink ? (
            <a
              href={status.driveUploadLink}
              target="_blank"
              rel="noreferrer"
              className="clay-btn-ghost inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/70"
            >
              <ExternalLink className="h-4 w-4" />
              Open the Drive upload folder
            </a>
          ) : (
            <p className="text-xs text-foreground/50">
              Edurack hasn't shared your upload link yet — check back soon, or reach out via Help Desk.
            </p>
          )}

          <label className="clay-inset flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Check className={`h-4 w-4 ${status.uploaded ? "text-[var(--sky-deep)]" : "text-foreground/30"}`} />
              I've uploaded my video to the Drive folder
            </div>
            <input
              type="checkbox"
              checked={status.uploaded}
              onChange={toggleUploaded}
              disabled={saving || !status.driveUploadLink}
              className="h-4 w-4 accent-[var(--sky-deep)]"
            />
          </label>

          {status.uploaded && status.markedUploadedAt && (
            <p className="text-xs text-foreground/40">
              Marked uploaded on {new Date(status.markedUploadedAt).toLocaleDateString()}.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Batch Promotion Boost ──────────────────────────────────────────────────
// Every batch starts promoters at a flat 10% commission on referred sales.
// If a mentor isn't getting promoter pickup, they can raise it here — this
// only affects what promoters earn, never the platform's own cut from the
// mentor (that's the fixed 15% shown on the Overview page).
type Batch = { id: string; name: string; track: string };

function BatchPromotionPanel({ mentorToken }: { mentorToken: string }) {
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    (async () => {
      const { batches: rows } = await listMyAssignedBatches({ data: { token: mentorToken } });
      setBatches(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <Panel icon={Megaphone} title="Batch promotion boost">
      <p className="mb-4 text-xs text-foreground/50">
        Every batch starts promoters off at {DEFAULT_BATCH_PROMOTION_PERCENT}% commission on referred sales. If
        promoters aren't picking up your batch, raise this to make it more attractive — this comes out of your own
        share, not the platform's commission.
      </p>

      {batches === null ? (
        <LoadingBlock compact />
      ) : batches.length === 0 ? (
        <p className="text-xs text-foreground/50">No batches assigned yet.</p>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <BatchBoostRow key={b.id} mentorToken={mentorToken} batch={b} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function BatchBoostRow({ mentorToken, batch }: { mentorToken: string; batch: Batch }) {
  const [percent, setPercent] = useState(DEFAULT_BATCH_PROMOTION_PERCENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const { settings } = await getBatchPromotionSettings({ data: { token: mentorToken, batchId: batch.id } });
      setPercent(settings.promotionPercent);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.id]);

  async function save() {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await setBatchPromotionPercent({ data: { token: mentorToken, batchId: batch.id, promotionPercent: percent } });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay-inset rounded-2xl px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {batch.name} <span className="text-xs font-normal text-foreground/40">· {batch.track}</span>
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)]">
          <TrendingUp className="h-3.5 w-3.5" />
          {percent}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={DEFAULT_BATCH_PROMOTION_PERCENT}
          max={MAX_BATCH_PROMOTION_PERCENT}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="flex-1 accent-[var(--sky-deep)]"
        />
        <button
          onClick={save}
          disabled={saving}
          className="clay-btn-ghost shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
      {success && <p className="mt-2 text-xs font-medium text-foreground/50">Saved.</p>}
    </div>
  );
}

// ─── Strictly locked panel ────────────────────────────────────────────────
function LockedInfoPanel({ profile }: { profile: MentorProfileExtended }) {
  const items = [
    { icon: Trophy, label: "AIIMS / IIT Rank", value: profile.aiimsIitRank },
    { icon: Building2, label: "Enrolled College", value: profile.enrolledCollege },
    { icon: BookMarked, label: "Pursued Course", value: profile.pursuedCourse },
  ];

  return (
    <Panel icon={Lock} title="System-locked indices">
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="clay-inset px-4 py-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                <Icon className="h-3 w-3" />
                {item.label}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {item.value?.trim() ? item.value : "Not set yet"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-foreground/40">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        These values are injected only by the Super Admin. They cannot be edited from this portal.
      </p>
    </Panel>
  );
}