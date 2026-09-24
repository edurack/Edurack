// Shared header + tab nav for every intern-facing page. Keeps navigation
// (and the "which tab is active" styling) consistent across
// dashboard/profile/offer-letter/certificate instead of four separate
// hand-rolled headers.
import { Link } from "@tanstack/react-router";
import {
  IconLayoutDashboard as LayoutDashboard,
  IconUserCircle as UserCircle,
  IconFileText as FileText,
  IconCertificate as CertificateIcon,
} from "@tabler/icons-react";

export type InternTab = "dashboard" | "profile" | "offer-letter" | "certificate";

const TABS: { key: InternTab; label: string; to: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Tasks", to: "/intern/dashboard", icon: LayoutDashboard },
  { key: "profile", label: "Profile", to: "/intern/profile", icon: UserCircle },
  { key: "offer-letter", label: "Offer Letter", to: "/intern/offer-letter", icon: FileText },
  { key: "certificate", label: "Certificate", to: "/intern/certificate", icon: CertificateIcon },
];

export function InternShell({
  internName,
  activeTab,
  onSignOut,
  headerExtra,
  children,
}: {
  internName: string;
  activeTab: InternTab;
  onSignOut: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Hey, {internName}</h1>
            <p className="mt-1 text-sm text-foreground/60">Edurack Intern Portal</p>
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              onClick={onSignOut}
              className="clay-chip rounded-2xl px-4 py-2 text-xs font-semibold text-foreground/70"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <Link
                key={t.key}
                to={t.to}
                data-tour={t.key === "profile" ? "nav-profile" : undefined}
                className={`flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                  active ? "clay-btn text-white" : "clay-chip text-foreground/70"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
