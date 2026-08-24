import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Megaphone, Mail, MailCheck, MailWarning, Users2, Plus, X } from "lucide-react";
import type { MentorAnnouncement } from "@/lib/admin-types";
import { postMentorAnnouncement, listMentorAnnouncements, listMyAssignedBatches } from "@/server-functions/mentor-portal";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  EmptyState,
  ErrorBanner,
  inputClass,
  textareaClass,
} from "@/components/mentor-portal-ui";

type Batch = { id: string; name: string; track: string };

export function MentorAnnouncementModule({ mentorToken }: { mentorToken: string }) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [announcements, setAnnouncements] = useState<MentorAnnouncement[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      const { batches: rows } = await listMyAssignedBatches({ data: { token: mentorToken } });
      setBatches(rows);
      if (rows.length > 0) setSelectedBatchId(rows[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  async function refreshAnnouncements(batchId: string) {
    if (!batchId) return;
    const { announcements: rows } = await listMentorAnnouncements({ data: { token: mentorToken, batchId } });
    setAnnouncements(rows);
  }

  useEffect(() => {
    if (selectedBatchId) refreshAnnouncements(selectedBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  return (
    <div>
      <ModuleHeader
        title="Targeted Batch Announcement Engine"
        subtitle="Broadcast a message to your allocated mentorship batch, with an optional email trigger."
      />

      {batches === null ? (
        <LoadingBlock />
      ) : batches.length === 0 ? (
        <EmptyState icon={Megaphone} message="No mentorship batches are assigned to you yet." />
      ) : (
        <div className="space-y-6">
          <ClayField label="Target batch">
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className={inputClass + " appearance-none"}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.track}
                </option>
              ))}
            </select>
          </ClayField>

          {showForm && (
            <BroadcastPanel
              mentorToken={mentorToken}
              batchId={selectedBatchId}
              onPosted={() => {
                setShowForm(false);
                refreshAnnouncements(selectedBatchId);
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          <AnnouncementLog
            announcements={announcements}
            action={
              !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
                >
                  <Plus className="h-3.5 w-3.5" /> New announcement
                </button>
              )
            }
          />
        </div>
      )}
    </div>
  );
}

function BroadcastPanel({
  mentorToken,
  batchId,
  onPosted,
  onCancel,
}: {
  mentorToken: string;
  batchId: string;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [triggerEmail, setTriggerEmail] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Give this announcement a title.");
    if (!message.trim()) return setError("Write the announcement message.");
    if (!batchId) return setError("Select a batch first.");

    setPosting(true);
    try {
      await postMentorAnnouncement({ data: { token: mentorToken, announcement: { batchId, title, message, triggerEmail } } });
      setTitle("");
      setMessage("");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the announcement. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Panel
      icon={Megaphone}
      title="Draft a broadcast"
      action={
        <button onClick={onCancel} className="text-foreground/40 hover:text-foreground/70">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ClayField label="Announcement title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Revised schedule for next week's sessions"
            className={inputClass}
          />
        </ClayField>

        <ClayField label="Message body">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Write the full announcement…"
            className={textareaClass}
          />
        </ClayField>

        <label className="clay-inset flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3">
          <input
            type="checkbox"
            checked={triggerEmail}
            onChange={(e) => setTriggerEmail(e.target.checked)}
            className="h-4 w-4 accent-[var(--sky-deep)]"
          />
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Mail className="h-4 w-4 text-foreground/50" />
            Also email every student onboarded in this batch
          </div>
        </label>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={posting}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post announcement"}
        </button>
      </form>
    </Panel>
  );
}

function AnnouncementLog({
  announcements,
  action,
}: {
  announcements: MentorAnnouncement[] | null;
  action?: React.ReactNode;
}) {
  return (
    <Panel icon={Users2} title="Announcement history for this batch" action={action}>
      {announcements === null ? (
        <LoadingBlock compact />
      ) : announcements.length === 0 ? (
        <EmptyState icon={Megaphone} message="Nothing posted to this batch yet." />
      ) : (
        <ul className="space-y-2">
          {announcements.map((a) => (
            <li key={a.id} className="clay-inset px-4 py-3.5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{a.title}</p>
                <span className="text-xs text-foreground/40">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</span>
              </div>
              <p className="mb-2 text-sm text-foreground/70">{a.message}</p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-foreground/50">
                  {a.recipientCount ?? 0} recipient{a.recipientCount === 1 ? "" : "s"}
                </span>
                {a.emailTriggered && (
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      a.emailStatus === "sent"
                        ? "bg-[var(--mint-soft)]/60 text-foreground"
                        : a.emailStatus === "failed"
                          ? "bg-[var(--coral-soft)]/50 text-foreground"
                          : "bg-foreground/5 text-foreground/50"
                    }`}
                  >
                    {a.emailStatus === "sent" ? <MailCheck className="mr-1 inline h-3 w-3" /> : a.emailStatus === "failed" ? <MailWarning className="mr-1 inline h-3 w-3" /> : null}
                    Email {a.emailStatus}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}