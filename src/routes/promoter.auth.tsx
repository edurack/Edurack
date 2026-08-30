// Standalone Promoter auth page. Deliberately NOT sharing anything with
// /admin/auth (admin.auth.tsx) or the mentor login flow — promoters are
// outsiders, so they get their own route, their own session storage key,
// and their own server functions (promoter-auth.ts).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Megaphone,
  User,
} from "lucide-react";
import {
  promoterLogin,
  promoterSignUp,
  requestPromoterPasswordReset,
} from "@/server-functions/promoter-auth";

export const Route = createFileRoute("/promoter/auth")({
  head: () => ({
    meta: [{ title: "Promoter Sign In · Edurack" }, { name: "robots", content: "noindex" }],
  }),
  component: PromoterAuthPage,
});

// Session token is stored under its own key, distinct from any mentor or
// student storage, so signing in as one role never touches another's
// session in the same browser.
const PROMOTER_TOKEN_KEY = "edurack_promoter_token";

type Tab = "signin" | "signup" | "forgot";

function PromoterAuthPage() {
  const [tab, setTab] = useState<Tab>("signin");
  const navigate = useNavigate();

  function handleAuthenticated(token: string) {
    localStorage.setItem(PROMOTER_TOKEN_KEY, token);
    navigate({ to: "/promoter/dashboard" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="clay flex h-12 w-12 items-center justify-center">
            <Megaphone className="h-5 w-5 text-[var(--sky-deep)]" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/60">
            Edurack Promoters
          </p>
        </div>

        <div key={tab} className="clay animate-in fade-in slide-in-from-bottom-3 w-full p-6 duration-300 sm:p-8">
          {tab !== "forgot" && (
            <div className="clay-inset mb-6 grid grid-cols-2 gap-1 p-1">
              <TabButton active={tab === "signin"} onClick={() => setTab("signin")}>
                Login
              </TabButton>
              <TabButton active={tab === "signup"} onClick={() => setTab("signup")}>
                Sign Up
              </TabButton>
            </div>
          )}

          {tab === "signin" && (
            <SignInForm onAuthenticated={handleAuthenticated} onForgot={() => setTab("forgot")} />
          )}
          {tab === "signup" && <SignUpForm onAuthenticated={handleAuthenticated} />}
          {tab === "forgot" && <ForgotPasswordForm onBack={() => setTab("signin")} />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full py-2.5 text-sm font-semibold transition-all duration-200 ${
        active ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ClayInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  return (
    <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
      {icon && <span className="text-foreground/50">{icon}</span>}
      <input
        {...props}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200">
      {message}
    </p>
  );
}

function SignInForm({
  onAuthenticated,
  onForgot,
}: {
  onAuthenticated: (token: string) => void;
  onForgot: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError("Enter your username and password.");

    setLoading(true);
    try {
      const result = await promoterLogin({ data: { username: username.trim(), password } });
      onAuthenticated(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="mb-2 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Promoter Login</h1>
        <p className="mt-1 text-sm text-foreground/60">Sign in to your promoter dashboard.</p>
      </div>

      <ClayInput
        icon={<User className="h-4 w-4" />}
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input
          type={show ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-foreground/50 hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgot}
          className="text-xs font-semibold text-[var(--sky-deep)] hover:underline"
        >
          Forgot password?
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Login</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function SignUpForm({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) return setError("Enter a username.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (!secretCode.trim()) return setError("Enter the secret code you were given.");

    setLoading(true);
    try {
      const result = await promoterSignUp({
        data: { username: username.trim(), password, secretCode: secretCode.trim() },
      });
      onAuthenticated(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign up. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="mb-2 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Promoter Sign Up</h1>
        <p className="mt-1 text-sm text-foreground/60">
          You'll need the secret code Edurack gave you to activate your account.
        </p>
      </div>

      <ClayInput
        icon={<User className="h-4 w-4" />}
        placeholder="Choose a username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input
          type={show ? "text" : "password"}
          placeholder="Create a password (min. 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-foreground/50 hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <ClayInput
        icon={<KeyRound className="h-4 w-4" />}
        placeholder="Secret code"
        value={secretCode}
        onChange={(e) => setSecretCode(e.target.value)}
      />

      {error && <ErrorBanner message={error} />}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Sign Up</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) return setError("Enter your username.");

    setLoading(true);
    try {
      await requestPromoterPasswordReset({ data: { username: username.trim(), contactNote: contactNote.trim() } });
      setSubmitted(true);
    } catch {
      setError("Could not submit your request. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Request sent</h1>
        <p className="text-sm text-foreground/60">
          The Edurack team will review your request and reach out to reset your password.
        </p>
        <button onClick={onBack} className="clay-btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold">
          Back to login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="mb-2 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Forgot password</h1>
        <p className="mt-1 text-sm text-foreground/60">
          No email is on file for your account, so a teammate will reset it for you manually. Leave a
          way to reach you below.
        </p>
      </div>

      <ClayInput
        icon={<User className="h-4 w-4" />}
        placeholder="Your username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <ClayInput
        placeholder="Phone / other contact (optional)"
        value={contactNote}
        onChange={(e) => setContactNote(e.target.value)}
      />

      {error && <ErrorBanner message={error} />}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send request"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs font-semibold text-foreground/60 hover:text-foreground"
      >
        Back to login
      </button>
    </form>
  );
}