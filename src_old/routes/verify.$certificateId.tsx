import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconShieldCheck as ShieldCheck, IconLoader2 as Loader2, IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { verifyInternCertificate } from "@/server-functions/intern-verify";
import { CertificateVerifyCard } from "@/components/certificate-verify-card";
import type { InternVerificationResult } from "@/server-functions/intern-verify";

export const Route = createFileRoute("/verify/$certificateId")({
  component: VerifyCertificatePage,
});

// This is the page a certificate's QR code actually points to — the QR
// encodes a full URL like https://www.edurack.in/verify/EDR-JUN1026-001,
// so scanning it should show the verified result immediately, with no
// typing required. Public route, same as mentor-profile.$mentorId — no
// sign-in needed to verify a certificate.
function VerifyCertificatePage() {
  const { certificateId } = Route.useParams();
  const { user } = useAuth();
  const [result, setResult] = useState<InternVerificationResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingResult(true);
    verifyInternCertificate({ data: { certificateId } })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setResult({ found: false });
      })
      .finally(() => {
        if (!cancelled) setLoadingResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  return (
    <div className="relative min-h-screen overflow-hidden">

      <AppHeader user={user} />

      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <Link
          to="/verify"
          className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Check another certificate
        </Link>

        <div className="clay-inset mx-auto grid h-14 w-14 place-items-center rounded-2xl">
          <ShieldCheck className="h-7 w-7 text-[var(--sky-deep)]" strokeWidth={1.75} />
        </div>

        <h1 className="font-display mt-5 text-center text-2xl font-bold text-foreground">
          Verify Certificate
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/60">
          Certificate ID: <span className="font-mono">{certificateId}</span>
        </p>

        <div className="mt-6">
          {loadingResult ? (
            <div className="clay flex items-center justify-center gap-2 p-8 text-sm text-foreground/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking certificate&hellip;
            </div>
          ) : (
            result && <CertificateVerifyCard result={result} />
          )}
        </div>
      </main>
    </div>
  );
}


