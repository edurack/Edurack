// Promoter dashboard shell. Session is a plain localStorage token (set by
// promoter.auth.tsx), verified against getPromoterSession on mount — no
// Firebase involved anywhere in this file, matching the promoter auth
// system's independence from admin/mentor identity.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  Megaphone,
  LayoutDashboard,
  Layers3,
  UserCircle2,
  LifeBuoy,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { getPromoterSession } from "@/server-functions/promoter-auth";
import { PromoterOverviewModule } from "@/components/promoter-overview-module";
import { PromoterSelectBatchesModule } from "@/components/promoter-select-batches-module";
import { PromoterProfileModule } from "@/components/promoter-profile-module";
import { PromoterHelpModule } from "@/components/promoter-help-module";

const PROMOTER_TOKEN_KEY = "edurack_promoter_token";

type TabKey = "overview" | "batches" | "profile" | "help";
type TabDef = { key: TabKey; label: string; icon: typeof LayoutDashboard };

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "batches", label: "Select Batches", icon: Layers3 },
  { key: "profile", label: "Profile", icon: UserCircle2 },
  { key: "help", label: "Help / Support", icon: LifeBuoy },
];
const TAB_KEYS = TABS.map((t) => t.key);

export const Route = createFileRoute("/promoter/dashboard")({
  head: () => ({
    meta: [{ title: "Promoter Dashboard · Edurack" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: TabKey } => {
    const raw = typeof search.tab === "string" ? (search.tab as TabKey) : undefined;
    return { tab: raw && TAB_KEYS.includes(raw) ? raw : undefined };
  },
  component: PromoterDashboardPage,
});

type PromoterIdentity = { id: string; name: string; username: string; profilePictureUrl: string | null };

function PromoterDashboardPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const activeTab: TabKey = tab ?? "overview";
  const [promoter, setPromoter] = useState<PromoterIdentity | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(PROMOTER_TOKEN_KEY);
      if (!token) {
        setStatus("invalid");
        return;
      }
      try {
        const result = await getPromoterSession({ data: { token } });
        setPromoter(result.promoter);
        setStatus("ready");
      } catch {
        localStorage.removeItem(PROMOTER_TOKEN_KEY);
        setStatus("invalid");
      }
    })();
  }, []);

  useEffect(() => {
    if (status === "invalid") navigate({ to: "/promoter/auth" });
  }, [status, navigate]);

  function setActiveTab(key: TabKey) {
    navigate({ to: "/promoter/dashboard", search: { tab: key }, replace: true });
    setDrawerOpen(false);
  }

  function handleSignOut() {
    localStorage.removeItem(PROMOTER_TOKEN_KEY);
    navigate({ to: "/promoter/auth" });
  }

  if (status !== "ready" || !promoter) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  function getToken() {
    return localStorage.getItem(PROMOTER_TOKEN_KEY) ?? "";
  }

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--sky-soft)] opacity-30 blur-3xl" />
      </div>

      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-foreground/5 bg-background/70 py-5 backdrop-blur-md md:flex">
          <SidebarContent
            activeTab={activeTab}
            onSelect={setActiveTab}
            onSignOut={handleSignOut}
            promoter={promoter}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:hidden">
          <header className="clay-sm sticky top-0 z-20 mx-3 mt-3 flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="clay flex h-8 w-8 shrink-0 items-center justify-center">
                <Megaphone className="h-4 w-4 text-[var(--sky-deep)]" />
              </div>
              <span className="font-display text-sm font-bold text-foreground">
                {TABS.find((t) => t.key === activeTab)?.label}
              </span>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="clay-btn-ghost grid h-9 w-9 place-items-center"
              aria-label="Open menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          </header>

          {drawerOpen && (
            <div className="fixed inset-0 z-40 flex md:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
              <div className="clay relative flex h-full w-[82%] max-w-xs flex-col rounded-l-none rounded-r-3xl py-5">
                <div className="mb-2 flex items-center justify-between px-4">
                  <span className="font-display text-sm font-bold text-foreground">Promoter Menu</span>
                  <button onClick={() => setDrawerOpen(false)} className="text-foreground/40 hover:text-foreground/70">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent
                  activeTab={activeTab}
                  onSelect={setActiveTab}
                  onSignOut={handleSignOut}
                  promoter={promoter}
                  compactHeader
                />
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1 px-4 py-6">
            <TabRouter activeTab={activeTab} getToken={getToken} />
          </main>
        </div>

        <main className="hidden min-w-0 flex-1 px-8 py-8 md:block">
          <div className="mx-auto max-w-5xl">
            <TabRouter activeTab={activeTab} getToken={getToken} />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  activeTab,
  onSelect,
  onSignOut,
  promoter,
  compactHeader,
}: {
  activeTab: TabKey;
  onSelect: (key: TabKey) => void;
  onSignOut: () => void;
  promoter: PromoterIdentity;
  compactHeader?: boolean;
}) {
  return (
    <>
      {!compactHeader && (
        <div className="mb-4 flex items-center gap-2 px-3">
          <div className="clay flex h-9 w-9 shrink-0 items-center justify-center">
            <Megaphone className="h-4 w-4 text-[var(--sky-deep)]" />
          </div>
          <span className="truncate font-display text-sm font-bold tracking-tight text-foreground">
            Promoter Portal
          </span>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                active ? "clay-btn text-white" : "text-foreground/70 hover:bg-foreground/5"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 space-y-1 border-t border-foreground/5 px-3 pt-4">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="clay-inset flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
            {promoter.profilePictureUrl ? (
              <img src={promoter.profilePictureUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-foreground/50">
                {promoter.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="truncate text-xs font-semibold text-foreground/70">{promoter.name}</span>
        </div>
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

function TabRouter({ activeTab, getToken }: { activeTab: TabKey; getToken: () => string }) {
  switch (activeTab) {
    case "overview":
      return <PromoterOverviewModule getToken={getToken} />;
    case "batches":
      return <PromoterSelectBatchesModule getToken={getToken} />;
    case "profile":
      return <PromoterProfileModule getToken={getToken} />;
    case "help":
      return <PromoterHelpModule getToken={getToken} />;
    default:
      return null;
  }
}