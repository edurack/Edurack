import { useEffect, useState } from "react";
import {
  Loader2,
  UserPlus,
  Users2,
  Copy,
  CheckCircle2,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Ticket,
  Wallet,
  KeyRound,
  Ban,
  RotateCcw,
} from "lucide-react";
import {
  createPromoterInvite,
  listPromoters,
  suspendPromoter,
  listPromoterCouponRequests,
  reviewPromoterCouponRequest,
  listPromoterPayoutRequests,
  reviewPromoterPayoutRequest,
  listPromoterPasswordResetRequests,
  resolvePromoterPasswordReset,
} from "@/server-functions/promoter-admin";

type AdminUser = { getIdToken: () => Promise<string> };

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PromoterHubModule({ adminUser }: { adminUser: AdminUser }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div>
      <ModuleHeader
        title="Promoters"
        subtitle="Invite promoters, review coupon and payout requests, and manage accounts."
      />

      <InviteForm adminUser={adminUser} onCreated={bump} />
      <PromoterDirectory adminUser={adminUser} refreshKey={refreshKey} onChanged={bump} />
      <CouponRequestQueue adminUser={adminUser} refreshKey={refreshKey} onChanged={bump} />
      <PayoutRequestQueue adminUser={adminUser} refreshKey={refreshKey} onChanged={bump} />
      <PasswordResetQueue adminUser={adminUser} refreshKey={refreshKey} onChanged={bump} />
    </div>
  );
}

