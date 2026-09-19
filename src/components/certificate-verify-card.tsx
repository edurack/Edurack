import { useState } from "react";
import { IconShieldCheck as ShieldCheck, IconShieldX as ShieldX, IconCalendar as Calendar, IconBriefcase as Briefcase, IconUser as UserIcon } from "@tabler/icons-react";
import type { InternVerificationResult } from "@/server-functions/intern-verify";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

// Circular profile picture with a graceful fallback: real photo if set,
// initials avatar if not, and a small badge (check / x) fixed to the
// bottom-right corner either way so the verification state reads at a
// glance even before you've read the name.
function Avatar({ name, profilePictureUrl, verified }: { name: string; profilePictureUrl: string | null; verified: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = profilePictureUrl && !imgFailed;

  return (
    <div className="relative shrink-0">
      <div className="clay-inset h-16 w-16 overflow-hidden rounded-2xl">
        {showImage ? (
          <img
            src={profilePictureUrl}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            {name ? (
              <span className="font-display text-lg font-bold text-foreground/50">{initials(name)}</span>
            ) : (
              <UserIcon className="h-6 w-6 text-foreground/30" strokeWidth={1.5} />
            )}
          </div>
        )}
      </div>
      <div
        className={`absolute -bottom-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--color-card)] ${
          verified ? "bg-[var(--sky-deep)]" : "bg-foreground/30"
        }`}
      >
        {verified ? (
          <ShieldCheck className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
        ) : (
          <ShieldX className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
        )}
      </div>
    </div>
  );
}

// Renders one of two states: a found result (verified or not-yet-issued)
// or "no such certificate". Shared by /verify and /verify/$certificateId
// so both show an identical result card.
export function CertificateVerifyCard({ result }: { result: InternVerificationResult }) {
  if (!result.found) {
    return (
      <div className="clay flex items-start gap-4 p-6">
        <div className="clay-inset grid h-14 w-14 shrink-0 place-items-center rounded-2xl">
          <ShieldX className="h-6 w-6 text-foreground/40" strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-display font-bold text-foreground">No certificate found</p>
          <p className="mt-1 text-sm text-foreground/60">
            Double-check the Certificate ID or Intern ID and try again.
          </p>
        </div>
      </div>
    );
  }

  const start = formatDate(result.internshipStartDate);
  const end = formatDate(result.internshipEndDate);

  return (
    <div className="clay overflow-hidden">
      {/* Top accent strip — colour communicates state before you've read anything. */}
      <div className={`h-1.5 w-full ${result.verified ? "bg-[var(--sky-deep)]" : "bg-foreground/20"}`} />

      <div className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={result.name} profilePictureUrl={result.profilePictureUrl} verified={result.verified} />
          <div className="min-w-0">
            <p className="font-display truncate text-lg font-bold text-foreground">{result.name}</p>
            <p className="truncate text-sm text-foreground/60">{result.role}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(start || end) && (
            <div className="clay-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-foreground/50" />
              {start ?? "\u2014"} &ndash; {end ?? "Present"}
            </div>
          )}
          <div className="clay-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm">
            <Briefcase className="h-3.5 w-3.5 text-foreground/50" />
            Edurack Internship Program
          </div>
        </div>

        <div
          className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
            result.verified
              ? "bg-[var(--mint-soft)] text-[var(--sky-deep)]"
              : "bg-[var(--coral-soft)] text-foreground/70"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          {result.verified ? "Verified & Certified by Edurack" : "Certificate not yet issued"}
        </div>
      </div>
    </div>
  );
}