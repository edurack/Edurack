import { IconShieldCheck as ShieldCheck, IconShieldX as ShieldX, IconCalendar as Calendar, IconBriefcase as Briefcase } from "@tabler/icons-react";
import type { InternVerificationResult } from "@/server-functions/intern-verify";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Renders one of three states: nothing looked up yet (parent controls
// that by not rendering this at all), a verified/unverified result, or
// "no such certificate". Kept as a single component so /verify and
// /verify/$certificateId show an identical result card either way.
export function CertificateVerifyCard({ result }: { result: InternVerificationResult }) {
  if (!result.found) {
    return (
      <div className="clay flex items-start gap-4 p-6">
        <div className="clay-inset grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
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
    <div className="clay p-6">
      <div className="flex items-center gap-4">
        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${
            result.verified ? "bg-[var(--mint-soft)]" : "clay-inset"
          }`}
        >
          {result.verified ? (
            <ShieldCheck className="h-7 w-7 text-[var(--sky-deep)]" strokeWidth={1.75} />
          ) : (
            <ShieldX className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display truncate text-lg font-bold text-foreground">{result.name}</p>
          <p className="text-sm text-foreground/60">{result.role}</p>
        </div>
      </div>

      {(start || end) && (
        <div className="clay-chip mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-sm">
          <Calendar className="h-3.5 w-3.5 text-foreground/50" />
          {start ?? "\u2014"} &ndash; {end ?? "Present"}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Briefcase className="h-3.5 w-3.5 text-foreground/50" />
        <span className="text-sm text-foreground/60">Internship Program &middot; Edurack</span>
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
  );
}
