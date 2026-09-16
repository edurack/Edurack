import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { internLogin, internSignUp } from "@/server-functions/intern-auth";

export const Route = createFileRoute("/intern/auth")({
  component: InternAuthPage,
});

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function InternAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [suUsername, setSuUsername] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [secretCode, setSecretCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function persistSession(token: string) {
    localStorage.setItem("internToken", token);
    navigate({ to: "/intern/dashboard" });
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await internLogin({ data: { username, password } });
      persistSession(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await internSignUp({ data: { username: suUsername, password: suPassword, secretCode } });
      persistSession(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="clay w-full max-w-sm p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Edurack Intern Portal</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {mode === "login" ? "Sign in to see your assigned tasks." : "Claim your invite to create an account."}
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              mode === "login" ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              mode === "signup" ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            Claim invite
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputClass} />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className={inputClass}
            />
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="clay-btn w-full rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="mt-6 space-y-4">
            <input
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              placeholder="Invite code (from Edurack)"
              className={inputClass}
            />
            <input
              value={suUsername}
              onChange={(e) => setSuUsername(e.target.value)}
              placeholder="Choose a username"
              className={inputClass}
            />
            <input
              value={suPassword}
              onChange={(e) => setSuPassword(e.target.value)}
              type="password"
              placeholder="Choose a password (min. 8 characters)"
              className={inputClass}
            />
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="clay-btn w-full rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
