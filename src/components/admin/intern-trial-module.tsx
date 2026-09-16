import { useEffect, useState, type FormEvent } from "react";
import { createTrialAssignment, listTrialAssignments, reviewTrialAssignment } from "@/server-functions/intern-trial";
import { createInternInvite } from "@/server-functions/intern-auth";

type AdminUser = { getIdToken: () => Promise<string> };

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function InternTrialModule({ adminUser }: { adminUser: AdminUser }) {
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof listTrialAssignments>>["assignments"] | null>(
    null,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [sampleCount, setSampleCount] = useState("5");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: string; notes: string }>>({});

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { assignments: rows } = await listTrialAssignments({ data: { token } });
    setAssignments(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const token = await adminUser.getIdToken();
      const res = await createTrialAssignment({
        data: {
          token,
          assignment: { candidateName: name, candidateEmail: email, subjectLabel, instructions, sampleCount: Number(sampleCount) },
        },
      });
      setLastLink(`${window.location.origin}/intern/trial/${res.code}`);
      setName("");
      setEmail("");
      setSubjectLabel("");
      setInstructions("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the trial link.");
    }
  }

  async function handleReview(assignmentId: string, decision: "advance" | "reject") {
    const draft = scoreDraft[assignmentId];
    const score = Number(draft?.score ?? 0);
    if (!score || score < 1 || score > 5) return;
    const token = await adminUser.getIdToken();
    await reviewTrialAssignment({
      data: { token, assignmentId, review: { reviewScore: score, reviewNotes: draft?.notes ?? "", reviewDecision: decision } },
    });
    await refresh();
  }

  async function handleConvertToInvite(candidateName: string, candidateEmail: string) {
    const token = await adminUser.getIdToken();
    const res = await createInternInvite({ data: { token, invite: { name: candidateName, email: candidateEmail } } });
    window.alert(`Invite code for ${candidateName}: ${res.secretCode}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Pre-Hire Sample Task</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Fully sandboxed — candidates never see real bundles, tests, or questions.
        </p>
      </div>

      <form onSubmit={handleCreate} className="clay space-y-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Send a sample task</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Candidate name" className={inputClass} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Candidate email" className={inputClass} />
          <input
            value={subjectLabel}
            onChange={(e) => setSubjectLabel(e.target.value)}
            placeholder="Subject/topic, e.g. Physics — Kinematics (Class 11)"
            className={inputClass + " sm:col-span-2"}
          />
          <input
            value={sampleCount}
            onChange={(e) => setSampleCount(e.target.value)}
            inputMode="numeric"
            placeholder="Number of sample questions"
            className={inputClass}
          />
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Instructions shown to the candidate"
          className={inputClass + " h-auto resize-none py-3"}
        />
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {lastLink && (
          <p className="clay-inset break-all rounded-2xl px-4 py-3 text-sm text-foreground">
            Send this link to the candidate: <span className="font-mono">{lastLink}</span>
          </p>
        )}
        <button type="submit" className="clay-btn rounded-full px-6 py-2.5 text-sm font-semibold text-white">
          Create trial link
        </button>
      </form>

      <div className="space-y-4">
        {assignments?.map((a) => (
          <div key={a.id} className="clay p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{a.candidateName}</p>
                <p className="text-xs text-foreground/50">
                  {a.candidateEmail} · {a.subjectLabel}
                </p>
              </div>
              <span className="rounded-full bg-[var(--sky-soft)] px-3 py-1 text-xs font-bold uppercase text-foreground">
                {a.status}
              </span>
            </div>

            {a.status === "submitted" && (
              <div className="mt-4 space-y-3">
                {a.answers.map((ans, i) => (
                  <div key={i} className="clay-inset rounded-2xl p-4">
                    <p className="text-sm text-foreground">{ans.body}</p>
                    {ans.type === "mcq" && ans.options && (
                      <ul className="mt-1 space-y-0.5 text-xs text-foreground/60">
                        {(["A", "B", "C", "D"] as const).map((k) => (
                          <li key={k} className={ans.correctOption === k ? "font-semibold text-emerald-600" : ""}>
                            {k}. {ans.options![k]}
                          </li>
                        ))}
                      </ul>
                    )}
                    {ans.type === "integer" && <p className="mt-1 text-xs text-foreground/60">Answer: {ans.correctAnswer}</p>}
                    <p className="mt-1 text-xs text-foreground/50">Solution: {ans.solution}</p>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    value={scoreDraft[a.id]?.score ?? ""}
                    onChange={(e) =>
                      setScoreDraft((s) => ({ ...s, [a.id]: { ...s[a.id], score: e.target.value, notes: s[a.id]?.notes ?? "" } }))
                    }
                    placeholder="Score 1-5"
                    className={inputClass + " w-28"}
                  />
                  <input
                    value={scoreDraft[a.id]?.notes ?? ""}
                    onChange={(e) =>
                      setScoreDraft((s) => ({ ...s, [a.id]: { ...s[a.id], notes: e.target.value, score: s[a.id]?.score ?? "" } }))
                    }
                    placeholder="Notes"
                    className={inputClass + " flex-1"}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleReview(a.id, "advance")} className="clay-btn rounded-full px-5 py-2 text-xs font-bold text-white">
                    Advance candidate
                  </button>
                  <button onClick={() => handleReview(a.id, "reject")} className="clay-chip rounded-full px-5 py-2 text-xs font-bold text-rose-600">
                    Reject
                  </button>
                </div>
              </div>
            )}

            {a.status === "reviewed" && (
              <div className="mt-3 text-sm text-foreground/70">
                Score: {a.reviewScore}/5 · {a.reviewDecision === "advance" ? "Advancing" : "Rejected"}
                {a.reviewNotes && ` — ${a.reviewNotes}`}
                {a.reviewDecision === "advance" && (
                  <button
                    onClick={() => handleConvertToInvite(a.candidateName, a.candidateEmail)}
                    className="clay-chip ml-3 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Send real intern invite
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
