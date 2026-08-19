import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, ShieldCheck, Mail, Lock, KeyRound, Eye, EyeOff, User } from "lucide-react";
import { auth, firebaseSignIn, firebaseSignUp, signOutUser } from "@/lib/firebase";
import { useAdminClaim } from "@/lib/use-admin-claim";
import { verifyAdminAccess } from "@/server-functions/admin";
import { mentorLogin } from "@/server-functions/mentor-auth";

export const Route = createFileRoute("/admin/auth")({
  head: () => ({
    meta: [
      { title: "Admin Access · Edurack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAuthPage,
});

// Key used to store the mentor's signed session token client-side. The
// (future) mentor dashboard reads this and calls getMentorSession to verify
// it and load the mentor's profile.
const MENTOR_SESSION_KEY = "mentor_session_token";

async function waitForAdminClaim(maxAttempts = 5, delayMs = 400): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await auth.currentUser!.getIdTokenResult(true);
    if (result.claims.admin === true) return true;
    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

type Tab = "signin" | "signup" | "mentor";

function AdminAuthPage() {
  const { adminUser, isAdmin, loading } = useAdminClaim();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("signin");

  useEffect(() => {
    if (!loading && adminUser && isAdmin) {
      navigate({ to: "/admin/dashboard" });
    }
  }, [loading, adminUser, isAdmin, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const heading =
    tab === "signin" ? "Admin sign in" : tab === "signup" ? "Register admin account" : "Mentor sign in";
  const subheading =
    tab === "mentor"
      ? "Sign in with the username and password given to you by an admin."
      : "Restricted access. A valid security passkey is required.";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--admin-bg,inherit)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--mint-soft)] opacity-50 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="clay flex h-14 w-14 items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-foreground/70" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/60">
            Edurack — Admin Portal
          </p>
        </div>

        <div className="clay w-full p-5 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-foreground/60">{subheading}</p>
          </div>

          <div className="clay-inset mx-auto mb-6 grid max-w-xs grid-cols-3 gap-1 p-1">
            <button
              type="button"
              onClick={() => setTab("signin")}
              className={`rounded-full py-2 text-xs font-semibold transition-all ${tab === "signin" ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`rounded-full py-2 text-xs font-semibold transition-all ${tab === "signup" ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground"}`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => setTab("mentor")}
              className={`rounded-full py-2 text-xs font-semibold transition-all ${tab === "mentor" ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground"}`}
            >
              Mentor
            </button>
          </div>

          {tab === "signin" && <AdminSignInForm />}
          {tab === "signup" && <AdminSignUpForm />}
          {tab === "mentor" && <MentorSignInForm />}
        </div>

        <p className="mt-6 max-w-sm text-center text-xs text-foreground/50">
          This portal is isolated from student accounts. Access attempts are logged.
        </p>
      </div>
    </div>
  );
}

function friendlyAdminError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = (err as { message?: string })?.message ?? "";
  if (message.includes("Invalid passkey")) return "Incorrect security passkey.";
  if (message.includes("ADMIN_PASSKEY")) return "Admin portal is not configured yet. Contact the developer.";
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
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a bit.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function friendlyMentorError(err: unknown): string {
  const message = (err as { message?: string })?.message ?? "";
  if (message.includes("MENTOR_SESSION_SECRET")) {
    return "Mentor login is not configured yet. Contact the developer.";
  }
  if (message.includes("Incorrect username or password") || message.includes("Invalid username or password")) {
    return "Incorrect username or password.";
  }
  return "Something went wrong. Please try again.";
}

function ClayInput({
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
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

function AdminSignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passkey, setPasskey] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password || !passkey) {
      setError("All fields, including the security passkey, are required.");
      return;
    }
    setLoading(true);
    try {
      await firebaseSignIn(email, password);
      const token = await auth.currentUser!.getIdToken();
      await verifyAdminAccess({ data: { token, passkey } });

      const claimed = await waitForAdminClaim();
      if (!claimed) {
        setError("Admin access was granted, but it's taking a moment to sync. Please try signing in again.");
        if (auth.currentUser) await signOutUser();
        return;
      }
      navigate({ to: "/admin/dashboard" });
    } catch (err) {
      setError(friendlyAdminError(err));
      // If the passkey was wrong, don't leave an authenticated-but-
      // unauthorized session sitting around.
      if (auth.currentUser) await signOutUser();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <ClayInput
        icon={<Mail className="h-4 w-4" />}
        type="email"
        placeholder="Admin email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input
          type={show ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-foreground/50 hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <ClayInput
        icon={<KeyRound className="h-4 w-4" />}
        type="password"
        placeholder="Security passkey"
        value={passkey}
        onChange={(e) => setPasskey(e.target.value)}
        required
      />

      {error && (
        <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enter Command Center"}
      </button>
    </form>
  );
}

function AdminSignUpForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passkey, setPasskey] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (!passkey) return setError("A security passkey is required to register.");

    setLoading(true);
    try {
      await firebaseSignUp(email, password);
      const token = await auth.currentUser!.getIdToken();
      await verifyAdminAccess({ data: { token, passkey } });

      const claimed = await waitForAdminClaim();
      if (!claimed) {
        setError("Admin access was granted, but it's taking a moment to sync. Please try signing in again.");
        if (auth.currentUser) await signOutUser();
        return;
      }
      navigate({ to: "/admin/dashboard" });
    } catch (err) {
      setError(friendlyAdminError(err));
      if (auth.currentUser) await signOutUser();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <ClayInput
        icon={<Mail className="h-4 w-4" />}
        type="email"
        placeholder="Admin email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input
          type={show ? "text" : "password"}
          placeholder="Create a password (min. 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-foreground/50 hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <ClayInput
        icon={<KeyRound className="h-4 w-4" />}
        type="password"
        placeholder="Security passkey (given by your admin)"
        value={passkey}
        onChange={(e) => setPasskey(e.target.value)}
        required
      />

      {error && (
        <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register & Enter"}
      </button>
    </form>
  );
}

// ─── Mentor sign in ───────────────────────────────────────────────────────
// Mentors are NOT Firebase users — they were onboarded directly into
// MongoDB with a username/hashed-password pair (Module 6). So this form
// bypasses Firebase entirely and calls mentorLogin, which checks the
// credentials against MongoDB and returns a signed HMAC session token. That
// token is stored client-side and is what the (future) mentor dashboard
// will read to confirm the session and load the mentor's profile.
function MentorSignInForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      const result = await mentorLogin({ data: { username: username.trim(), password } });
      localStorage.setItem(MENTOR_SESSION_KEY, result.token);
      navigate({ to: "/mentor/dashboard" });
    } catch (err) {
      setError(friendlyMentorError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <ClayInput
        icon={<User className="h-4 w-4" />}
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      <div className="clay-inset flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--sky-deep)]/40">
        <Lock className="h-4 w-4 text-foreground/50" />
        <input
          type={show ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-foreground/50 hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="clay-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in as Mentor"}
      </button>
    </form>
  );
}

