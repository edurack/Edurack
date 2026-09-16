import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconCalendarTime as CalendarTime,
  IconUsers as Users,
  IconLink as LinkIcon,
  IconX as X,
} from "@tabler/icons-react";
import {
  listMyOfferings,
  createOffering,
  setOfferingActive,
  deleteOffering,
  listMyBookings,
  setMeetingLink,
} from "@/server-functions/mentor-sessions";
import { listEnabledSessionTemplates } from "@/server-functions/session-templates-admin";
import { DAY_LABELS, DURATION_OPTIONS, type DayOfWeek, type MentorSessionOffering, type MentorSessionBooking, type SessionTemplate } from "@/lib/session-types";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function MentorSessionsModule({ mentorToken }: { mentorToken: string }) {
  const [tab, setTab] = useState<"offerings" | "bookings">("offerings");
  const [offerings, setOfferings] = useState<MentorSessionOffering[] | null>(null);
  const [bookings, setBookings] = useState<MentorSessionBooking[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadOfferings() {
    const { offerings: rows } = await listMyOfferings({ data: { token: mentorToken } });
    setOfferings(rows as MentorSessionOffering[]);
  }
  async function loadBookings() {
    const { bookings: rows } = await listMyBookings({ data: { token: mentorToken } });
    setBookings(rows as MentorSessionBooking[]);
  }

  useEffect(() => {
    loadOfferings();
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Sessions</h1>
        <p className="mt-1 text-sm text-foreground/60">Publish open slots for students to book, and manage upcoming sessions.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("offerings")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${tab === "offerings" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
          >
            My offerings {offerings ? `(${offerings.length})` : ""}
          </button>
          <button
            onClick={() => setTab("bookings")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${tab === "bookings" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
          >
            Bookings {bookings ? `(${bookings.length})` : ""}
          </button>
        </div>
        {tab === "offerings" && (
          <button
            onClick={() => setShowCreate(true)}
            className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            New session offering
          </button>
        )}
      </div>

      {tab === "offerings" ? (
        <OfferingsList
          offerings={offerings}
          onToggleActive={async (id, active) => {
            await setOfferingActive({ data: { token: mentorToken, offeringId: id, active } });
            loadOfferings();
          }}
          onDelete={async (id) => {
            if (!confirm("Delete this offering? Existing bookings are kept, but no new ones can be made against it.")) return;
            await deleteOffering({ data: { token: mentorToken, offeringId: id } });
            loadOfferings();
          }}
        />
      ) : (
        <BookingsList
          bookings={bookings}
          onSetLink={async (id, link) => {
            await setMeetingLink({ data: { token: mentorToken, bookingId: id, meetingLink: link } });
            loadBookings();
          }}
        />
      )}

      {showCreate && (
        <CreateOfferingDialog
          mentorToken={mentorToken}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadOfferings();
          }}
        />
      )}
    </div>
  );
}

function OfferingsList({
  offerings,
  onToggleActive,
  onDelete,
}: {
  offerings: MentorSessionOffering[] | null;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (offerings === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (offerings.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No session offerings yet — create your first one.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {offerings.map((o) => (
        <div key={o.id} className="clay flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-foreground">{o.title}</p>
              <p className="text-xs text-foreground/50">
                {o.durationMinutes} min · {o.isFree ? "Free" : currency.format(o.price)}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${o.active ? "bg-[var(--mint-soft)] text-foreground" : "bg-foreground/10 text-foreground/50"}`}>
              {o.active ? "Live" : "Paused"}
            </span>
          </div>
          <p className="flex flex-wrap gap-1 text-xs text-foreground/60">
            {o.recurringDays
              .slice()
              .sort()
              .map((d) => DAY_LABELS[d])
              .join(", ")}{" "}
            · {o.startTimes.join(", ")}
          </p>
          {!o.isOngoing && o.dateRangeEnd && (
            <p className="text-[11px] text-foreground/40">Ends {new Date(o.dateRangeEnd).toLocaleDateString("en-IN")}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button onClick={() => onToggleActive(o.id, !o.active)} className="clay-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold">
              {o.active ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => onDelete(o.id)}
              className="clay-btn-ghost inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--coral-soft)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BookingsList({
  bookings,
  onSetLink,
}: {
  bookings: MentorSessionBooking[] | null;
  onSetLink: (id: string, link: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (bookings === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (bookings.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No bookings yet.</div>;
  }
  return (
    <ul className="space-y-2">
      {bookings.map((b) => (
        <li key={b.id} className="clay-inset flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Users className="h-3.5 w-3.5 text-foreground/40" />
              {b.studentName} — {b.offeringTitle}
            </p>
            <p className="text-xs text-foreground/50">
              {new Date(b.sessionDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {b.startTime} ·{" "}
              {b.isFree ? "Free" : currency.format(b.price)} ·{" "}
              <span className={b.paymentStatus === "paid" || b.paymentStatus === "free" ? "text-[var(--sky-deep)]" : ""}>{b.paymentStatus}</span>
            </p>
            {b.studentNote && <p className="mt-0.5 text-xs italic text-foreground/50">"{b.studentNote}"</p>}
          </div>
          {editingId === b.id ? (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Meeting link"
                className="clay-inset rounded-xl px-3 py-1.5 text-xs focus:outline-none"
              />
              <button
                onClick={() => {
                  onSetLink(b.id, draft);
                  setEditingId(null);
                }}
                className="clay-btn rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                Save
              </button>
            </div>
          ) : b.meetingLink ? (
            <a href={b.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)] hover:underline">
              <LinkIcon className="h-3.5 w-3.5" />
              Meeting link
            </a>
          ) : (
            <button
              onClick={() => {
                setEditingId(b.id);
                setDraft("");
              }}
              className="clay-btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              Add meeting link
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function CreateOfferingDialog({
  mentorToken,
  onClose,
  onCreated,
}: {
  mentorToken: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<(typeof DURATION_OPTIONS)[number]>(30);
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("");
  const [days, setDays] = useState<Set<DayOfWeek>>(new Set());
  const [times, setTimes] = useState<string[]>(["17:00"]);
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [templates, setTemplates] = useState<SessionTemplate[] | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEnabledSessionTemplates({ data: { token: mentorToken } }).then(({ templates: t }) => setTemplates(t as SessionTemplate[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDay(d: DayOfWeek) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await createOffering({
        data: {
          token: mentorToken,
          title,
          description,
          durationMinutes: duration,
          isFree,
          price: Number(price) || 0,
          thumbnailUrl,
          recurringDays: Array.from(days),
          startTimes: times.filter(Boolean),
          dateRangeStart: null,
          dateRangeEnd: ongoing ? null : endDate || null,
          isOngoing: ongoing,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this offering.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="clay max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">New session offering</h3>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3.5">
          <Field label="Title / topic">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Doubt clearing — Organic Chemistry" className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          </Field>

          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          </Field>

          <Field label="Duration">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${duration === d ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
                  {d} min
                </button>
              ))}
            </div>
          </Field>

          <Field label="Price">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-foreground/70">
                <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
                Free
              </label>
              {!isFree && (
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                  placeholder="₹ amount"
                  className="clay-inset flex-1 rounded-2xl px-4 py-2 text-sm focus:outline-none"
                />
              )}
            </div>
            {!isFree && price && <p className="mt-1 text-[11px] text-foreground/40">You'll receive {currency.format(Math.round(Number(price) * 0.95))} after platform commission (5%).</p>}
          </Field>

          <Field label="Days available">
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((label, i) => (
                <button key={label} type="button" onClick={() => toggleDay(i as DayOfWeek)} className={`rounded-xl py-1.5 text-xs font-semibold ${days.has(i as DayOfWeek) ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Start times">
            <div className="space-y-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                    className="clay-inset rounded-2xl px-4 py-2 text-sm focus:outline-none"
                  />
                  {times.length > 1 && (
                    <button onClick={() => setTimes((prev) => prev.filter((_, idx) => idx !== i))} className="text-foreground/40 hover:text-foreground/70">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setTimes((prev) => [...prev, "17:00"])} className="clay-btn-ghost inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                Add another time
              </button>
            </div>
          </Field>

          <Field label="Duration of this offering">
            <label className="flex items-center gap-1.5 text-xs text-foreground/70">
              <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
              Ongoing (no end date)
            </label>
            {!ongoing && (
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="clay-inset mt-2 w-full rounded-2xl px-4 py-2 text-sm focus:outline-none" />
            )}
          </Field>

          {templates && templates.length > 0 && (
            <Field label="Thumbnail (optional — pick a template)">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThumbnailUrl(t.thumbnailUrl)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-2 ${thumbnailUrl === t.thumbnailUrl ? "ring-[var(--sky-deep)]" : "ring-transparent"}`}
                  >
                    <img src={t.thumbnailUrl} alt={t.title} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </Field>
          )}

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || days.size === 0}
            className="clay-btn mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarTime className="h-4 w-4" />}
            Publish offering
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
      {children}
    </div>
  );
}