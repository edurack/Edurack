import { useEffect, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { reportQuestion } from "@/server-functions/question-reports";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

/** "Report a question" — bottom sheet on phones, centred card on larger screens. */
export function ReportDialog({ questionId, onClose }: { questionId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!user || !reason) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await reportQuestion({ data: { token, questionId, reason, note } });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report this question"
        onClick={(e) => e.stopPropagation()}
        className="clay max-h-[90vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none sm:rounded-b-3xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-foreground">Report this question</p>
            <p className="mt-0.5 text-xs text-foreground/60">Spotted a mistake? Our team checks every report.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/50 hover:bg-foreground/5">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center" role="status">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
            <p className="mt-3 text-sm font-bold text-foreground">Thanks — report received.</p>
            <p className="mt-1 text-xs text-foreground/60">If it's a mistake, we'll fix it for everyone.</p>
            <button onClick={onClose} className="clay-btn mt-5 rounded-full px-6 py-2.5 text-sm font-bold text-white">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2" role="radiogroup" aria-label="What's wrong?">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "w-full rounded-2xl border px-3.5 py-3 text-left text-sm transition-colors",
                    reason === r ? "border-[var(--sky-deep)] bg-[var(--sky-soft)]/50 font-semibold" : "border-transparent bg-foreground/[0.04] hover:bg-foreground/[0.07]",
                  )}
                >
                  {REPORT_REASON_LABELS[r]}
                </button>
              ))}
            </div>
            <label htmlFor="report-note" className="mb-1.5 mt-4 block text-xs font-semibold text-foreground/60">
              Details {reason === "other" ? "(required)" : "(optional)"}
            </label>
            <textarea
              id="report-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. I think the answer should be C because…"
              className="clay-inset w-full resize-none rounded-2xl border border-transparent px-3.5 py-3 text-sm text-foreground outline-none focus:border-[var(--sky-deep)]"
            />
            {error && <p className="mt-2 text-xs font-semibold text-destructive">{error}</p>}
            <button
              onClick={submit}
              disabled={!reason || busy}
              className="clay-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send report
            </button>
          </>
        )}
      </div>
    </div>
  );
}
