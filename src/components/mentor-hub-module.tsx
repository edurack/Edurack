import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  Users2,
  Layers3,
  Pencil,
  X,
  Plus,
  ShieldCheck,
  Trophy,
  Building2,
  BookMarked,
  ArrowLeft,
  Mail,
  UploadCloud,
  FileText,
  ImageIcon,
  CheckCircle2,
  XCircle,
  KeyRound,
  Ban,
  BadgeCheck,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import type { ExamKey, Mentor, MentorshipBatch, Track } from "@/lib/admin-types";
import {
  listMentors,
  updateMentorProfile,
  createMentorshipBatch,
  listMentorshipBatches,
  updateMentorshipBatch,
  setMentorAccountStatus,
  getAdminMentorFullDetail,
  resetMentorPasswordEmail,
} from "@/server-functions/admin";
import { updateMentorLockedInfo } from "@/server-functions/mentor-auth";
import {
  uploadToSupabase,
  BUNDLE_THUMBNAILS_BUCKET,
  BUNDLE_DOCUMENTS_BUCKET,
} from "@/lib/supabase";

type AdminUser = { getIdToken: () => Promise<string> };

// User asked for a flat 50MB cap on both thumbnail and PDF uploads here —
// note the BUNDLE_THUMBNAILS_BUCKET's own dashboard "file size limit" in
// Supabase is documented as 20MB in lib/supabase.ts; raise that bucket
// setting to 50MB too, or uploads between 20–50MB will pass this client
// check and still be rejected by Supabase itself.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function formatUploadBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ClayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function MentorHubModule({ adminUser }: { adminUser: AdminUser }) {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [batches, setBatches] = useState<MentorshipBatch[] | null>(null);
  const [openMentorId, setOpenMentorId] = useState<string | null>(null);

  async function refreshMentors() {
    const token = await adminUser.getIdToken();
    const { mentors: rows } = await listMentors({ data: { token } });
    setMentors(rows as Mentor[]);
  }

  async function refreshBatches() {
    const token = await adminUser.getIdToken();
    const { batches: rows } = await listMentorshipBatches({ data: { token } });
    setBatches(rows as MentorshipBatch[]);
  }

  useEffect(() => {
    refreshMentors();
    refreshBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  return (
    <div>
      <ModuleHeader
        title="Mentor Allocation & Schedule Hub"
        subtitle="Review mentor profiles and build mentorship batches."
      />

      <MentorList mentors={mentors} onOpen={setOpenMentorId} />
      <MentorshipBatchCreator mentors={mentors} adminUser={adminUser} onCreated={refreshBatches} />
      <MentorshipBatchList batches={batches} mentors={mentors} adminUser={adminUser} onSaved={refreshBatches} />

      {openMentorId && (
        <MentorDetailDrawer
          mentorId={openMentorId}
          adminUser={adminUser}
          onClose={() => setOpenMentorId(null)}
          onChanged={refreshMentors}
        />
      )}
    </div>
  );
}

function MentorList({ mentors, onOpen }: { mentors: Mentor[] | null; onOpen: (id: string) => void }) {
  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users2 className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Mentor directory
        </h2>
      </div>

      {mentors === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : mentors.length === 0 ? (
        <p className="text-sm text-foreground/60">No mentors onboarded yet.</p>
      ) : (
        <ul className="space-y-2">
          {mentors.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onOpen(m.id)}
                className="clay-inset flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:brightness-95"
              >
                <div className="flex items-center gap-3">
                  <div className="clay-inset flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    {m.profilePictureUrl ? (
                      <img src={m.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-foreground/50">
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {m.name}
                      {m.status === "terminated" && (
                        <span className="rounded-full bg-[var(--coral-soft)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                          Terminated
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-foreground/50">@{m.username}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-foreground/30" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Full profile drawer: everything filled in by the mentor so far, plus
// Terminate / Reset password / Ask for verification at the bottom. ────────
type MentorFullDetail = {
  id: string;
  username: string;
  name: string;
  secretCode: string;
  profilePictureUrl: string | null;
  trackingIndex: string;
  status: "active" | "terminated";
  email: string | null;
  aboutText: string;
  yearOfStudy: string;
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
  createdAt: string | null;
  introVideo: { driveUploadLink: string | null; uploaded: boolean; markedUploadedAt: string | null } | null;
  onboarding: {
    weeklyHours: number;
    wantsToSellTestSeries: boolean;
    wantsToRecordIntroVideo: boolean;
    batchName: string;
    batchPrice: number;
    batchDurationMonths: number;
    hasMinStudentCriteria: boolean;
    minStudentCriteriaDetails: string;
    needsPromotionAssistance: boolean;
    promotionPercent: number;
    syllabusPdfUrl: string;
    plannerPdfUrl: string;
    commissionPercent: number;
    preferredLaunchDate: string;
    submittedAt: string | null;
  } | null;
  batches: {
    id: string;
    name: string;
    sellingPrice: number;
    crossedPrice: number;
    track: string;
    exam: string;
    thumbnailUrl: string | null;
    createdAt: string | null;
  }[];
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground/50" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/50">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MentorDetailDrawer({
  mentorId,
  adminUser,
  onClose,
  onChanged,
}: {
  mentorId: string;
  adminUser: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<MentorFullDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [terminating, setTerminating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<"match" | "mismatch" | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { detail } = await getAdminMentorFullDetail({ data: { token, mentorId } });
      setData(detail as MentorFullDetail);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  async function handleTerminateToggle() {
    if (!data) return;
    const willTerminate = data.status !== "terminated";
    if (
      !confirm(
        willTerminate
          ? `Terminate ${data.name}'s account? They'll be signed out immediately and can't access the mentor dashboard until reactivated.`
          : `Reactivate ${data.name}'s account?`,
      )
    )
      return;
    setTerminating(true);
    setActionMessage(null);
    try {
      const token = await adminUser.getIdToken();
      await setMentorAccountStatus({ data: { token, mentorId, terminated: willTerminate } });
      setData((prev) => (prev ? { ...prev, status: willTerminate ? "terminated" : "active" } : prev));
      onChanged();
      setActionMessage({ kind: "ok", text: willTerminate ? "Mentor account terminated." : "Mentor account reactivated." });
    } catch (err) {
      setActionMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not update this account." });
    } finally {
      setTerminating(false);
    }
  }

  async function handleResetPassword() {
    if (!confirm("Send a new password to this mentor's email on file?")) return;
    setResetting(true);
    setActionMessage(null);
    try {
      const token = await adminUser.getIdToken();
      const result = await resetMentorPasswordEmail({ data: { token, mentorId } });
      setActionMessage({ kind: "ok", text: `New password sent to ${result.email}.` });
    } catch (err) {
      setActionMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not reset the password." });
    } finally {
      setResetting(false);
    }
  }

  function handleVerify() {
    if (!data) return;
    setVerifyResult(verifyInput.trim() === data.secretCode ? "match" : "mismatch");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="clay relative flex h-full w-full max-w-lg flex-col overflow-y-auto rounded-l-3xl rounded-r-none p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-foreground/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Close
          </button>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70 sm:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
          </div>
        ) : status === "error" || !data ? (
          <p className="py-8 text-center text-sm text-foreground/60">Couldn't load this mentor's profile.</p>
        ) : (
          <div className="space-y-5">
            {/* Identity */}
            <div className="clay-inset p-4">
              <div className="flex items-center gap-3">
                <div className="clay flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {data.profilePictureUrl ? (
                    <img src={data.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-xl font-bold text-foreground/60">
                      {data.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-foreground">{data.name}</p>
                  <p className="text-xs text-foreground/50">@{data.username} · Joined {formatDate(data.createdAt)}</p>
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    data.status === "terminated"
                      ? "bg-[var(--coral-soft)]/60 text-foreground"
                      : "bg-[var(--mint-soft)] text-foreground"
                  }`}
                >
                  {data.status}
                </span>
              </div>
              {data.email && (
                <p className="mt-3 flex items-center gap-2 text-sm text-foreground/70">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                  {data.email}
                </p>
              )}
            </div>

            {/* Profile as filled by the mentor */}
            <DetailSection icon={BookMarked} title="Profile">
              <ul className="clay-inset space-y-1.5 px-3.5 py-3 text-foreground/70">
                <li>
                  About: <span className="text-foreground">{data.aboutText || "Not filled in yet"}</span>
                </li>
                <li>
                  Year of study: <strong className="text-foreground">{data.yearOfStudy || "—"}</strong>
                </li>
                <li>
                  AIIMS/IIT Rank: <strong className="text-foreground">{data.aiimsIitRank || "—"}</strong>
                </li>
                <li>
                  Enrolled college: <strong className="text-foreground">{data.enrolledCollege || "—"}</strong>
                </li>
                <li>
                  Pursued course: <strong className="text-foreground">{data.pursuedCourse || "—"}</strong>
                </li>
              </ul>
            </DetailSection>

            {data.introVideo && (
              <DetailSection icon={CheckCircle2} title="Intro video">
                <ul className="clay-inset space-y-1.5 px-3.5 py-3 text-foreground/70">
                  <li>
                    Uploaded: <strong className="text-foreground">{data.introVideo.uploaded ? "Yes" : "No"}</strong>
                    {data.introVideo.markedUploadedAt && ` · ${formatDate(data.introVideo.markedUploadedAt)}`}
                  </li>
                  {data.introVideo.driveUploadLink && (
                    
                    <li>
                      <a
                        href={data.introVideo.driveUploadLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[var(--sky-deep)] hover:underline"
                      >
                        Drive folder <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  )}
                </ul>
              </DetailSection>
            )}

            {/* Full onboarding wizard submission, if this mentor came through it */}
            {data.onboarding ? (
              <DetailSection icon={CheckCircle2} title="Onboarding submission">
                <ul className="clay-inset space-y-1.5 px-3.5 py-3 text-foreground/70">
                  <li>
                    Weekly commitment: <strong className="text-foreground">{data.onboarding.weeklyHours} hrs/week</strong>
                  </li>
                  <li>
                    Wants to sell test series: <strong className="text-foreground">{data.onboarding.wantsToSellTestSeries ? "Yes" : "No"}</strong>
                  </li>
                  <li>
                    Proposed batch: <strong className="text-foreground">{data.onboarding.batchName}</strong> · ₹{data.onboarding.batchPrice} ·{" "}
                    {data.onboarding.batchDurationMonths} month{data.onboarding.batchDurationMonths === 1 ? "" : "s"}
                  </li>
                  <li>
                    Min. student criteria:{" "}
                    <strong className="text-foreground">
                      {data.onboarding.hasMinStudentCriteria ? data.onboarding.minStudentCriteriaDetails || "Yes" : "None"}
                    </strong>
                  </li>
                  <li>
                    Promotion assistance:{" "}
                    <strong className="text-foreground">
                      {data.onboarding.needsPromotionAssistance ? `Yes — ${data.onboarding.promotionPercent}%` : "No"}
                    </strong>
                  </li>
                  <li>
                    Platform commission: <strong className="text-foreground">{data.onboarding.commissionPercent}%</strong>
                  </li>
                  <li>
                    Syllabus PDF:{" "}
                    {data.onboarding.syllabusPdfUrl ? (
                      <a href={data.onboarding.syllabusPdfUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--sky-deep)] hover:underline">
                        View file
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </li>
                  <li>
                    Planner PDF:{" "}
                    {data.onboarding.plannerPdfUrl ? (
                      <a href={data.onboarding.plannerPdfUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--sky-deep)] hover:underline">
                        View file
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </li>
                  <li>
                    Preferred launch: <strong className="text-foreground">{data.onboarding.preferredLaunchDate || "—"}</strong>
                  </li>
                  <li>
                    Submitted: <strong className="text-foreground">{formatDate(data.onboarding.submittedAt)}</strong>
                  </li>
                </ul>
              </DetailSection>
            ) : (
              <p className="text-xs italic text-foreground/40">
                No onboarding wizard submission on file for this mentor.
              </p>
            )}

            {/* Assigned batches */}
            <DetailSection icon={Layers3} title={`Assigned batches (${data.batches.length})`}>
              {data.batches.length === 0 ? (
                <p className="text-sm text-foreground/60">No batches assigned yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.batches.map((b) => (
                    <li key={b.id} className="clay-inset px-3.5 py-2.5">
                      <p className="text-sm font-semibold text-foreground">{b.name}</p>
                      <p className="text-xs text-foreground/50">
                        {b.track} · {b.exam.toUpperCase()} · ₹{b.sellingPrice}{" "}
                        <span className="line-through opacity-60">₹{b.crossedPrice}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            {actionMessage && (
              <p
                className={`rounded-2xl px-4 py-2 text-xs font-medium ${
                  actionMessage.kind === "ok" ? "bg-[var(--mint-soft)]/60 text-foreground" : "bg-[var(--coral-soft)]/50 text-foreground"
                }`}
              >
                {actionMessage.text}
              </p>
            )}

            {/* ── Terminate / Reset password / Ask for verification ────── */}
            <div className="clay-inset space-y-3 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/50">Actions</p>

              <button
                onClick={handleTerminateToggle}
                disabled={terminating}
                className={`clay-btn-ghost flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                  data.status === "terminated" ? "" : "text-[var(--coral-soft)]"
                }`}
              >
                {terminating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {data.status === "terminated" ? "Reactivate account" : "Terminate account"}
              </button>

              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="clay-btn-ghost flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Reset password (emails a new one)
              </button>

              <div>
                <button
                  onClick={() => {
                    setVerifyOpen((v) => !v);
                    setVerifyResult(null);
                  }}
                  className="clay-btn-ghost flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
                >
                  <BadgeCheck className="h-4 w-4" />
                  Ask for verification
                </button>
                {verifyOpen && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-foreground/50">
                      Ask the mentor for the secret code they were given when their login was created, and enter it
                      here to confirm you're speaking to the right person.
                    </p>
                    <input
                      value={verifyInput}
                      onChange={(e) => {
                        setVerifyInput(e.target.value);
                        setVerifyResult(null);
                      }}
                      placeholder="e.g. MNT-2026-YWU"
                      className={inputClass}
                    />
                    <button
                      onClick={handleVerify}
                      className="clay-btn rounded-full px-4 py-1.5 text-xs font-semibold"
                    >
                      Check
                    </button>
                    {verifyResult === "match" && (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Code matches — identity confirmed.
                      </p>
                    )}
                    {verifyResult === "mismatch" && (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                        <XCircle className="h-3.5 w-3.5" /> Code doesn't match.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── File upload field shared by the batch creator and editor ──────────
function FileUploadField({
  label,
  icon: Icon,
  currentUrl,
  bucket,
  accept,
  onUploaded,
}: {
  label: string;
  icon: typeof ImageIcon;
  currentUrl: string | null;
  bucket: string;
  accept: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatUploadBytes(file.size)} — please choose one under 50MB.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadToSupabase(bucket, file);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ClayField label={label}>
      <div className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-foreground/40" />
        <div className="min-w-0 flex-1">
          {currentUrl ? (
            <a href={currentUrl} target="_blank" rel="noreferrer" className="truncate text-xs font-semibold text-[var(--sky-deep)] hover:underline">
              View current file
            </a>
          ) : (
            <span className="text-xs text-foreground/40">No file uploaded yet</span>
          )}
        </div>
        <label className="clay-btn-ghost inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
          {currentUrl ? "Replace" : "Upload"}
          <input type="file" accept={accept} onChange={handleFile} className="hidden" disabled={uploading} />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-foreground/40">Max 50MB.</p>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </ClayField>
  );
}

function MentorshipBatchCreator({
  mentors,
  adminUser,
  onCreated,
}: {
  mentors: Mentor[] | null;
  adminUser: AdminUser;
  onCreated: () => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [syllabusPdfUrl, setSyllabusPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [highlights, setHighlights] = useState<string[]>(["", ""]);
  const [track, setTrack] = useState<Track>("Dropper");
  const [exam, setExam] = useState<ExamKey>("neet");
  const [sellingPrice, setSellingPrice] = useState("");
  const [crossedPrice, setCrossedPrice] = useState("");
  const [assignedMentorId, setAssignedMentorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateHighlight(i: number, value: string) {
    const next = [...highlights];
    next[i] = value;
    setHighlights(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) return setError("Enter a batch name.");
    const cleanHighlights = highlights.map((h) => h.trim()).filter(Boolean);
    if (cleanHighlights.length < 2) return setError("Add at least 2 core highlights.");
    const selling = Number(sellingPrice);
    const crossed = Number(crossedPrice);
    if (!selling || selling <= 0) return setError("Enter a valid selling price.");
    if (!crossed || crossed <= selling) return setError("Crossed price must be higher than the selling price.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await createMentorshipBatch({
        data: {
          token,
          batch: {
            thumbnailUrl,
            syllabusPdfUrl,
            name: name.trim(),
            highlights: cleanHighlights,
            track,
            exam,
            sellingPrice: selling,
            crossedPrice: crossed,
            assignedMentorId: assignedMentorId || null,
          },
        },
      });
      setSuccess(true);
      setThumbnailUrl(null);
      setSyllabusPdfUrl(null);
      setName("");
      setHighlights(["", ""]);
      setExam("neet");
      setSellingPrice("");
      setCrossedPrice("");
      setAssignedMentorId("");
      onCreated();
    } catch {
      setError("Could not create the batch. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Create mentorship batch
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FileUploadField
          label="Batch thumbnail"
          icon={ImageIcon}
          currentUrl={thumbnailUrl}
          bucket={BUNDLE_THUMBNAILS_BUCKET}
          accept="image/*"
          onUploaded={setThumbnailUrl}
        />

        <FileUploadField
          label="Syllabus / planner PDF (optional)"
          icon={FileText}
          currentUrl={syllabusPdfUrl}
          bucket={BUNDLE_DOCUMENTS_BUCKET}
          accept="application/pdf"
          onUploaded={setSyllabusPdfUrl}
        />

        <ClayField label="Batch name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dropper 1:1 Mentorship — 2027"
            className={inputClass}
          />
        </ClayField>

        <ClayField label="Core highlights (2-3)">
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={h}
                  onChange={(e) => updateHighlight(i, e.target.value)}
                  placeholder={`Highlight ${i + 1}`}
                  className={inputClass}
                />
                {highlights.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setHighlights(highlights.filter((_, idx) => idx !== i))}
                    className="text-foreground/40 hover:text-foreground/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {highlights.length < 3 && (
              <button
                type="button"
                onClick={() => setHighlights([...highlights, ""])}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add highlight
              </button>
            )}
          </div>
        </ClayField>

        <ClayField label="Target audience">
          <div className="grid grid-cols-3 gap-2">
            {(["11th", "12th", "Dropper"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrack(t)}
                className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all ${
                  track === t ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </ClayField>

        <ClayField label="Exam">
          <div className="grid grid-cols-4 gap-2">
            {(["neet", "jee", "cuet", "ipmat"] as ExamKey[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setExam(e)}
                className={`rounded-2xl px-3 py-2.5 text-xs font-semibold uppercase transition-all ${
                  exam === e ? "clay-btn text-white" : "clay-btn-ghost text-foreground/70"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </ClayField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ClayField label="Selling price (₹)">
            <input
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              inputMode="numeric"
              placeholder="4999"
              className={inputClass}
            />
          </ClayField>
          <ClayField label="Dummy crossed price (₹)">
            <input
              value={crossedPrice}
              onChange={(e) => setCrossedPrice(e.target.value)}
              inputMode="numeric"
              placeholder="7999"
              className={inputClass}
            />
          </ClayField>
        </div>

        <ClayField label="Assign to mentor">
          <select
            value={assignedMentorId}
            onChange={(e) => setAssignedMentorId(e.target.value)}
            className={inputClass + " appearance-none"}
          >
            <option value="">Unassigned</option>
            {(mentors ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </ClayField>

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
            Batch created.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create batch"}
        </button>
      </form>
    </div>
  );
}

function MentorshipBatchList({
  batches,
  mentors,
  adminUser,
  onSaved,
}: {
  batches: MentorshipBatch[] | null;
  mentors: Mentor[] | null;
  adminUser: AdminUser;
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [syllabusPdfUrl, setSyllabusPdfUrl] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [track, setTrack] = useState<Track>("Dropper");
  const [exam, setExam] = useState<ExamKey>("neet");
  const [sellingPrice, setSellingPrice] = useState("");
  const [crossedPrice, setCrossedPrice] = useState("");
  const [assignedMentorId, setAssignedMentorId] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(b: MentorshipBatch) {
    setEditingId(b.id);
    setName(b.name);
    setThumbnailUrl(b.thumbnailUrl);
    setSyllabusPdfUrl(b.syllabusPdfUrl);
    setHighlights(b.highlights.length ? b.highlights : ["", ""]);
    setTrack(b.track);
    setExam(b.exam);
    setSellingPrice(String(b.sellingPrice));
    setCrossedPrice(String(b.crossedPrice));
    setAssignedMentorId(b.assignedMentorId ?? "");
  }

  function updateHighlight(i: number, value: string) {
    const next = [...highlights];
    next[i] = value;
    setHighlights(next);
  }

  async function save(id: string) {
    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      await updateMentorshipBatch({
        data: {
          token,
          id,
          batch: {
            name,
            thumbnailUrl,
            syllabusPdfUrl,
            highlights: highlights.map((h) => h.trim()).filter(Boolean),
            track,
            exam,
            sellingPrice: Number(sellingPrice),
            crossedPrice: Number(crossedPrice),
            assignedMentorId: assignedMentorId || null,
          },
        },
      });
      setEditingId(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function mentorName(id: string | null) {
    if (!id) return "Unassigned";
    return mentors?.find((m) => m.id === id)?.name ?? "Unknown mentor";
  }

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Mentorship batches
        </h2>
      </div>
      <p className="mb-4 text-xs text-foreground/40">
        Includes batches created here manually and batches published from an approved mentor's onboarding
        submission — both are fully editable the same way.
      </p>

      {batches === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : batches.length === 0 ? (
        <p className="text-sm text-foreground/60">No mentorship batches created yet.</p>
      ) : (
        <ul className="space-y-2">
          {batches.map((b) => (
            <li key={b.id} className="clay-inset px-4 py-3">
              {editingId === b.id ? (
                <div className="space-y-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />

                  <FileUploadField
                    label="Thumbnail"
                    icon={ImageIcon}
                    currentUrl={thumbnailUrl}
                    bucket={BUNDLE_THUMBNAILS_BUCKET}
                    accept="image/*"
                    onUploaded={setThumbnailUrl}
                  />
                  <FileUploadField
                    label="Syllabus / planner PDF"
                    icon={FileText}
                    currentUrl={syllabusPdfUrl}
                    bucket={BUNDLE_DOCUMENTS_BUCKET}
                    accept="application/pdf"
                    onUploaded={setSyllabusPdfUrl}
                  />

                  <div className="space-y-1.5">
                    {highlights.map((h, i) => (
                      <input
                        key={i}
                        value={h}
                        onChange={(e) => updateHighlight(i, e.target.value)}
                        placeholder={`Highlight ${i + 1}`}
                        className={inputClass}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(["11th", "12th", "Dropper"] as Track[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTrack(t)}
                        className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${
                          track === t ? "clay-btn text-white" : "clay-chip text-foreground/70"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {(["neet", "jee", "cuet", "ipmat"] as ExamKey[]).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setExam(e)}
                        className={`rounded-xl px-2 py-1.5 text-[11px] font-semibold uppercase transition-all ${
                          exam === e ? "clay-btn text-white" : "clay-chip text-foreground/70"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      inputMode="numeric"
                      className={inputClass}
                    />
                    <input
                      value={crossedPrice}
                      onChange={(e) => setCrossedPrice(e.target.value)}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </div>
                  <select
                    value={assignedMentorId}
                    onChange={(e) => setAssignedMentorId(e.target.value)}
                    className={inputClass + " appearance-none"}
                  >
                    <option value="">Unassigned</option>
                    {(mentors ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => save(b.id)}
                      disabled={saving}
                      className="clay-btn rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-70"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-semibold text-foreground/50 hover:text-foreground/70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{b.name}</p>
                    <p className="text-xs text-foreground/50">
                      {b.track} · {b.exam.toUpperCase()} · ₹{b.sellingPrice}{" "}
                      <span className="line-through opacity-60">₹{b.crossedPrice}</span> ·{" "}
                      {mentorName(b.assignedMentorId)}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(b)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}