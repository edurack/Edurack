import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Loader2,
  User,
  Camera,
  GraduationCap,
  Video,
  Lock,
  Trophy,
  Building2,
  BookMarked,
  Upload,
  Play,
  X,
} from "lucide-react";
import type { MentorProfileExtended, YearOfStudy } from "@/lib/admin-types";
import { getMentorProfile, updateMyMentorProfile } from "@/server-functions/mentor-auth";
import { VideoPlayer } from "@/components/clay-video-player";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  ErrorBanner,
  SuccessBanner,
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
        subtitle="Update the details students see on your mentorship page."
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
          <div className="lg:col-span-2">
            <EditableProfileForm profile={profile} mentorToken={mentorToken} onSaved={refresh} />
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
  const [introVideoUrl, setIntroVideoUrl] = useState(profile.introVideoUrl ?? "");

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
            introVideoUrl: introVideoUrl.trim() || null,
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
        <div className="flex items-center gap-4">
          <div className="clay-inset flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full">
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-foreground/30" />
            )}
          </div>
          <div className="flex-1">
            <ClayField label="Profile picture URL">
              <input
                value={profilePictureUrl}
                onChange={(e) => setProfilePictureUrl(e.target.value)}
                placeholder="https://…/your-photo.jpg"
                className={inputClass}
              />
            </ClayField>
          </div>
        </div>

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

        <IntroVideoUploader value={introVideoUrl} onChange={setIntroVideoUrl} />

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

// ─── Self-introduction video node ───────────────────────────────────────
// NOTE: there's no Cloudflare Stream / Bunny.net upload pipeline wired up
// yet, so this stores a direct .mp4 URL rather than performing a real
// upload. The file picker below lets a mentor preview a local clip
// instantly (via a transient blob URL) while a real host URL is pasted in.
function IntroVideoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.includes("mp4")) return;
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const displaySrc = previewUrl ?? (value || null);

  return (
    <ClayField label="Self-introduction video (.mp4)" hint="Local preview only — paste the final hosted URL to save it.">
      <div className="clay-inset overflow-hidden rounded-2xl">
        <div className="relative flex aspect-video items-center justify-center bg-[var(--sky-soft)]/60">
          {displaySrc ? (
            <VideoPlayer src={displaySrc} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-foreground/40">
              <Play className="h-8 w-8" strokeWidth={1.5} />
              <span className="text-xs font-medium">No intro video yet</span>
            </div>
          )}
          {previewUrl && (
            <button
              type="button"
              onClick={clearPreview}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground/60 shadow-sm hover:text-foreground"
              aria-label="Remove preview"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="clay-btn-ghost inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-foreground/70"
          >
            <Upload className="h-3.5 w-3.5" />
            Preview a clip
          </button>
          <input ref={fileInputRef} type="file" accept="video/mp4" onChange={handleFile} className="hidden" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Hosted .mp4 URL (paste after uploading)"
            className={inputClass + " flex-1"}
          />
        </div>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground/40">
        <Video className="h-3 w-3" />
        Local preview only — paste the final hosted URL to save it to your profile.
      </p>
    </ClayField>
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