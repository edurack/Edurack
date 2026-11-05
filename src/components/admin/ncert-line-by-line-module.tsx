import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, Eye, EyeOff, Loader2, Users } from "lucide-react";
import { chaptersFor, toSyllabusSubject, type Syllabus } from "@/lib/ncert-syllabus";
import { getNcertSyllabus, getNcertTopicCounts, getNcertVisibilityAdmin, setNcertVisibility } from "@/server-functions/ncert-line-admin";
import { NCERT_SUBJECTS, type NcertClassLevel, type NcertSubject, type NcertVisibility } from "@/lib/ncert-line-types";
import { NcertQuestionJsonUpload } from "@/components/admin/ncert-question-json-upload";
import { NcertQuestionManager } from "@/components/admin/ncert-question-manager";
import { cn } from "@/lib/utils";

type AdminUser = { getIdToken: () => Promise<string> };
type Props = { adminUser: AdminUser };

const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);

/** Chapter + topic picker, live per-topic counts, and the JSON upload — "upload a question bank, chapter by chapter." */
export function NcertLineByLineModule({ adminUser }: Props) {
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [loadError, setLoadError] = useState("");

  const [subject, setSubject] = useState<NcertSubject>("Physics");
  const [classLevel, setClassLevel] = useState<NcertClassLevel>("11");
  const [chapter, setChapter] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const [counts, setCounts] = useState<{ topic: string; count: number }[]>([]);
  const [countsLoading, setCountsLoading] = useState(false);
  // Bumped after an upload so the "Manage uploaded questions" list reloads.
  const [listVersion, setListVersion] = useState(0);

  // Syllabus loads once.
  useEffect(() => {
    (async () => {
      try {
        const token = await adminUser.getIdToken();
        const res = await getNcertSyllabus({ data: { token } });
        setSyllabus(res.syllabus as Syllabus);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load the NEET syllabus.");
      }
    })();
  }, [adminUser]);

  const chapters = useMemo(() => chaptersFor(syllabus, toSyllabusSubject(subject), classLevel), [syllabus, subject, classLevel]);
  const chapterHit = useMemo(() => chapters.find((c) => c.chapter === chapter) ?? null, [chapters, chapter]);

  // Changing subject/class resets the chapter; a new chapter list defaults to its first chapter, all topics selected.
  useEffect(() => {
    setChapter(chapters[0]?.chapter ?? "");
  }, [chapters]);
  useEffect(() => {
    setSelectedTopics(chapterHit?.topics ?? []);
  }, [chapterHit]);

  const loadCounts = async () => {
    if (!chapter) return;
    setCountsLoading(true);
    try {
      const token = await adminUser.getIdToken();
      const res = await getNcertTopicCounts({ data: { token, subject, chapter } });
      setCounts(res.counts.map((c) => ({ topic: c.topic, count: c.count })));
    } catch {
      setCounts([]);
    } finally {
      setCountsLoading(false);
    }
  };
  useEffect(() => { void loadCounts(); }, [subject, chapter]); // eslint-disable-line react-hooks/exhaustive-deps

  const countByTopic = useMemo(() => new Map(counts.map((c) => [c.topic.toLowerCase(), c.count])), [counts]);
  const chapterTotal = counts.reduce((n, c) => n + c.count, 0);

  function toggleTopic(topic: string) {
    setSelectedTopics((cur) => (cur.includes(topic) ? cur.filter((t) => t !== topic) : [...cur, topic]));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-bold tracking-tight">NCERT Line by Line</h1>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          A new, topic-tagged NEET question bank — built straight from NCERT, line by line. Pick a chapter, pick the topics it
          covers, then drop in a JSON file. Counts update automatically as you go.
        </p>
      </div>

      <NcertVisibilityCard adminUser={adminUser} />

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {!syllabus ? (
        <div className="py-16 text-center text-sm text-foreground/50">Loading the NEET syllabus…</div>
      ) : (
        <div className="clay-sm rounded-2xl p-4 sm:p-5">
          <h2 className="text-sm font-bold">1. Pick a chapter</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Subject">
              <select value={subject} onChange={(e) => setSubject(e.target.value as NcertSubject)} className="clay-inset w-full rounded-xl px-3 py-2 text-sm">
                {NCERT_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select value={classLevel} onChange={(e) => setClassLevel(e.target.value as NcertClassLevel)} className="clay-inset w-full rounded-xl px-3 py-2 text-sm">
                <option value="11">Class 11</option>
                <option value="12">Class 12</option>
              </select>
            </Field>
            <Field label="Chapter">
              <select value={chapter} onChange={(e) => setChapter(e.target.value)} className="clay-inset w-full rounded-xl px-3 py-2 text-sm">
                {chapters.length === 0 && <option value="">No chapters</option>}
                {chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
              </select>
            </Field>
          </div>

          {chapterHit && (
            <>
              <div className="mt-5 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">2. Pick the topics this upload covers</h2>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <button type="button" onClick={() => setSelectedTopics(chapterHit.topics)} className="text-foreground/60 hover:underline">Select all</button>
                  <span className="text-foreground/30">·</span>
                  <button type="button" onClick={() => setSelectedTopics([])} className="text-foreground/60 hover:underline">Clear</button>
                </div>
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                All topics are selected by default — deselect any you aren't uploading questions for right now.
                {countsLoading ? " Loading counts…" : chapterTotal > 0 ? ` ${number(chapterTotal)} question${chapterTotal === 1 ? "" : "s"} already uploaded for this chapter.` : " No questions uploaded for this chapter yet."}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {chapterHit.topics.map((topic) => {
                  const count = countByTopic.get(topic.toLowerCase()) ?? 0;
                  const checked = selectedTopics.includes(topic);
                  return (
                    <label
                      key={topic}
                      className={cn(
                        "clay-inset flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors",
                        checked ? "ring-2 ring-[var(--sky-deep)]" : "opacity-70",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" checked={checked} onChange={() => toggleTopic(topic)} className="shrink-0" />
                        <span className="truncate font-semibold text-foreground">{topic}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", count > 0 ? "bg-[var(--mint-soft)]/70 text-emerald-800" : "bg-foreground/5 text-foreground/40")}>
                        {number(count)}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-5">
                <h2 className="mb-3 text-sm font-bold">3. Upload the questions</h2>
                <NcertQuestionJsonUpload
                  adminUser={adminUser}
                  subject={subject}
                  classLevel={classLevel}
                  chapter={chapterHit.chapter}
                  topics={selectedTopics}
                  onImported={async () => {
                    await loadCounts();
                    setListVersion((v) => v + 1);
                  }}
                />
              </div>

              <div className="mt-5">
                <h2 className="mb-3 text-sm font-bold">4. Manage uploaded questions</h2>
                <NcertQuestionManager adminUser={adminUser} subject={subject} chapter={chapterHit.chapter} topics={chapterHit.topics} counts={counts} reloadSignal={listVersion} onChanged={loadCounts} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground/50">{label}</span>
      {children}
    </label>
  );
}

function NcertVisibilityCard({ adminUser }: { adminUser: AdminUser }) {
  const [visibility, setVisibilityState] = useState<NcertVisibility | null>(null);
  const [emailsText, setEmailsText] = useState("");
  const [mode, setMode] = useState<"beta" | "live">("beta");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const token = await adminUser.getIdToken();
      const v = await getNcertVisibilityAdmin({ data: { token } });
      setVisibilityState(v);
      setMode(v.mode);
      setEmailsText(v.betaEmails.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load visibility settings.");
    }
  };
  useEffect(() => { void load(); }, [adminUser]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const token = await adminUser.getIdToken();
      const betaEmails = emailsText.split(/[\n,]/).map((e) => e.trim()).filter(Boolean);
      const v = await setNcertVisibility({ data: { token, mode, betaEmails } });
      setVisibilityState(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay-sm rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2">
        {mode === "live" ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-foreground/50" />}
        <h2 className="text-sm font-bold">Where students see this</h2>
      </div>
      <p className="mt-1 text-xs text-foreground/50">
        In the PYQ Practice section, students always see an "NCERT Line by Line" card. Keep it <strong>Coming soon</strong>{" "}
        while you're still uploading, open it to a short list of test emails, or make it <strong>Live</strong> for everyone.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <ModeChip active={mode === "beta"} onClick={() => setMode("beta")} icon={<Users className="h-3.5 w-3.5" />}>
          Coming soon · beta testers only
        </ModeChip>
        <ModeChip active={mode === "live"} onClick={() => setMode("live")} icon={<Eye className="h-3.5 w-3.5" />}>
          Live for everyone
        </ModeChip>
      </div>

      {mode === "beta" && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Test emails (one per line, or comma-separated)
          </label>
          <textarea
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            rows={3}
            placeholder="you@edurack.com&#10;friend@example.com"
            className="clay-inset w-full rounded-xl px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-foreground/45">These accounts see it live and can practise now; everyone else sees Coming soon.</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="clay-btn inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
        {error && <span className="text-xs font-semibold text-destructive">{error}</span>}
        {visibility?.updatedAt && !saved && !error && (
          <span className="text-xs text-foreground/40">Last changed {new Date(visibility.updatedAt).toLocaleString("en-IN")}</span>
        )}
      </div>
    </div>
  );
}

function ModeChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold", active ? "clay-btn text-white" : "clay-chip text-foreground/70")}
    >
      {icon}
      {children}
    </button>
  );
}
