import { useEffect, useState, type FormEvent } from "react";
import { IconLoader2 as Loader2, IconCircleCheck as CheckCircle2, IconX as XIcon, IconMail as Mail } from "@tabler/icons-react";
import { listBundles, listTestCoresForBundle } from "@/server-functions/admin";
import { createInternInvite, listInterns, setInternStatus } from "@/server-functions/intern-auth";
import { assignInternTask, listSubmittedDrafts, approveDraft, rejectDraft } from "@/server-functions/admin-interns";
import { QuestionContentRenderer } from "@/components/shared/question-content-renderer";

type AdminUser = { getIdToken: () => Promise<string> };
type Tab = "interns" | "assign" | "review";

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function InternHubModule({ adminUser }: { adminUser: AdminUser }) {
  const [tab, setTab] = useState<Tab>("interns");

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Intern Program</h1>
        <p className="mt-1 text-sm text-foreground/60">Invites, task assignment, and question review.</p>
      </div>

      <div className="mb-6 flex gap-2">
        {(["interns", "assign", "review"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              tab === t ? "clay-btn text-white" : "clay-chip text-foreground/70"
            }`}
          >
            {t === "interns" ? "Interns" : t === "assign" ? "Assign task" : "Review queue"}
          </button>
        ))}
      </div>

      {tab === "interns" && <InternsTab adminUser={adminUser} />}
      {tab === "assign" && <AssignTab adminUser={adminUser} />}
      {tab === "review" && <ReviewTab adminUser={adminUser} />}
    </div>
  );
}

// ─── Interns tab: invite + status management ───────────────────────────
function InternsTab({ adminUser }: { adminUser: AdminUser }) {
  const [interns, setInterns] = useState<Awaited<ReturnType<typeof listInterns>>["interns"] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lastResult, setLastResult] = useState<{ code: string; emailSent: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { interns: rows } = await listInterns({ data: { token } });
    setInterns(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      const res = await createInternInvite({ data: { token, invite: { name, email } } });
      setLastResult({ code: res.secretCode, emailSent: res.emailSent });
      setName("");
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the invite.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(internId: string, status: "active" | "suspended") {
    const token = await adminUser.getIdToken();
    await setInternStatus({ data: { token, internId, status } });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="clay space-y-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Invite a candidate</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
        </div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {lastResult && (
          <p
            className={`clay-inset flex items-start gap-2 rounded-2xl px-4 py-3 text-sm text-foreground ${
              lastResult.emailSent ? "bg-[var(--mint-soft)]/40" : "bg-[var(--coral-soft)]/40"
            }`}
          >
            {lastResult.emailSent ? (
              <>
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                Invite emailed to the candidate. Their code is{" "}
                <span className="font-mono font-bold">{lastResult.code}</span> in case they need it again.
              </>
            ) : (
              <>
                The invite was created, but the email failed to send. Share this code with them directly:{" "}
                <span className="font-mono font-bold">{lastResult.code}</span>
              </>
            )}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
        </button>
      </form>

      <div className="clay p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">All interns</h2>
        <div className="space-y-2">
          {interns === null && <p className="text-sm text-foreground/50">Loading…</p>}
          {interns?.map((i) => (
            <div key={i.id} className="clay-inset flex items-center justify-between rounded-2xl p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{i.name}</p>
                <p className="text-xs text-foreground/50">
                  {i.email} {i.username ? `· @${i.username}` : "· invite not claimed yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    i.status === "active"
                      ? "bg-[var(--mint-soft)] text-foreground"
                      : i.status === "suspended"
                        ? "bg-[var(--coral-soft)] text-foreground"
                        : "bg-[var(--sky-soft)] text-foreground"
                  }`}
                >
                  {i.status}
                </span>
                {i.status === "active" && (
                  <button
                    onClick={() => toggleStatus(i.id, "suspended")}
                    className="clay-chip rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Suspend
                  </button>
                )}
                {i.status === "suspended" && (
                  <button
                    onClick={() => toggleStatus(i.id, "active")}
                    className="clay-chip rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Assign task tab ─────────────────────────────────────────────────────
function AssignTab({ adminUser }: { adminUser: AdminUser }) {
  const [interns, setInterns] = useState<Awaited<ReturnType<typeof listInterns>>["interns"] | null>(null);
  const [bundles, setBundles] = useState<{ id: string; title: string }[] | null>(null);
  const [tests, setTests] = useState<{ id: string; name: string; subjects: string[] }[] | null>(null);

  const [internId, setInternId] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [testId, setTestId] = useState("");
  const [subject, setSubject] = useState("");
  const [targetCount, setTargetCount] = useState("10");
  const [instructions, setInstructions] = useState("");
  const [referencePdfUrl, setReferencePdfUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{ emailSent: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const token = await adminUser.getIdToken();
      const [{ interns: internRows }, { bundles: bundleRows }] = await Promise.all([
        listInterns({ data: { token } }),
        listBundles({ data: { token } }),
      ]);
      setInterns(internRows.filter((i) => i.status === "active"));
      setBundles(bundleRows.map((b) => ({ id: b.id, title: b.title })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bundleId) {
      setTests(null);
      setTestId("");
      return;
    }
    (async () => {
      const token = await adminUser.getIdToken();
      const { testCores } = await listTestCoresForBundle({ data: { token, bundleId } });
      setTests(testCores.map((t) => ({ id: t.id, name: t.name, subjects: t.subjects ?? [] })));
      setTestId("");
      setSubject("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);

  const selectedTest = tests?.find((t) => t.id === testId) ?? null;

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessState(null);
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      const res = await assignInternTask({
        data: {
          token,
          task: {
            internId,
            bundleId,
            testId,
            subject,
            targetCount: Number(targetCount),
            instructions,
            referencePdfUrl: referencePdfUrl.trim() || null,
            dueDate: null,
          },
        },
      });
      setSuccessState({ emailSent: res.emailSent });
      setInstructions("");
      setReferencePdfUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign the task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAssign} className="clay space-y-4 p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <select value={internId} onChange={(e) => setInternId(e.target.value)} className={inputClass + " appearance-none"}>
          <option value="">{interns === null ? "Loading…" : "Select intern"}</option>
          {(interns ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          value={targetCount}
          onChange={(e) => setTargetCount(e.target.value)}
          inputMode="numeric"
          placeholder="Target question count"
          className={inputClass}
        />
        <select value={bundleId} onChange={(e) => setBundleId(e.target.value)} className={inputClass + " appearance-none"}>
          <option value="">{bundles === null ? "Loading…" : "Select bundle"}</option>
          {(bundles ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <select
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
          disabled={!bundleId}
          className={inputClass + " appearance-none disabled:opacity-50"}
        >
          <option value="">{!bundleId ? "Select a bundle first" : "Select test"}</option>
          {(tests ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!testId}
          className={inputClass + " appearance-none disabled:opacity-50 sm:col-span-2"}
        >
          <option value="">{!testId ? "Select a test first" : "Select subject"}</option>
          {(selectedTest?.subjects ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        placeholder="Instructions for the intern (style, difficulty mix, sources to use, etc.)"
        className={inputClass + " h-auto resize-none py-3"}
      />

      <input
        value={referencePdfUrl}
        onChange={(e) => setReferencePdfUrl(e.target.value)}
        placeholder="Reference document link (PDF, Drive, etc.) — the source material to transcribe from, optional"
        className={inputClass}
      />

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      {successState && (
        <p
          className={`flex items-center gap-1.5 text-xs font-medium ${
            successState.emailSent ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {successState.emailSent ? (
            <>
              <Mail className="h-3.5 w-3.5" /> Task assigned and emailed to the intern.
            </>
          ) : (
            "Task assigned, but the notification email failed to send — check their address on file."
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !internId || !bundleId || !testId || !subject || !targetCount}
        className="clay-btn flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign task"}
      </button>
    </form>
  );
}

// ─── Review queue tab ────────────────────────────────────────────────────
function ReviewTab({ adminUser }: { adminUser: AdminUser }) {
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof listSubmittedDrafts>>["drafts"] | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { drafts: rows } = await listSubmittedDrafts({ data: { token } });
    setDrafts(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApprove(draftId: string) {
    setBusyId(draftId);
    try {
      const token = await adminUser.getIdToken();
      await approveDraft({ data: { token, draftId, adminFeedback: feedback[draftId] } });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(draftId: string) {
    const reason = feedback[draftId]?.trim();
    if (!reason) return;
    setBusyId(draftId);
    try {
      const token = await adminUser.getIdToken();
      await rejectDraft({ data: { token, draftId, adminFeedback: reason } });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {drafts === null && <p className="text-sm text-foreground/50">Loading…</p>}
      {drafts?.length === 0 && <p className="text-sm text-foreground/50">Nothing waiting for review.</p>}
      {drafts?.map((d) => (
        <div key={d.id} className="clay p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            {d.internName} · {d.bundleTitle} · {d.testName} · {d.subject}
          </p>
          <p className="mt-2"><QuestionContentRenderer content={d.body} /></p>

          {d.type === "mcq" && d.options && (
            <ul className="mt-2 space-y-1.5">
              {(["A", "B", "C", "D"] as const).map((k) => (
                <li key={k} className={`flex gap-2 ${d.correctOption === k ? "text-emerald-600" : "text-foreground/70"}`}>
                  <span className="shrink-0 font-semibold">{k}.</span>
                  <QuestionContentRenderer content={d.options![k]} />
                </li>
              ))}
            </ul>
          )}
          {d.type === "integer" && <p className="mt-2 text-sm text-foreground/70">Answer: {d.correctAnswer}</p>}

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">Solution</p>
          <QuestionContentRenderer content={d.solution} className="text-foreground/70" />

          <textarea
            value={feedback[d.id] ?? ""}
            onChange={(e) => setFeedback((f) => ({ ...f, [d.id]: e.target.value }))}
            rows={2}
            placeholder="Feedback (required to reject, optional to approve)"
            className={inputClass + " mt-4 h-auto resize-none py-3"}
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleApprove(d.id)}
              disabled={busyId === d.id}
              className="clay-btn flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve
            </button>
            <button
              onClick={() => handleReject(d.id)}
              disabled={busyId === d.id || !feedback[d.id]?.trim()}
              className="clay-chip flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-rose-600 disabled:opacity-40"
            >
              <XIcon className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}