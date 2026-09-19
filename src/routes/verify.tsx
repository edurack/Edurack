import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { IconShieldCheck as ShieldCheck, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { verifyInternCertificate } from "@/server-functions/intern-verify";
import { CertificateVerifyCard } from "@/components/certificate-verify-card";
import type { InternVerificationResult } from "@/server-functions/intern-verify";

export const Route = createFileRoute("/verify")({
  component: VerifyLandingPage,
});

// Manual-entry version of certificate verification, for anyone who has a
// Certificate ID / Intern ID but not a QR code to scan. Scanning a
// certificate's QR code instead lands directly on
// /verify/$certificateId — see that route for the auto-verifying version
// of this same result card.
function VerifyLandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [certificateId, setCertificateId] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<InternVerificationResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = certificateId.trim();
    if (!value) return;
    setChecking(true);
    try {
      const res = await verifyInternCertificate({ data: { certificateId: value } });
      setResult(res);
      // Keep the URL shareable once a lookup succeeds, same as scanning
      // the QR code directly would.
      navigate({ to: "/verify/$certificateId", params: { certificateId: value }, replace: true });
    } catch {
      setResult({ found: false });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <div className="clay-inset mx-auto grid h-14 w-14 place-items-center rounded-2xl">
          <ShieldCheck className="h-7 w-7 text-[var(--sky-deep)]" strokeWidth={1.75} />
        </div>

        <h1 className="font-display mt-5 text-center text-2xl font-bold text-foreground">
          Verify Certificate
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/60">
          Enter the Certificate ID or Intern ID printed on the certificate to confirm it was
          issued by Edurack.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex gap-2">
          <input
            type="text"
            value={certificateId}
            onChange={(e) => setCertificateId(e.target.value)}
            placeholder="EDR-JUN1026-001"
            autoComplete="off"
            spellCheck={false}
            className="clay-inset min-w-0 flex-1 rounded-xl px-4 py-3 font-mono text-sm text-foreground outline-none placeholder:text-foreground/30 focus:ring-2 focus:ring-[var(--ring)]"
          />
          <button type="submit" disabled={checking} className="clay-btn flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-60">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </button>
        </form>

        {result && (
          <div className="mt-6">
            <CertificateVerifyCard result={result} />
          </div>
        )}
      </main>
    </div>
  );
}
