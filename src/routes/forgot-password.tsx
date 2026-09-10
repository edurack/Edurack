import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { IconArrowLeft as ArrowLeft, IconArrowRight as ArrowRight, IconCircleCheck as CheckCircle2, IconEye as Eye, IconKey as KeyRound, IconLoader2 as Loader2, IconLock as Lock, IconMail as Mail } from "@tabler/icons-react";
import { EyeOff } from "lucide-react"; // TODO: no Tabler mapping found yet
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
} from "@/server-functions/password-reset";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password · Edurack" },
      { name: "description", content: "Reset your Edurack account password with a secure email verification code." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

type Step = "email" | "otp" | "password" | "done";
const RESEND_COOLDOWN = 60;

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter a valid email address.");
    setLoading(true);
    try {
      await requestPasswordResetOtp({
        data: { email: email.trim().toLowerCase(), hp: honeypotRef.current?.value ?? "" },
      });
      setStep("otp");
      setCooldown(RESEND_COOLDOWN);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await requestPasswordResetOtp({
        data: { email: email.trim().toLowerCase(), hp: honeypotRef.current?.value ?? "" },
      });
      setCooldown(RESEND_COOLDOWN);
    } catch {
      setError("Couldn't resend the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code.");
    setLoading(true);
    try {
      const res = await verifyPasswordResetOtp({ data: { email: email.trim().toLowerCase(), code } });
      if (!res.ok) return setError(res.error ?? "Incorrect code.");
      setResetToken(res.resetToken!);
      setStep("password");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function setPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const res = await resetPasswordWithToken({
        data: { email: email.trim().toLowerCase(), resetToken, newPassword },
      });
      if (!res.ok) return setError(res.error ?? "Something went wrong. Please try again.");
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 w-full max-w-xl">
          <Link to="/auth" className="clay-chip inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/80 transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>

        <div className="clay w-full max-w-xl p-5 sm:p-8">
          {step === "email" && (
            <EmailStep email={email} setEmail={setEmail} onSubmit={sendCode} loading={loading} error={error} honeypotRef={honeypotRef} />
          )}
          {step === "otp" && (
            <OtpStep
              email={email}
              code={code}
              setCode={setCode}
              onSubmit={verifyCode}
              onResend={resend}
              cooldown={cooldown}
              loading={loading}
              error={error}
              onChangeEmail={() => { setStep("email"); setCode(""); setError(null); }}
            />
          )}
          {step === "password" && (
            <NewPasswordStep
              newPassword={newPassword} setNewPassword={setNewPassword}
              confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
              show={show} setShow={setShow}
              onSubmit={setPassword} loading={loading} error={error}
            />
          )}
          {step === "done" && <DoneStep onContinue={() => navigate({ to: "/auth" })} />}
        </div>
      </div>
    </div>
  );
}

function ClayInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="clay-inset flex items-center gap-3 px-4 py-3 transition focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
      {icon && <span className="text-foreground/50">{icon}</span>}
      <input {...props} className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none" />
    </div>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">{error}</p>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function EmailStep({ email, setEmail, onSubmit, loading, error, honeypotRef }: {
  email: string; setEmail: (v: string) => void; onSubmit: (e: FormEvent) => void;
  loading: boolean; error: string | null; honeypotRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <StepHeading title="Forgot your password?" subtitle="Enter your email and we'll send you a 6-digit code." />
      {/* Honeypot — visually hidden from real users, invisible to screen readers */}
      <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off"
        className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
      <ClayInput icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" placeholder="Email address"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <ErrorBanner error={error} />
      <button type="submit" disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Send code</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function OtpStep({ email, code, setCode, onSubmit, onResend, cooldown, loading, error, onChangeEmail }: {
  email: string; code: string; setCode: (v: string) => void; onSubmit: (e: FormEvent) => void;
  onResend: () => void; cooldown: number; loading: boolean; error: string | null; onChangeEmail: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <StepHeading title="Enter your code" subtitle={`We sent a 6-digit code to ${email}.`} />
      <ClayInput icon={<KeyRound className="h-4 w-4" />} inputMode="numeric" placeholder="6-digit code"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        maxLength={6} required
        style={{ letterSpacing: "0.3em", fontWeight: 600, textAlign: "center" }} />
      <ErrorBanner error={error} />
      <button type="submit" disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Verify code</span><ArrowRight className="h-4 w-4" /></>}
      </button>
      <div className="flex items-center justify-between text-xs text-foreground/60">
        <button type="button" onClick={onChangeEmail} className="font-semibold hover:underline">Use a different email</button>
        <button type="button" onClick={onResend} disabled={cooldown > 0}
          className="font-semibold text-[var(--sky-deep)] hover:underline disabled:text-foreground/40 disabled:no-underline">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function NewPasswordStep({ newPassword, setNewPassword, confirmPassword, setConfirmPassword, show, setShow, onSubmit, loading, error }: {
  newPassword: string; setNewPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  show: boolean; setShow: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void; loading: boolean; error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <StepHeading title="Set a new password" subtitle="Make it at least 8 characters." />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input type={show ? "text" : "password"} autoComplete="new-password" placeholder="New password"
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none" />
        <button type="button" onClick={() => setShow(!show)} className="text-foreground/50 hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <ClayInput icon={<Lock className="h-4 w-4" />} type={show ? "text" : "password"} autoComplete="new-password"
        placeholder="Confirm new password" value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
      <ErrorBanner error={error} />
      <button type="submit" disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Update password</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function DoneStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="clay-chip mx-auto flex h-14 w-14 items-center justify-center rounded-full">
        <CheckCircle2 className="h-7 w-7 text-[var(--sky-deep)]" />
      </div>
      <StepHeading title="Password updated" subtitle="You're all set — please sign in with your new password." />
      <button onClick={onContinue}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold">
        <span>Continue to sign in</span><ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}