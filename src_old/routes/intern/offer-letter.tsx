import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconFileText as FileText, IconDownload as Download, IconEye as Eye } from "@tabler/icons-react";
import { getMyProfileReport } from "@/server-functions/intern-portal";
import { useInternSession } from "@/components/intern/use-intern-session";
import { InternShell } from "@/components/intern/intern-shell";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";

export const Route = createFileRoute("/intern/offer-letter")({
  component: OfferLetterPage,
});

type Report = Awaited<ReturnType<typeof getMyProfileReport>>["report"];

function OfferLetterPage() {
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

  return (
    <InternShell internName={internName} activeTab="offer-letter" onSignOut={signOut}>
      {report === null ? (
        <p className="text-sm text-foreground/50">Loading…</p>
      ) : report.offerLetter ? (
        <div className="clay flex flex-col items-center gap-4 p-10 text-center">
          <div className="clay-inset grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint-soft)]/50">
            <FileText className="h-7 w-7 text-foreground/60" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Your offer letter</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Issued by Edurack{report.offerLetter.uploadedAt ? ` on ${new Date(report.offerLetter.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
            </p>
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
              href={report.offerLetter.url}
              download="Edurack-Offer-Letter.pdf"
              className="clay-chip flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/70"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        </div>
      ) : (
        <div className="clay flex flex-col items-center gap-3 p-10 text-center">
          <div className="clay-inset grid h-14 w-14 place-items-center rounded-2xl">
            <FileText className="h-6 w-6 text-foreground/30" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">Not issued yet</h2>
          <p className="max-w-sm text-sm text-foreground/60">
            Your offer letter hasn't been uploaded yet. As soon as Edurack issues it, it'll show up here — and
            you'll get an email too.
          </p>
        </div>
      )}

      {previewOpen && report?.offerLetter && (
        <PdfPreviewModal url={report.offerLetter.url} name="Edurack Offer Letter" onClose={() => setPreviewOpen(false)} />
      )}
    </InternShell>
  );
}
