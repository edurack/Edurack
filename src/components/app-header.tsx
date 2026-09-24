import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { IconHelpCircle as HelpCircle, IconShoppingBag as ShoppingBag, IconChevronDown as ChevronDown, IconLogout as LogOut, IconHome as Home, IconLifebuoy as LifeBuoy } from "@tabler/icons-react";
import { UserRound } from "lucide-react"; // TODO: no Tabler mapping found yet
import type { User } from "firebase/auth";
import { signOutUser } from "@/lib/firebase";

export function AppHeader({ user, displayName }: { user: User | null; displayName?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if the current page is NOT the dashboard
  const isNotDashboard = location.pathname !== "/dashboard";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    await signOutUser();
    navigate({ to: "/auth" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        
        {/* Left: Branding & Navigation Group */}
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <div className="flex shrink-0 items-center gap-3 font-bold text-foreground">
            <img
              src="https://www.edurack.in/edurack-logo.webp" 
              alt="Edurack Logo"
              className="h-10 w-auto object-contain sm:h-12"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="font-display text-xl font-extrabold tracking-tight">edurack</span>
          </div>

          {/* Home button: only meaningful for a signed-in user with a dashboard to go to. */}
          {user && isNotDashboard && (
            <button
              type="button"
              onClick={() => navigate({ to: "/dashboard" })}
              className="clay-chip flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium text-foreground/80 transition hover:text-foreground sm:px-4"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard Home</span>
            </button>
          )}
        </div>

        {/* Right: Actions & Profile Menu (signed in) or Login/Sign Up (anonymous) */}
        {!user ? (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              search={{ tab: "signin" }}
              className="clay-btn-ghost inline-flex min-h-11 items-center px-4 text-sm sm:px-5"
            >
              Login
            </Link>
            <Link
              to="/auth"
              search={{ tab: "signup" }}
              className="clay-btn inline-flex min-h-11 items-center px-4 text-sm sm:px-5"
            >
              Sign Up
            </Link>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/purchases" })}
              aria-label="My purchases"
              className="clay-btn-ghost flex h-10 w-10 items-center justify-center rounded-full text-foreground/70 transition hover:text-foreground"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="clay flex h-10 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-foreground/80"
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--sky-soft)]">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>

              {menuOpen && (
                <div className="clay shadow-float absolute right-0 top-[calc(100%+0.5rem)] w-56 p-2">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {displayName || user.displayName || "Student"}
                    </p>
                    <p className="truncate text-xs text-foreground/50">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-foreground/10" />

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ to: "/profile" });
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-foreground/5"
                  >
                    <UserRound className="h-4 w-4" />
                    View profile
                  </button>
                  
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ to: "/purchases" });
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-foreground/5"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    My purchases
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ to: "/tickets" });
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-foreground/5"
                  >
                    <LifeBuoy className="h-4 w-4" />
                    My tickets
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ to: "/help" });
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-foreground/5"
                  >
                    <HelpCircle className="h-4 w-4" />
                    Help
                  </button>
                  
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-foreground/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        
      </div>
    </header>
  );
}