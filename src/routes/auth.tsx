import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { IconArrowLeft as ArrowLeft, IconArrowRight as ArrowRight, IconCheck as Check, IconEye as Eye, IconKey as KeyRound, IconLoader2 as Loader2, IconMail as Mail, IconLock as Lock, IconSparkles as Sparkles, IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { EyeOff } from "lucide-react"; // TODO: no Tabler mapping found yet
import type { User as FirebaseUser } from "firebase/auth";
import { auth, firebaseSignIn, firebaseSignUp, googleAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { ensureUserRecord, getProfile, needsOnboarding, saveProfile } from "@/server-functions/profile";
import { recordSession } from "@/server-functions/sessions";
import { sendEmailVerificationOtp, verifyEmailVerificationOtp } from "@/server-functions/email-verification";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { tab?: "signin" | "signup" } => ({
    tab: search.tab === "signup" ? "signup" : search.tab === "signin" ? "signin" : undefined,
  }),
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
  const initialTab = Route.useSearch().tab;
  const [tab, setTab] = useState<Tab>(initialTab ?? "signin");
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
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <aside className="ink-section hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <img src="/edurack-logo.webp" alt="Edurack" width={62} height={70} className="h-10 w-auto object-contain" />
          <span className="font-display text-xl font-extrabold tracking-tight">edurack</span>
        </Link>
        <div>
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight">
            <span className="block font-light">Take the mock.</span>
            <span className="block font-extrabold">Fix what costs you marks.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-white/70">
            <li>Exam-format mocks for NEET, JEE, CUET and IPMAT</li>
            <li>Accuracy, speed and concept gaps after every test</li>
            <li>Mentors who have cleared the same exam</li>
          </ul>
        </div>
        <p className="text-sm text-white/40">edurack.in</p>
      </aside>

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
          <div className="flex h-12 w-auto items-center justify-center sm:h-14 lg:hidden">
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
              src="https://www.edurack.in/edurack-logo.webp"
              alt="Edurack"
              width={62}
              height={70}
              className="h-10 w-auto object-contain sm:h-12"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <p className="font-display text-lg font-extrabold tracking-tight text-foreground lg:hidden">edurack</p>
        </div>

        {/* Main card — key={stage} forces a remount so each stage change
            plays its own fade/slide-in rather than snapping instantly. */}
        <div key={stage} className="animate-in fade-in slide-in-from-bottom-3 w-full max-w-md rounded-3xl border border-border bg-card p-5 duration-300 sm:p-8">
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
    <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      {icon && <span className="text-foreground/50">{icon}</span>}
      <input
        {...props}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
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
        <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
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
          <div className="clay-inset flex items-center gap-3 px-4 py-3 transition-shadow duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
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
        className={`clay-inset flex items-center gap-3 px-4 py-3.5 transition-shadow duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${
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

// ─── Onboarding — single screen, zero keyboard input ───────────────────────
// Two taps (exam + track) and the user is in. Everything else the backend
// needs is auto-filled with safe defaults on submit; real phone numbers and
// other details are collected later, right before premium tests.
type ExamChoice = "jee" | "neet";
type TrackChoice = "11th" | "12th" | "Dropper";

const EXAM_OPTIONS: ReadonlyArray<{ value: ExamChoice; title: string; subtitle: string }> = [
  { value: "jee", title: "JEE", subtitle: "Engineering" },
  { value: "neet", title: "NEET", subtitle: "Medical" },
];

const TRACK_OPTIONS: ReadonlyArray<TrackChoice> = ["11th", "12th", "Dropper"];

function currentClassFor(track: TrackChoice): string {
  if (track === "Dropper") return "Dropper";
  return track === "11th" ? "Class 11" : "Class 12";
}

function OnboardingCard({ onComplete }: { onComplete: () => void }) {
  const [exam, setExam] = useState<ExamChoice | null>(null);
  const [track, setTrack] = useState<TrackChoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = exam !== null && track !== null && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!exam || !track) {
      setError("Pick your exam and your current status to continue.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const profile: OnboardingProfile = {
        fullName: user.displayName?.trim() || "Student",
        mobile: "0000000000", // placeholder — collected before premium tests
        city: "Not Specified",
        currentClass: currentClassFor(track),
        board: "CBSE",
        targetExam: exam,
        track,
        cuetDomainSubjects: [],
      };
      await saveProfile({ data: { token, profile } });
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
          Set up your prep
        </h2>
        <p className="mt-1 text-sm text-foreground/60">
          Just two taps and your dashboard is ready.
        </p>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-300">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
            I'm preparing for
          </legend>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Target exam">
            {EXAM_OPTIONS.map((opt) => (
              <ExamCard
                key={opt.value}
                active={exam === opt.value}
                onClick={() => {
                  setExam(opt.value);
                  setError(null);
                }}
                title={opt.title}
                subtitle={opt.subtitle}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
            I am a
          </legend>
          <div className="clay-inset grid grid-cols-3 gap-2 p-2" role="radiogroup" aria-label="Current status">
            {TRACK_OPTIONS.map((t) => (
              <TrackChip
                key={t}
                active={track === t}
                onClick={() => {
                  setTrack(t);
                  setError(null);
                }}
                label={t}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {error && (
        <p
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground duration-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <span>Enter Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

function ExamCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "relative flex min-h-28 flex-col items-center justify-center gap-1 rounded-3xl px-4 py-5 text-center transition-all duration-200 active:scale-[0.98] " +
        (active ? "clay-btn scale-[1.02] text-white" : "clay-btn-ghost text-foreground/80 hover:scale-[1.02]")
      }
    >
      {active && (
        <span className="animate-in zoom-in-50 absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-white/25 duration-200">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="font-display text-xl font-extrabold tracking-tight">{title}</span>
      <span className={"text-xs font-medium " + (active ? "text-white/80" : "text-foreground/50")}>
        ({subtitle})
      </span>
    </button>
  );
}

function TrackChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "relative flex min-h-12 items-center justify-center gap-1.5 rounded-full px-3 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] " +
        (active ? "clay-btn scale-[1.02] text-white" : "clay-btn-ghost text-foreground/80 hover:scale-[1.02]")
      }
    >
      {active && <Check className="h-4 w-4" />}
      {label}
    </button>
  );
}