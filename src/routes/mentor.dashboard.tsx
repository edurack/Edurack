import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconSchool as GraduationCap,
  IconLayoutDashboard as LayoutDashboard,
  IconUser as User,
  IconSpeakerphone as Megaphone,
  IconCalendarClock as CalendarClock,
  IconMessageCircle as MessageSquare,
  IconLifebuoy as LifeBuoy,
  IconClipboardList as ClipboardList,
  IconLogout as LogOut,
  IconTag as Tag,
  IconSearch as Search,
  IconMenu2 as Menu,
  IconX as X,
  IconVideo as Video,
} from "@tabler/icons-react";
import { Library } from "lucide-react"; // TODO: no Tabler mapping found yet
import { getMentorSession } from "@/server-functions/mentor-auth";
import { MentorOverviewModule } from "@/components/mentor-overview-module";
import { MentorProfileModule } from "@/components/mentor-profile-module";
import { MentorAnnouncementModule } from "@/components/mentor-announcement-module";
import { MentorSchedulerModule } from "@/components/mentor-scheduler-module";
import { MentorChatModule } from "@/components/mentor-chat-module";
import { MentorSupportModule } from "@/components/mentor-support-module";
import { MentorLectureLibraryModule } from "@/components/mentor-lecture-library-module";
import { MentorTestSeriesModule } from "@/components/mentor-test-series-module";
import { MentorSellTestsModule } from "@/components/mentor-sell-tests-module";
import { MentorSessionsModule } from "@/components/mentor-sessions-module";
import type { IconType } from "@/components/mentor-portal-ui";

type ModuleKey =
  | "overview"
  | "profile"
  | "announcements"
  | "scheduler"
  | "chat"
  | "support"
  | "library"
  | "testSeries"
  | "sessions"
  | "sellTests";

type ModuleDef = {
  key: ModuleKey;
  label: string;
  icon: IconType;
  // One plain-language line + extra search words for the ⌘K jump menu.
  hint: string;
  keywords: string;
};

// Grouped by what a mentor is doing, not by how the code is organised.
// "Live Sessions" is now "Batch schedule" — it was easy to confuse with the
// separate "Sessions" tab (both used the same icon and a near-identical name).
const MODULE_GROUPS: { label: string; items: ModuleDef[] }[] = [
  {
    label: "Home",
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        hint: "Your day, earnings and what needs you",
        keywords: "home dashboard earnings money revenue payments",
      },
    ],
  },
  {
    label: "Teach",
    items: [
      {
        key: "scheduler",
        label: "Batch schedule",
        icon: CalendarClock,
        hint: "Batch meets, 1:1s and lecture uploads for your batch",
        keywords: "live sessions calendar meeting link zoom meet schedule class",
      },
      {
        key: "sessions",
        label: "Sessions",
        icon: Video,
        hint: "Sessions students can book with you",
        keywords: "book booking offering slots paid 1:1",
      },
      {
        key: "library",
        label: "Lecture library",
        icon: Library,
        hint: "Your lectures, viewers, ratings and comments",
        keywords: "videos recordings watch comments upload",
      },
    ],
  },
  {
    label: "Students",
    items: [
      {
        key: "chat",
        label: "Chat desk",
        icon: MessageSquare,
        hint: "Message students and share notes",
        keywords: "messages dm inbox reply notes students",
      },
      {
        key: "announcements",
        label: "Announcements",
        icon: Megaphone,
        hint: "Broadcast to your batch",
        keywords: "broadcast notice email post",
      },
    ],
  },
  {
    label: "Sell",
    items: [
      {
        key: "testSeries",
        label: "Test series",
        icon: ClipboardList,
        hint: "Tests that come free with your batch",
        keywords: "tests mock exam questions pdf",
      },
      {
        key: "sellTests",
        label: "Sell tests",
        icon: Tag,
        hint: "Standalone tests anyone can buy",
        keywords: "price pricing standalone store commission",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        key: "profile",
        label: "Profile",
        icon: User,
        hint: "What students see, and your promotion settings",
        keywords: "bio photo picture promotion settings account",
      },
      {
        key: "support",
        label: "Help desk",
        icon: LifeBuoy,
        hint: "Raise an issue with Team Edurack",
        keywords: "ticket support problem issue contact",
      },
    ],
  },
];

