// "Challenge a friend" on a finished Quick Mock: makes a link to the same 20 questions on the same clock, and shares it.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Swords } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createChallengeFromDrill } from "@/server-functions/challenges";
import { challengeLink } from "@/lib/challenge";
import { track } from "@/lib/analytics";

export function ChallengeShare({ drillId, challengeCode, score, maxScore }: { drillId: string; challengeCode: string | null; score: number; maxScore: number }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<"share" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(): Promise<string | null> {
    if (!user) return null;
    try {
      const token = await user.getIdToken();
      const r = await createChallengeFromDrill({ data: { token, drillId } });
      return challengeLink(r.code, window.location.origin, r.refCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the challenge. Try again.");
      return null;
    }
  }

  async function share() {
    setBusy("share");
    setError(null);
    const url = await link();
    setBusy(null);
    if (!url) return;
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    track("challenge_shared", { channel: canShare ? "share_sheet" : "whatsapp", from: challengeCode ? "challenge_result" : "result" });
    const text = `I scored ${score}/${maxScore} on a 20-question Edurack Quick Mock. Same questions, same clock. Can you beat me? ${url}`;
    if (canShare) navigator.share({ title: "Edurack challenge", text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function copy() {
    setBusy("copy");
    setError(null);
    const url = await link();
    setBusy(null);
    if (!url) return;
    track("challenge_shared", { channel: "copy", from: challengeCode ? "challenge_result" : "result" });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link. Use Challenge a friend instead.");
    }
  }

  return (
    <div className="clay mt-6 p-5 sm:p-6" data-testid="challenge-share">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
          <Swords className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">{challengeCode ? "Challenge another friend" : "Challenge a friend"}</h2>
          <p className="mt-0.5 text-xs text-foreground/60">They get the same 20 questions on the same clock, and you see who scored more.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={share} disabled={busy !== null} className="clay-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60">
          <Swords className="h-4 w-4" aria-hidden /> Challenge a friend
        </button>
        <button type="button" onClick={copy} disabled={busy !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-bold text-foreground hover:bg-foreground/5 disabled:opacity-60">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      {challengeCode && (
        <Link to="/challenge/$code" params={{ code: challengeCode }} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sky-deep)] hover:underline">
          See the scoreboard
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
