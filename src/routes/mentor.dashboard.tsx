import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  GraduationCap,
  LayoutDashboard,
  User,
  Megaphone,
  CalendarClock,
  MessageSquare,
  LifeBuoy,
  Library,
  ClipboardList,
  LogOut,
  Tag,
} from "lucide-react";
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

type ModuleKey =
  | "overview"
  | "profile"
  | "announcements"
  | "scheduler"
  | "chat"
  | "support"
  | "library"
  | "testSeries"
  | "sellTests";

// Overview leads now — a mentor logging in sees what needs their attention,
// not an edit form. Order after that roughly matches how often each tab
// gets used day-to-day (schedule/chat before the rarer profile/support).
// Test Series and Sell Tests sit right after Announcements — both are
// mentor-initiated, occasionally-visited product-management areas, same
// usage tier as Announcements, and ahead of the rarer Profile/Help Desk tabs.
const MODULES: { key: ModuleKey; label: string; icon: typeof User }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "scheduler", label: "Live Sessions", icon: CalendarClock },
  { key: "chat", label: "Chat Desk", icon: MessageSquare },
  { key: "library", label: "Lecture Library", icon: Library },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "testSeries", label: "Test Series", icon: ClipboardList },
  { key: "sellTests", label: "Sell Tests", icon: Tag },
  { key: "profile", label: "Profile", icon: User },
  { key: "support", label: "Help Desk", icon: LifeBuoy },
];

export const Route = createFileRoute("/mentor/dashboard")({
  head: () => ({
    meta: [
      { title: "Mentor Portal · Edurack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MentorDashboardPage,
});

const MENTOR_SESSION_KEY = "mentor_session_token";

type MentorIdentity = {
  id: string;
  name: string;
  username: string;
  profilePictureUrl: string | null;
  email?: string | null;
};

function MentorDashboardPage() {
  const navigate = useNavigate();
  const [mentorToken, setMentorToken] = useState<string | null>(null);
  const [mentor, setMentor] = useState<MentorIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");

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

  const activeLabel = MODULES.find((m) => m.key === activeModule)?.label ?? "";

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--mint-soft)] opacity-30 blur-3xl" />
      </div>

      <div className="flex min-h-screen">
        {/* ── Desktop sidebar ──────────────────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-foreground/5 bg-background/70 px-3 py-5 backdrop-blur-md sm:flex">
          <SidebarContent
            activeModule={activeModule}
            onSelect={setActiveModule}
            onSignOut={handleSignOut}
            mentor={mentor}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Mobile header + horizontally-scrolling tabs ──────────
              Icon-only vertical rail (the old mobile layout) crams 7 tiny
              targets into a 4rem-wide strip. A top header + scrollable
              pill row gives every tab a real label and full-height tap
              target, which is the layout mobile chat/scheduling apps
              actually use — not a shrunk desktop sidebar. */}
          <div className="sm:hidden">
            <header className="clay-sm sticky top-0 z-20 mx-3 mt-3 flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="clay-inset flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {mentor.profilePictureUrl ? (
                    <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-foreground/50">
                      {mentor.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{mentor.name}</p>
                  <p className="truncate text-[10px] text-foreground/50">{activeLabel}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="clay-btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-full"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </header>

            <nav className="mx-3 mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setActiveModule(m.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                      active ? "clay-btn text-white" : "clay-chip text-foreground/70"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ── Content canvas ───────────────────────────────────────── */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto max-w-5xl">
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
              {activeModule === "sellTests" && (
                <MentorSellTestsModule mentorToken={mentorToken} mentorEmail={mentor.email ?? null} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({
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
      <div className="mb-5 flex items-center gap-2 px-2">
        <div className="clay flex h-9 w-9 shrink-0 items-center justify-center">
          <GraduationCap className="h-4 w-4 text-foreground/70" />
        </div>
        <span className="truncate font-display text-sm font-bold tracking-tight text-foreground">Mentor Portal</span>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-foreground/5 px-3 py-3">
        <div className="clay-inset flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
          {mentor.profilePictureUrl ? (
            <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-foreground/50">{mentor.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{mentor.name}</p>
          <p className="truncate text-xs text-foreground/50">@{mentor.username}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = activeModule === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelect(m.key)}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                active ? "clay-btn text-white" : "text-foreground/70 hover:bg-foreground/5"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {m.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-foreground/5 pt-4">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </>
  );
}