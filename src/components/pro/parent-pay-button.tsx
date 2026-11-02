// "Ask a parent to pay": makes a payment link for one Pro plan and lets the student send it on WhatsApp or copy it.
// The parent opens the link (routes/pay.$token.tsx) and pays without an account. Many students are under 18,
// so this is often the step between "I want Pro" and Pro being paid for.
//
// The link is shown after it is made, with a plain WhatsApp link and a copy button, rather than opening the
// share sheet straight away: phones only allow that from a tap, and the network call in between can lose it.
import { useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { track } from "@/lib/analytics";
import { createParentPayLink } from "@/server-functions/parent-pay";
import type { ProPlanPublic } from "@/lib/pro";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ParentPayButton({
  plan,
  getToken,
  source,
  tone = "light",
}: {
  plan: ProPlanPublic;
  getToken: () => Promise<string>;
  /** Where the button sits (analytics label). */
  source: string;
  /** "dark" for the dark Pro panel on the drill page. */
  tone?: "light" | "dark";
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; validDays: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const muted = tone === "dark" ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const strong = tone === "dark" ? "text-white" : "text-foreground";
  const message = (url: string) => `Please help me with Edurack Pro (${plan.name}, ${rupees(plan.price)} for ${plan.durationDays} days) for my exam preparation. You can pay securely here, no sign-in needed: ${url}`;

  async function create() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await createParentPayLink({ data: { token: await getToken(), planId: plan.id } });
      track("parent_pay_link_created", { plan_id: plan.id, price: plan.price, source });
      setMade({ url: res.url, validDays: res.validDays });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not make the link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    track("parent_pay_link_shared", { plan_id: plan.id, channel: "copy", source });
    try {
      await navigator.clipboard.writeText(message(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErr("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  if (made) {
    return (
      <div className="mt-3 text-left text-xs">
        <p className={`font-semibold ${strong}`}>Link ready. It works for {made.validDays} days.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message(made.url))}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("parent_pay_link_shared", { plan_id: plan.id, channel: "whatsapp", source })}
            className="inline-flex min-h-10 items-center rounded-full bg-emerald-500 px-4 text-xs font-bold text-white hover:bg-emerald-600"
          >
            Send on WhatsApp
          </a>
          <button type="button" onClick={() => void copy(made.url)} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-xs font-bold ${tone === "dark" ? "border-white/25 text-white hover:bg-white/10" : "border-border text-foreground hover:bg-muted"}`}>
            {copied ? "Copied" : "Copy message"}
          </button>
        </div>
        <p className={`mt-2 break-all ${muted}`}>{made.url}</p>
        {err && <p role="alert" className="mt-2 font-semibold text-rose-500">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 text-center">
      <button type="button" disabled={busy} onClick={() => void create()} className={`inline-flex min-h-10 items-center justify-center gap-2 text-xs font-semibold underline underline-offset-2 disabled:opacity-60 ${muted}`}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Ask a parent to pay
      </button>
      {err && <p role="alert" className="mt-1 text-xs font-semibold text-rose-500">{err}</p>}
    </div>
  );
}