const ALL_MODULES: ModuleDef[] = MODULE_GROUPS.flatMap((g) => g.items);
const MODULE_KEYS = ALL_MODULES.map((m) => m.key);
const MODULE_BY_KEY = Object.fromEntries(ALL_MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>;
// What lives on the mobile tab bar; everything else sits behind "More".
const MOBILE_TABS: ModuleKey[] = ["overview", "scheduler", "chat", "library"];

export const Route = createFileRoute("/mentor/dashboard")({
  head: () => ({
    meta: [
      { title: "Mentor Portal · Edurack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  // The active tab lives in the URL (?tab=chat) so a refresh keeps your place
  // and a tab can be linked to — same approach as the admin dashboard.
  validateSearch: (search: Record<string, unknown>): { tab?: ModuleKey } => {
    const raw = typeof search.tab === "string" ? (search.tab as ModuleKey) : undefined;
    return { tab: raw && MODULE_KEYS.includes(raw) ? raw : undefined };
  },
  component: MentorDashboardPage,
});

const MENTOR_SESSION_KEY = "mentor_session_token";

// Shown on the Jump button — ⌘K on Mac, Ctrl K elsewhere. Only ever read on
// the client (the page renders after the session check), so no hydration risk.
const SHORTCUT_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

type MentorIdentity = {
  id: string;
  name: string;
  username: string;
  profilePictureUrl: string | null;
  email?: string | null;
};

function MentorDashboardPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const activeModule: ModuleKey = tab ?? "overview";

  const [mentorToken, setMentorToken] = useState<string | null>(null);
  const [mentor, setMentor] = useState<MentorIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(MENTOR_SESSION_KEY);
      if (!token) {
        navigate({ to: "/admin/auth" });
        return;
      }
      try {
        const { mentor: m } = await getMentorSession({ data: { token } });
        setMentor(m);
        setMentorToken(token);
      } catch {
        // Token expired, tampered with, or the mentor account no longer
        // exists — clear it and bounce back to sign-in rather than getting
        // stuck on a dashboard that can never load.
        localStorage.removeItem(MENTOR_SESSION_KEY);
        navigate({ to: "/admin/auth" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K / Ctrl+K opens the jump menu from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function setActiveModule(key: ModuleKey) {
    navigate({ to: "/mentor/dashboard", search: { tab: key }, replace: true });
    setPaletteOpen(false);
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  }

  function handleSignOut() {
    localStorage.removeItem(MENTOR_SESSION_KEY);
    navigate({ to: "/admin/auth" });
  }

  if (loading || !mentorToken || !mentor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const active = MODULE_BY_KEY[activeModule];
  const ActiveIcon = active.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* ── Desktop sidebar ────────────────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-background px-3 py-5 sm:flex">
          <Sidebar activeModule={activeModule} onSelect={setActiveModule} onSignOut={handleSignOut} mentor={mentor} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Desktop top bar ──────────────────────────────────── */}
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-border bg-background/90 px-8 backdrop-blur sm:flex">
            <div className="flex min-w-0 items-center gap-2.5">
              <ActiveIcon className="h-4 w-4 text-foreground/50" />
              <span className="truncate font-display text-sm font-bold text-foreground">{active.label}</span>
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="clay-btn-ghost flex items-center gap-2 px-3.5 py-1.5 text-xs text-foreground/60"
            >
              <Search className="h-3.5 w-3.5" />
              Jump to…
              <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-semibold text-foreground/60">
                {SHORTCUT_LABEL}
              </kbd>
            </button>
          </header>

          {/* ── Mobile header ────────────────────────────────────── */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar mentor={mentor} size={34} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{active.label}</p>
                <p className="truncate text-[11px] text-foreground/50">{mentor.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="clay-btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-full"
              aria-label="Jump to a section"
            >
              <Search className="h-4 w-4" />
            </button>
          </header>

          {/* ── Content canvas ───────────────────────────────────── */}
          <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-8 sm:pb-12 sm:pt-8">
            <div className="mx-auto max-w-6xl">
              {activeModule === "overview" && (
                <MentorOverviewModule mentorToken={mentorToken} mentorName={mentor.name} onNavigate={setActiveModule} />
              )}
              {activeModule === "profile" && <MentorProfileModule mentorToken={mentorToken} />}
              {activeModule === "announcements" && <MentorAnnouncementModule mentorToken={mentorToken} />}
              {activeModule === "scheduler" && <MentorSchedulerModule mentorToken={mentorToken} />}
              {activeModule === "library" && <MentorLectureLibraryModule mentorToken={mentorToken} />}
              {activeModule === "chat" && <MentorChatModule mentorToken={mentorToken} />}
              {activeModule === "support" && <MentorSupportModule mentorToken={mentorToken} />}
              {activeModule === "testSeries" && <MentorTestSeriesModule mentorToken={mentorToken} />}
              {activeModule === "sessions" && <MentorSessionsModule mentorToken={mentorToken} />}
              {activeModule === "sellTests" && (
                <MentorSellTestsModule mentorToken={mentorToken} mentorEmail={mentor.email ?? null} />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* ── Mobile bottom tab bar ──────────────────────────────── */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        {MOBILE_TABS.map((key) => {
          const m = MODULE_BY_KEY[key];
          const Icon = m.icon;
          const isActive = activeModule === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveModule(key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                isActive ? "text-primary" : "text-foreground/50"
              }`}
            >
              <Icon className="h-5 w-5" />
              {m.label.split(" ")[0]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
            !MOBILE_TABS.includes(activeModule) ? "text-primary" : "text-foreground/50"
          }`}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          activeModule={activeModule}
          onSelect={setActiveModule}
          onSignOut={handleSignOut}
          onClose={() => setMoreOpen(false)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={setActiveModule}
        onSignOut={handleSignOut}
      />
    </div>
  );
}

function Avatar({ mentor, size }: { mentor: MentorIdentity; size: number }) {
  return (
    <div
      className="clay-inset flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {mentor.profilePictureUrl ? (
        <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-foreground/50">{mentor.name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function Sidebar({
  activeModule,
  onSelect,
  onSignOut,
  mentor,
}: {
  activeModule: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onSignOut: () => void;
  mentor: MentorIdentity;
}) {
  return (
    <>
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="h-4.5 w-4.5" />
        </div>
        <span className="truncate font-display text-sm font-bold tracking-tight text-foreground">Mentor Portal</span>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-1">
        {MODULE_GROUPS.map((group) => (
          <div key={group.label}>
            {group.label !== "Home" && (
              <p className="mb-1 px-3 text-[11px] font-semibold text-foreground/40">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((m) => {
                const Icon = m.icon;
                const isActive = activeModule === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onSelect(m.key)}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/65 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar mentor={mentor} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{mentor.name}</p>
            <p className="truncate text-xs text-foreground/50">@{mentor.username}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

// Bottom sheet holding every section that doesn't fit on the tab bar.
function MoreSheet({
  activeModule,
  onSelect,
  onSignOut,
  onClose,
}: {
  activeModule: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="All sections">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-bold text-foreground">All sections</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-foreground/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ALL_MODULES.map((m) => {
            const Icon = m.icon;
            const isActive = activeModule === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onSelect(m.key)}
                className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-center text-xs font-semibold transition-colors ${
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground/75 active:bg-secondary"
                }`}
              >
                <Icon className="h-5 w-5" />
                {m.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="clay-btn-ghost mt-4 flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ⌘K jump menu — type a section name or what you want to do ("meeting link",
// "ticket", "price") and hit Enter.
function CommandPalette({
  open,
  onClose,
  onSelect,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (key: ModuleKey) => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_MODULES;
    return ALL_MODULES.filter((m) => `${m.label} ${m.hint} ${m.keywords}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Wait a tick so the input exists before focusing it.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const m = results[index];
      if (m) onSelect(m.key);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Jump to a section"
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="clay shadow-float relative w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-foreground/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where do you want to go?"
            className="w-full bg-transparent py-3.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            aria-label="Search sections"
          />
          <kbd className="shrink-0 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground/50">
            Esc
          </kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-foreground/50">Nothing matches “{query}”.</li>
          ) : (
            results.map((m, i) => {
              const Icon = m.icon;
              return (
                <li key={m.key} role="option" aria-selected={i === index}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.key)}
                    onMouseMove={() => setIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      i === index ? "bg-primary/10" : ""
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        i === index ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/60"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{m.label}</span>
                      <span className="block truncate text-xs text-foreground/55">{m.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-foreground/60 transition-colors hover:bg-foreground/5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
