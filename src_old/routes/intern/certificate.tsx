import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  IconCertificate as CertificateIcon,
  IconDownload as Download,
  IconEye as Eye,
  IconLock as Lock,
  IconClock as Clock,
} from "@tabler/icons-react";
import { getMyProfileReport } from "@/server-functions/intern-portal";
import { useInternSession } from "@/components/intern/use-intern-session";
import { InternShell } from "@/components/intern/intern-shell";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";

export const Route = createFileRoute("/intern/certificate")({
  component: CertificatePage,
});

type Report = Awaited<ReturnType<typeof getMyProfileReport>>["report"];

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CertificatePage() {
  const { token, internName, signOut } = useInternSession();
  const [report, setReport] = useState<Report | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await getMyProfileReport({ data: { token } });
      setReport(res.report);
    })();
  }, [token]);

  if (!token) return null;

  const cert = report?.certificate;

  return (
    <InternShell internName={internName} activeTab="certificate" onSignOut={signOut}>
      {report === null ? (
        <p className="text-sm text-foreground/50">Loading…</p>
      ) : cert!.unlocked && cert!.url ? (
        // ── Unlocked & ready ────────────────────────────────────────────
        <div className="clay flex flex-col items-center gap-4 p-10 text-center">
          <div className="clay-inset grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint-soft)]/50">
            <CertificateIcon className="h-7 w-7 text-foreground/60" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Your certificate is ready</h2>
            <p className="mt-1 text-sm text-foreground/60">Congratulations on completing your internship with Edurack.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewOpen(true)}
              className="clay-btn flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Eye className="h-4 w-4" />
              View
            </button>
            <a
              href={cert!.url}
              download="Edurack-Certificate.pdf"
              className="clay-chip flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/70"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        </div>
      ) : cert!.uploaded ? (
        // ── Prepared, but the unlock date hasn't arrived yet ────────────
        <div className="clay flex flex-col items-center gap-4 p-10 text-center">
          <div className="clay-inset grid h-16 w-16 place-items-center rounded-2xl bg-[var(--sky-soft)]/50">
            <Lock className="h-7 w-7 text-foreground/50" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Your certificate is on its way</h2>
            <p className="mt-1 max-w-sm text-sm text-foreground/60">
              It's already prepared — it unlocks for download automatically once your internship period ends.
            </p>
          </div>
          <div className="clay-inset flex items-center gap-2 rounded-2xl px-5 py-3">
            <Clock className="h-4 w-4 text-foreground/40" />
            <span className="text-sm font-semibold text-foreground">
              {cert!.daysRemaining === 0
                ? "Unlocking today"
                : `Unlocks in ${cert!.daysRemaining} day${cert!.daysRemaining === 1 ? "" : "s"}`}
            </span>
            {cert!.unlockDate && <span className="text-xs text-foreground/40">({formatDate(cert!.unlockDate)})</span>}
          </div>
        </div>
      ) : (
        // ── Nothing uploaded yet ─────────────────────────────────────────
        <div className="clay flex flex-col items-center gap-3 p-10 text-center">
          <div className="clay-inset grid h-14 w-14 place-items-center rounded-2xl">
            <CertificateIcon className="h-6 w-6 text-foreground/30" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">Not ready yet</h2>
          <p className="max-w-sm text-sm text-foreground/60">
            Your certificate hasn't been prepared yet.
            {report.profile.internshipEndDate
              ? ` It'll be ready around the end of your internship on ${formatDate(report.profile.internshipEndDate)}.`
              : " Once your internship dates are confirmed and it's prepared, you'll see a countdown here."}
          </p>
        </div>
      )}

      {previewOpen && cert?.url && (
        <PdfPreviewModal url={cert.url} name="Edurack Certificate" onClose={() => setPreviewOpen(false)} />
      )}
    </InternShell>
  );
}
