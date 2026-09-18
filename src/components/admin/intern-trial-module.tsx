import { useEffect, useState, type FormEvent } from "react";
import { IconMail as Mail, IconUpload as Upload, IconFileText as FileText, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { createTrialAssignment, listTrialAssignments, reviewTrialAssignment } from "@/server-functions/intern-trial";
import { createInternInvite } from "@/server-functions/intern-auth";
import { QuestionContentRenderer } from "@/components/shared/question-content-renderer";
import { uploadToSupabase, INTERN_DOCUMENTS_BUCKET, MAX_INTERN_DOCUMENT_BYTES } from "@/lib/supabase";

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
  const [referenceMaterialUrl, setReferenceMaterialUrl] = useState("");
  const [uploadingRef, setUploadingRef] = useState(false);
  const [refUploadError, setRefUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ emailSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: string; notes: string }>>({});
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());
  const [convertMessage, setConvertMessage] = useState<Record<string, string>>({});

  async function refresh() {
    const token = await adminUser.getIdToken();
    const { assignments: rows } = await listTrialAssignments({ data: { token } });
    setAssignments(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUploadReference(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setRefUploadError(null);
    if (file.size > MAX_INTERN_DOCUMENT_BYTES) {
      setRefUploadError(`File too large — max ${Math.round(MAX_INTERN_DOCUMENT_BYTES / (1024 * 1024))}MB.`);
      return;
    }
    setUploadingRef(true);
    try {
      const url = await uploadToSupabase(INTERN_DOCUMENTS_BUCKET, file);
      setReferenceMaterialUrl(url);
    } catch (err) {
      setRefUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingRef(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const token = await adminUser.getIdToken();
      const res = await createTrialAssignment({
        data: {
          token,
          assignment: {
            candidateName: name,
            candidateEmail: email,
            subjectLabel,
            instructions,
            sampleCount: Number(sampleCount),
            referenceMaterialUrl: referenceMaterialUrl.trim() || null,
          },
        },
      });
      setLastResult({ emailSent: res.emailSent });
      setName("");
      setEmail("");
      setSubjectLabel("");
      setInstructions("");
      setReferenceMaterialUrl("");
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

  async function handleConvertToInvite(assignmentId: string, candidateName: string, candidateEmail: string) {
    const token = await adminUser.getIdToken();
    const res = await createInternInvite({ data: { token, invite: { name: candidateName, email: candidateEmail } } });
    setConvertedIds((prev) => new Set(prev).add(assignmentId));
    setConvertMessage((prev) => ({
      ...prev,
      [assignmentId]: res.emailSent
        ? `Invite emailed to ${candidateEmail}.`
        : `Invite created but the email failed — share this code directly: ${res.secretCode}`,
    }));
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

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Reference material (optional) — sample source questions for them to work from
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={referenceMaterialUrl}
              onChange={(e) => setReferenceMaterialUrl(e.target.value)}
              placeholder="Paste a link (Drive, S3, etc.)…"
              className={inputClass + " flex-1"}
            />
            <label className="clay-btn-ghost flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold text-foreground/70">
              {uploadingRef ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingRef ? "Uploading…" : "…or upload a PDF"}
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUploadReference}
                className="hidden"
                disabled={uploadingRef}
              />
            </label>
          </div>
          {refUploadError && <p className="mt-1 text-xs font-medium text-rose-600">{refUploadError}</p>}
          {referenceMaterialUrl && !uploadingRef && (
            <p className="mt-1 truncate text-xs text-emerald-600">Attached: {referenceMaterialUrl}</p>
          )}
        </div>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {lastResult && (
          <p
            className={`flex items-center gap-1.5 text-xs font-medium ${
              lastResult.emailSent ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {lastResult.emailSent ? (
              <>
                <Mail className="h-3.5 w-3.5" /> Sample task emailed to the candidate.
              </>
            ) : (
              "The task was created, but the email failed to send — check their address."
            )}
          </p>
        )}
        <button type="submit" className="clay-btn rounded-full px-6 py-2.5 text-sm font-semibold text-white">
          Send sample task
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

            {a.referenceMaterialUrl && (
              <a
                href={a.referenceMaterialUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                Reference material attached
              </a>
            )}

            {a.status === "submitted" && (
              <div className="mt-4 space-y-3">
                {a.answers.map((ans, i) => (
                  <div key={i} className="clay-inset rounded-2xl p-4">
                    <QuestionContentRenderer content={ans.body} />
                    {ans.type === "mcq" && ans.options && (
                      <ul className="mt-1.5 space-y-1">
                        {(["A", "B", "C", "D"] as const).map((k) => (
                          <li key={k} className={`flex gap-2 text-xs ${ans.correctOption === k ? "text-emerald-600 font-semibold" : "text-foreground/60"}`}>
                            <span className="shrink-0">{k}.</span>
                            <QuestionContentRenderer content={ans.options![k]} className="text-xs" />
                          </li>
                        ))}
                      </ul>
                    )}
                    {ans.type === "integer" && <p className="mt-1 text-xs text-foreground/60">Answer: {ans.correctAnswer}</p>}
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-foreground/40">Solution</p>
                    <QuestionContentRenderer content={ans.solution} className="text-xs text-foreground/60" />
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
                {a.reviewDecision === "advance" && !convertedIds.has(a.id) && (
                  <button
                    onClick={() => handleConvertToInvite(a.id, a.candidateName, a.candidateEmail)}
                    className="clay-chip ml-3 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Send real intern invite
                  </button>
                )}
                {convertedIds.has(a.id) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Mail className="h-3.5 w-3.5" /> {convertMessage[a.id]}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}