function InviteForm({ adminUser, onCreated }: { adminUser: AdminUser; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setGeneratedCode(null);
    if (!name.trim()) return setError("Enter the promoter's name.");

    setSaving(true);
    try {
      const token = await adminUser.getIdToken();
      const result = await createPromoterInvite({ data: { token, name: name.trim() } });
      setGeneratedCode(result.secretCode);
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invite. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Invite a promoter</h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Promoter's name"
          className={inputClass}
        />
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="clay-btn flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate secret code"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
          {error}
        </p>
      )}
      {generatedCode && (
        <div className="clay-inset mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[var(--mint-soft)]/30 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/40">
              Share this code with the promoter
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">{generatedCode}</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(generatedCode)}
            className="clay-btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

type PromoterRow = {
  id: string;
  name: string;
  username: string | null;
  secretCode: string;
  status: "invited" | "active" | "suspended";
  profilePictureUrl: string | null;
  createdAt: string | null;
};

function PromoterDirectory({
  adminUser,
  refreshKey,
  onChanged,
}: {
  adminUser: AdminUser;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [promoters, setPromoters] = useState<PromoterRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const token = await adminUser.getIdToken();
    const { promoters: rows } = await listPromoters({ data: { token } });
    setPromoters(rows as PromoterRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function toggleSuspend(p: PromoterRow) {
    setBusyId(p.id);
    try {
      const token = await adminUser.getIdToken();
      await suspendPromoter({ data: { token, promoterId: p.id, suspended: p.status !== "suspended" } });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users2 className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Promoter directory</h2>
      </div>

      {promoters === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : promoters.length === 0 ? (
        <p className="text-sm text-foreground/60">No promoters invited yet.</p>
      ) : (
        <ul className="space-y-2">
          {promoters.map((p) => (
            <li key={p.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="clay-inset flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {p.profilePictureUrl ? (
                    <img src={p.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-foreground/50">{p.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-foreground/50">
                    {p.username ? `@${p.username}` : `Code: ${p.secretCode}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusPill status={p.status} />
                {p.status !== "invited" && (
                  <button
                    onClick={() => toggleSuspend(p)}
                    disabled={busyId === p.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/60 hover:text-foreground disabled:opacity-50"
                  >
                    {p.status === "suspended" ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5" /> Suspend
                      </>
                    )}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "invited" | "active" | "suspended" }) {
  const styles = {
    invited: "bg-[var(--sky-soft)] text-foreground",
    active: "bg-[var(--mint-soft)] text-foreground",
    suspended: "bg-[var(--coral-soft)]/60 text-foreground",
  }[status];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles}`}>
      {status}
    </span>
  );
}

type CouponRequestRow = {
  id: string;
  promoterName: string;
  promoterUsername: string;
  batchName: string;
  status: "pending" | "approved" | "rejected";
  couponCode: string | null;
  totalPoolPercent: number;
  studentDiscountPercent: number;
  promoterEarningPercent: number;
  requestedAt: string | null;
};

function CouponRequestQueue({
  adminUser,
  refreshKey,
  onChanged,
}: {
  adminUser: AdminUser;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<CouponRequestRow[] | null>(null);
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const token = await adminUser.getIdToken();
    const { requests: rows } = await listPromoterCouponRequests({ data: { token, status: "pending" } });
    setRequests(rows as CouponRequestRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handleApprove(r: CouponRequestRow) {
    const couponCode = codeDrafts[r.id]?.trim();
    if (!couponCode) return;
    setBusyId(r.id);
    try {
      const token = await adminUser.getIdToken();
      await reviewPromoterCouponRequest({ data: { token, requestId: r.id, decision: "approved", couponCode } });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(r: CouponRequestRow) {
    setBusyId(r.id);
    try {
      const token = await adminUser.getIdToken();
      await reviewPromoterCouponRequest({ data: { token, requestId: r.id, decision: "rejected" } });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Ticket className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Coupon requests awaiting review
        </h2>
      </div>

      {requests === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-foreground/60">No pending coupon requests.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="clay-inset rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.promoterName}</p>
                  <p className="text-xs text-foreground/50">
                    @{r.promoterUsername} · {r.batchName} · pool {r.totalPoolPercent}% → {r.studentDiscountPercent}%
                    student off / {r.promoterEarningPercent}% earned · {formatDate(r.requestedAt)}
                  </p>
                </div>
                <Clock className="h-4 w-4 shrink-0 text-foreground/40" />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={codeDrafts[r.id] ?? ""}
                  onChange={(e) => setCodeDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Coupon code to issue"
                  className={inputClass}
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleApprove(r)}
                    disabled={busyId === r.id || !codeDrafts[r.id]?.trim()}
                    className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(r)}
                    disabled={busyId === r.id}
                    className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PayoutRequestRow = {
  id: string;
  promoterName: string;
  promoterUsername: string;
  requestedPaymentDay: number;
  requestedAt: string | null;
};

function PayoutRequestQueue({
  adminUser,
  refreshKey,
  onChanged,
}: {
  adminUser: AdminUser;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<PayoutRequestRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const token = await adminUser.getIdToken();
    const { requests: rows } = await listPromoterPayoutRequests({ data: { token, status: "pending" } });
    setRequests(rows as PayoutRequestRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handleReview(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    try {
      const token = await adminUser.getIdToken();
      await reviewPromoterPayoutRequest({ data: { token, requestId: id, decision } });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Payout requests awaiting review
        </h2>
      </div>

      {requests === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-foreground/60">No pending payout requests.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.promoterName}</p>
                <p className="text-xs text-foreground/50">
                  @{r.promoterUsername} · Wants payout on the {r.requestedPaymentDay}th monthly ·{" "}
                  {formatDate(r.requestedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => handleReview(r.id, "approved")}
                  disabled={busyId === r.id}
                  className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => handleReview(r.id, "rejected")}
                  disabled={busyId === r.id}
                  className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PasswordResetRow = {
  id: string;
  promoterId: string;
  username: string;
  contactNote: string;
  createdAt: string | null;
};

function PasswordResetQueue({
  adminUser,
  refreshKey,
  onChanged,
}: {
  adminUser: AdminUser;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<PasswordResetRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  async function load() {
    const token = await adminUser.getIdToken();
    const { requests: rows } = await listPromoterPasswordResetRequests({ data: { token } });
    setRequests(rows as PasswordResetRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handleResolve(id: string) {
    const newPassword = drafts[id]?.trim();
    if (!newPassword || newPassword.length < 8) return;
    setBusyId(id);
    try {
      const token = await adminUser.getIdToken();
      await resolvePromoterPasswordReset({ data: { token, requestId: id, newPassword } });
      setResolved((prev) => ({ ...prev, [id]: newPassword }));
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Password reset requests
        </h2>
      </div>

      {requests === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-foreground/60">No pending password reset requests.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="clay-inset rounded-2xl p-4">
              <p className="text-sm font-semibold text-foreground">@{r.username}</p>
              <p className="mb-2 text-xs text-foreground/50">
                {r.contactNote || "No contact note left"} · {formatDate(r.createdAt)}
              </p>

              {resolved[r.id] ? (
                <div className="clay-inset flex items-center gap-2 rounded-2xl bg-[var(--mint-soft)]/30 px-4 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="font-mono text-xs text-foreground/80">New password: {resolved[r.id]}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={drafts[r.id] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="New password (min. 8 chars)"
                    className={inputClass}
                  />
                  <button
                    onClick={() => handleResolve(r.id)}
                    disabled={busyId === r.id || (drafts[r.id]?.trim().length ?? 0) < 8}
                    className="clay-btn inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set password"}
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