import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { IconShieldCheck as ShieldCheck, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { verifyInternCertificate } from "@/server-functions/intern-verify";
import { CertificateVerifyCard } from "@/components/certificate-verify-card";
import type { InternVerificationResult } from "@/server-functions/intern-verify";

export const Route = createFileRoute("/verify")({
  // Supports an optional ?id= so a QR code (or shared link) pointing at
  // plain /verify?id=EDR-JUN1026-001 still auto-verifies immediately,
  // exactly like /verify/$certificateId does. Same `validateSearch`
  // pattern as promoter.dashboard.tsx / admin.dashboard.tsx use for
  // their own search params.
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: VerifyLandingPage,
});

// Manual-entry version of certificate verification, for anyone who has a
// Certificate ID / Intern ID but not a QR code to scan. Scanning a
// certificate's QR code should instead land on /verify/$certificateId
// (or on /verify?id=... — both auto-verify on load, see validateSearch
// above) — see that route for the auto-verifying version of this same
// result card.
function VerifyLandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [certificateId, setCertificateId] = useState(id ?? "");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<InternVerificationResult | null>(null);

  async function runVerify(value: string) {
    if (!value.trim()) return;
    setChecking(true);
    try {
      const res = await verifyInternCertificate({ data: { certificateId: value.trim() } });
      setResult(res);
    } catch {
      setResult({ found: false });
    } finally {
      setChecking(false);
    }
  }

  // Auto-verify as soon as the page loads if a ?id= was supplied — this
  // is what makes a QR code encoded as /verify?id=EDR-JUN1026-001 show
  // the verified result immediately, with no typing or button-press
  // required from the person scanning it.
  useEffect(() => {
    if (id) runVerify(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = certificateId.trim();
    if (!value) return;
    await runVerify(value);
    // Keep the URL shareable/bookmarkable once a lookup succeeds, same
    // as scanning a QR code would land you directly.
    navigate({ to: "/verify/$certificateId", params: { certificateId: value }, replace: true });
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

        {checking && !result && (
          <div className="clay mt-6 flex items-center justify-center gap-2 p-8 text-sm text-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking certificate&hellip;
          </div>
        )}

        {result && (
          <div className="mt-6">
            <CertificateVerifyCard result={result} />
          </div>
        )}
      </main>
    </div>
  );
}