import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  GraduationCap,
  Target,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { auth, firebaseSignIn, firebaseSignUp, googleAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { ensureUserRecord, getProfile, needsOnboarding, saveProfile } from "@/server-functions/profile";
import { recordSession } from "@/server-functions/sessions";
import { sendEmailVerificationOtp, verifyEmailVerificationOtp } from "@/server-functions/email-verification";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Edurack" },
      { name: "description", content: "Sign in or create your Edurack account to access the NEET, JEE, CUET & IPMAT CBT engines, smart dashboards and mentor ecosystem." },
      { property: "og:title", content: "Sign in · Edurack" },
      { property: "og:description", content: "Access your NEET, JEE, CUET & IPMAT prep dashboard on Edurack." },
      // Intentional: this is an auth/login page, not organic-search content.
      // Keep noindex here — only remove noindex from public-facing pages
      // (home, landing, exam-info pages), not from /auth, /dashboard, etc.
      { name: "robots", content: "noindex" },
    ],
    // PERF: preconnect to apis.google.com early — this is where the
    // Firebase "Sign in with Google" popup/iframe flow (auth/iframe.js)
    // ends up fetching from. Lighthouse flagged ~300ms LCP savings here.
    // Keep total preconnects <= 4 across the app (fonts.googleapis.com +
    // fonts.gstatic.com are already used elsewhere).
    links: [
      { rel: "preconnect", href: "https://apis.google.com" },
    ],
  }),
  component: AuthPage,
});

type Tab = "signin" | "signup";
type Stage = "auth" | "onboarding" | "checking" | "verify-email";

type OnboardingProfile = {
  fullName: string;
  mobile: string;
  city: string;
  currentClass: string;
  board: string;
  targetExam: string;
  track: "Dropper" | "11th" | "12th" | "";
  cuetDomainSubjects: string[];
};

// Runs after ANY successful sign-in or sign-up (email/password or Google):
// 1. Ensures a MongoDB profile document exists (with empty onboarding fields
//    if it's brand new).
// 2. Records/refreshes this browser as a logged-in device.
// 3. Reports back whether onboarding still needs to happen.
async function completeLogin(user: FirebaseUser, provider: "password" | "google.com") {
  const token = await user.getIdToken();

  await ensureUserRecord({ data: { token, provider } });
  await recordSession({
    data: { token, deviceId: getDeviceId(), deviceLabel: getDeviceLabel() },
  });

  const { profile } = await getProfile({ data: { token } });
  return { needsOnboarding: needsOnboarding(profile) };
}

function AuthPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [stage, setStage] = useState<Stage>("checking");
  const [pendingEmail, setPendingEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setStage("auth");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await user.reload();
        const isPasswordUser = user.providerData.some((p) => p.providerId === "password");

        if (isPasswordUser && !user.emailVerified) {
          if (cancelled) return;
          setPendingEmail(user.email ?? "");
          setStage("verify-email");
          return;
        }

        const provider = user.providerData.some((p) => p.providerId === "google.com")
          ? "google.com"
          : "password";

        const { needsOnboarding: incomplete } = await completeLogin(user, provider);
        if (cancelled) return;

        if (incomplete) {
          setStage("onboarding");
        } else {
          navigate({ to: "/dashboard" });
        }
      } catch (err) {
        console.error("Auth redirect error:", err);
        if (!cancelled) setStage("auth");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  async function handleVerified() {
    const current = auth.currentUser;
    if (!current) {
      setStage("auth");
      return;
    }
    await current.reload();
    const { needsOnboarding: incomplete } = await completeLogin(current, "password");
    if (incomplete) {
      setStage("onboarding");
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  // NEW: escape hatch. Any stuck/unverified session (e.g. a shared device
  // that previously had someone else's unverified signup cached by Firebase's
  // local persistence) can be cleared without the user having to manually
  // wipe browser storage.
  async function handleSignOutAndRestart() {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setPendingEmail("");
      setTab("signin");
      setStage("auth");
    }
  }

  if (stage === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
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
          <Link
            to="/"
            className="clay-chip group inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/80 transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to home
          </Link>
        </div>

        <div className="animate-in fade-in zoom-in-95 mb-6 flex flex-col items-center gap-3 duration-500">
          <div className="clay flex h-12 w-auto items-center justify-center p-2 sm:h-14">
            {/*
              PERF (Lighthouse: ~141 KiB image savings + CLS risk):
              - width/height added below so the browser can reserve space
                before the image loads (kills layout shift).
              - Source is 443x502 displayed at ~62x70 — that's ~8x more
                pixels than needed, served as an uncompressed PNG from a
                third-party host (i.postimg.cc) with no cache-control you
                control.
              TODO (outside this file): export the logo as WebP/AVIF at
              ~140x140 (2x for retina) and self-host it under /assets so it
              ships with your own cache headers instead of postimg.cc's.
            */}
            <img
              src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
              alt="Edurack"
              width={62}
              height={70}
              className="h-10 w-auto object-contain sm:h-12"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/60">
            Edurack
          </p>
        </div>

        {/* Main card — key={stage} forces a remount so each stage change
            plays its own fade/slide-in rather than snapping instantly. */}
        <div key={stage} className="clay animate-in fade-in slide-in-from-bottom-3 w-full max-w-xl p-5 duration-300 sm:p-8">
          {stage === "auth" && (
            <AuthCard
              tab={tab}
              setTab={setTab}
              onSignedIn={() => navigate({ to: "/dashboard" })}
              onSignedUp={() => setStage("onboarding")}
              onNeedsVerification={(email) => {
                setPendingEmail(email);
                setStage("verify-email");
              }}
            />
          )}
          {stage === "verify-email" && (
            <EmailVerificationCard
              email={pendingEmail}
              onVerified={handleVerified}
              onSignOut={handleSignOutAndRestart}
            />
          )}
          {stage === "onboarding" && (
            <OnboardingCard onComplete={() => navigate({ to: "/dashboard" })} />
          )}
        </div>

        <p className="mt-6 max-w-md text-center text-xs text-foreground/60">
          By continuing you agree to our <span className="underline decoration-dotted underline-offset-2">Terms</span> and <span className="underline decoration-dotted underline-offset-2">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}

// ─── Auth (Sign In / Sign Up) ────────────────────────────────────────────────
function AuthCard({
  tab,
  setTab,
  onSignedIn,
  onSignedUp,
  onNeedsVerification,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onSignedIn: () => void;
  onSignedUp: () => void;
  onNeedsVerification: (email: string) => void;
}) {
  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {tab === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          {tab === "signin"
            ? "Log in to continue your exam prep."
            : "Start with Google or an email in seconds."}
        </p>
      </div>

      <div className="clay-inset relative mx-auto mb-6 grid max-w-sm grid-cols-2 gap-1 p-1">
        <TabButton active={tab === "signin"} onClick={() => setTab("signin")}>Sign In</TabButton>
        <TabButton active={tab === "signup"} onClick={() => setTab("signup")}>Create Account</TabButton>
      </div>

      <div key={tab} className="animate-in fade-in duration-200">
        {tab === "signin" ? (
          <SignInForm onSignedIn={onSignedIn} onSignedUp={onSignedUp} onNeedsVerification={onNeedsVerification} />
        ) : (
          <SignUpForm onSignedIn={onSignedIn} onSignedUp={onSignedUp} onNeedsVerification={onNeedsVerification} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative rounded-full py-2.5 text-sm font-semibold transition-all duration-200 " +
        (active ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function GoogleButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="clay-btn-ghost group flex w-full items-center justify-center gap-3 px-5 py-3.5 text-sm font-semibold text-foreground transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <GoogleIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
      )}
      <span>{label}</span>
    </button>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.8 26.7 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41.4 35.8 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-foreground/10" />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/40">or</span>
      <div className="h-px flex-1 bg-foreground/10" />
    </div>
  );
}

function ClayInput({
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
      {icon && <span className="text-foreground/50">{icon}</span>}
      <input
        {...props}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
    </div>
  );
}

function ClaySelect({
  icon,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
      {icon && <span className="text-foreground/50">{icon}</span>}
      <select
        {...props}
        className="w-full appearance-none bg-transparent text-sm text-foreground focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 8 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a bit.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Lightweight, purely-visual strength hint for signup — never blocks
// submission (Firebase's own 8-char minimum is still the real gate), just
// nudges toward a stronger password with an immediate, smooth indicator.
function passwordStrength(pw: string): { label: string; color: string; fill: number } {
  if (!pw) return { label: "", color: "", fill: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: "Weak", color: "bg-[var(--coral-soft)]", fill: 25 };
  if (score <= 3) return { label: "Fair", color: "bg-[var(--lemon-soft)]", fill: 60 };
  return { label: "Strong", color: "bg-[var(--mint-soft)]", fill: 100 };
}

function SignInForm({
  onSignedIn,
  onSignedUp,
  onNeedsVerification,
}: {
  onSignedIn: () => void;
  onSignedUp: () => void;
  onNeedsVerification: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await firebaseSignIn(email, password);
      const user = auth.currentUser!;
      await user.reload();

      if (!user.emailVerified) {
        const token = await user.getIdToken();
        await sendEmailVerificationOtp({ data: { token } });
        onNeedsVerification(user.email ?? email);
        return;
      }

      const { needsOnboarding: incomplete } = await completeLogin(user, "password");
      incomplete ? onSignedUp() : onSignedIn();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await googleAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // FIX: previously silently returned here with no feedback,
        // leaving the user stuck on a spinner-free, dead button.
        setError("Something went wrong. Please try again.");
        return;
      }

      const { needsOnboarding: incomplete } = await completeLogin(currentUser, "google.com");
      if (incomplete) {
        onSignedUp(); // Switches stage to onboarding
      } else {
        onSignedIn(); // Navigates to /dashboard
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Sign in with Google" />
      <Divider />

      <div className="space-y-3">
        <ClayInput
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
          <Lock className="h-4 w-4 text-foreground/50" />
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-foreground/50 transition-colors hover:text-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Link to="/forgot-password" className="text-xs font-semibold text-[var(--sky-deep)] hover:underline">
          Forgot Password?
        </Link>
      </div>

      {error && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Login to Dashboard</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function SignUpForm({
  onSignedIn,
  onSignedUp,
  onNeedsVerification,
}: {
  onSignedIn: () => void;
  onSignedUp: () => void;
  onNeedsVerification: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      await firebaseSignUp(email, password);
      const user = auth.currentUser!;
      const token = await user.getIdToken();

      await ensureUserRecord({ data: { token, provider: "password" } });
      await sendEmailVerificationOtp({ data: { token } });

      onNeedsVerification(email);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await googleAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // FIX: same guard as SignInForm — avoid a silent dead end.
        setError("Something went wrong. Please try again.");
        return;
      }
      const { needsOnboarding: incomplete } = await completeLogin(currentUser, "google.com");
      incomplete ? onSignedUp() : onSignedIn();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Sign up with Google" />
      <Divider />

      <div className="space-y-3">
        <ClayInput
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div>
          <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
            <Lock className="h-4 w-4 text-foreground/50" />
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a password (min. 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-foreground/50 transition-colors hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength meter — fades/grows in only once typing starts */}
          <div
            className={`grid transition-all duration-300 ease-out ${
              password ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${strength.fill}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                  {strength.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Continue</span><ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

// ─── Email Verification ──────────────────────────────────────────────────────
function EmailVerificationCard({
  email,
  onVerified,
  onSignOut,
}: {
  email: string;
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return setError("Your session expired. Please sign in again.");
      const token = await user.getIdToken();
      const res = await verifyEmailVerificationOtp({ data: { token, code } });
      if (!res.ok) {
        setError(res.error ?? "Incorrect code.");
        triggerShake();
        return;
      }
      onVerified();
    } catch {
      setError("Something went wrong. Please try again.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    setResending(true);
    try {
      const user = auth.currentUser;
      if (!user) return setError("Your session expired. Please sign in again.");
      const token = await user.getIdToken();
      await sendEmailVerificationOtp({ data: { token } });
      setCooldown(60);
    } catch {
      setError("Couldn't resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleSignOutClick() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="mb-2 text-center">
        <div className="clay-inset mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
          <ShieldCheck className="h-5 w-5 text-[var(--sky-deep)]" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Verify your email
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it below to
          activate your account.
        </p>
      </div>

      <div
        className={`clay-inset flex items-center gap-3 px-4 py-3.5 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40 ${
          shake ? "animate-shake" : ""
        }`}
      >
        <KeyRound className="h-4 w-4 shrink-0 text-foreground/50" />
        <input
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
          required
          autoFocus
          style={{ letterSpacing: "0.5em", fontWeight: 700, textAlign: "center" }}
          className="w-full bg-transparent text-lg text-foreground placeholder:text-foreground/20 focus:outline-none"
        />
      </div>

      {error && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Verify & continue</span><ArrowRight className="h-4 w-4" /></>}
      </button>

      <div className="flex items-center justify-center gap-4 text-center text-xs text-foreground/60">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-semibold text-[var(--sky-deep)] transition-colors hover:underline disabled:text-foreground/40 disabled:no-underline"
        >
          {resending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>

        <span className="text-foreground/30">•</span>

        {/* NEW: escape hatch for stuck/unverified sessions on shared devices */}
        <button
          type="button"
          onClick={handleSignOutClick}
          disabled={signingOut}
          className="font-semibold text-foreground/70 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Not you? Sign out"}
        </button>
      </div>
    </form>
  );
}

// ─── Onboarding — now a 3-step wizard instead of one long form ─────────────
// Splitting Personal / Academic / Target into separate steps with a progress
// bar keeps each screen short, which matters a lot on small devices where
// the old all-at-once form felt cramped and overwhelming.
const ONBOARDING_STEPS = ["Personal", "Academic", "Target"] as const;

function OnboardingCard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile>({
    fullName: "",
    mobile: "",
    city: "",
    currentClass: "",
    board: "",
    targetExam: "NEET",
    track: "",
    cuetDomainSubjects: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof OnboardingProfile>(k: K, v: OnboardingProfile[K]) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!profile.fullName.trim()) return "Please enter your full name.";
      if (!/^\d{10}$/.test(profile.mobile)) return "Enter a valid 10-digit mobile number.";
      if (!profile.city.trim()) return "Please enter your city or town.";
    }
    if (s === 1) {
      if (!profile.currentClass) return "Select your current class.";
      if (!profile.board) return "Select your board.";
    }
    if (s === 2) {
      if (!profile.track) return "Pick your track.";
    }
    return null;
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, ONBOARDING_STEPS.length - 1));
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validateStep(2);
    if (err) return setError(err);

    const user = auth.currentUser;
    if (!user) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const normalizedProfile = {
        ...profile,
        targetExam: (() => {
          const value = profile.targetExam.toLowerCase();
          if (value.includes("neet")) return "neet";
          if (value.includes("jee")) return "jee";
          if (value.includes("cuet")) return "cuet";
          if (value.includes("ipmat")) return "ipmat";
          return "";
        })(),
        cuetDomainSubjects: profile.cuetDomainSubjects.map((subject) => subject.trim()).filter(Boolean),
      };
      await saveProfile({ data: { token, profile: normalizedProfile } });
      onComplete();
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="text-center">
        <div className="clay-chip mx-auto mb-3 inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground/70">
          <Sparkles className="h-3.5 w-3.5 text-[var(--sky-deep)]" />
          Almost there
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tell us about you
        </h2>
        <p className="mt-1 text-sm text-foreground/60">
          A few quick details so we can tailor your dashboard.
        </p>
      </div>

      {/* Step progress */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          {ONBOARDING_STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  i < step
                    ? "bg-[var(--sky-deep)] text-white"
                    : i === step
                      ? "clay-btn text-white"
                      : "clay-inset text-foreground/40"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < ONBOARDING_STEPS.length - 1 && (
                <div className="mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-[var(--sky-deep)] transition-all duration-500 ease-out"
                    style={{ width: i < step ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
          {ONBOARDING_STEPS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>

      {/* Step content — remounts + animates on every step change */}
      <div key={step} className="animate-in fade-in slide-in-from-right-2 min-h-[13rem] duration-250">
        {step === 0 && (
          <Section title="Personal">
            <ClayInput
              icon={<User className="h-4 w-4" />}
              placeholder="Full name"
              value={profile.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              autoComplete="name"
              required
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ClayInput
                icon={<Phone className="h-4 w-4" />}
                type="tel"
                inputMode="numeric"
                placeholder="Mobile (10 digits)"
                value={profile.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                required
              />
              <ClayInput
                icon={<MapPin className="h-4 w-4" />}
                placeholder="City / Town / Village"
                value={profile.city}
                onChange={(e) => set("city", e.target.value)}
                autoComplete="address-level2"
                required
              />
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title="Academic">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ClaySelect
                icon={<GraduationCap className="h-4 w-4" />}
                value={profile.currentClass}
                onChange={(e) => set("currentClass", e.target.value)}
                required
              >
                <option value="">Current class</option>
                <option>Class 11</option>
                <option>Class 12</option>
                <option>Dropper</option>
              </ClaySelect>
              <ClaySelect
                icon={<GraduationCap className="h-4 w-4" />}
                value={profile.board}
                onChange={(e) => set("board", e.target.value)}
                required
              >
                <option value="">Board / State board</option>
                <option>CBSE</option>
                <option>ICSE</option>
                <option>Maharashtra</option>
                <option>Karnataka</option>
                <option>Tamil Nadu</option>
                <option>Uttar Pradesh</option>
                <option>West Bengal</option>
                <option>Other</option>
              </ClaySelect>
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section title="Target">
            <ClaySelect
              icon={<Target className="h-4 w-4" />}
              value={profile.targetExam}
              onChange={(e) => set("targetExam", e.target.value)}
            >
              <optgroup label="NEET">
                <option>NEET</option>
                <option>NEET + AIIMS</option>
              </optgroup>
              <optgroup label="JEE">
                <option>JEE Main</option>
                <option>JEE Main + Advanced</option>
              </optgroup>
              <optgroup label="CUET">
                <option>CUET (UG)</option>
              </optgroup>
              <optgroup label="IPMAT">
                <option>IPMAT</option>
              </optgroup>
            </ClaySelect>

            {profile.targetExam.toLowerCase().includes("cuet") && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                  CUET domain subjects
                </p>
                <input
                  value={profile.cuetDomainSubjects.join(", ")}
                  onChange={(e) =>
                    set(
                      "cuetDomainSubjects",
                      e.target.value
                        .split(",")
                        .map((subject) => subject.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Accountancy, General Test"
                  className="clay-inset w-full rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                />
                <p className="mt-1 text-xs text-foreground/50">Separate multiple subjects with commas.</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                I am a
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {(["Dropper", "11th", "12th"] as const).map((t) => (
                  <TrackChip key={t} active={profile.track === t} onClick={() => set("track", t)} label={t} />
                ))}
              </div>
            </div>
          </Section>
        )}
      </div>

      {error && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="clay-btn-ghost flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-foreground/70 transition-transform hover:scale-[1.02]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {step < ONBOARDING_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="clay-btn flex flex-1 items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01]"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="clay-btn flex flex-1 items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Finish & Enter Dashboard</span><ArrowRight className="h-4 w-4" /></>}
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TrackChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold transition-all duration-200 " +
        (active ? "clay-btn scale-[1.02] text-white" : "clay-btn-ghost text-foreground/80 hover:scale-[1.02]")
      }
    >
      {active && <Check className="h-4 w-4" />}
      {label}
    </button>
  );
}