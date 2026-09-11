import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../lib/theme-provider";
import { useTheme } from "@/lib/theme-provider";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
// FIX (render-blocking request, ~670ms + a full DNS/connect/download hop to
// fonts.googleapis.com / fonts.gstatic.com): fonts are now self-hosted via
// Fontsource instead of the Google Fonts CDN. This removes two entire
// cross-origin round trips from the critical path shown in the network
// dependency tree — the browser now only has to fetch your own origin.
//
// Requires (run these once):
//   npm install @fontsource/bricolage-grotesque @fontsource/plus-jakarta-sans
//
// These imports only pull in the specific weights you were requesting from
// Google Fonts (Bricolage Grotesque: 500/600/700/800, Plus Jakarta Sans:
// 400/500/600/700), so you're not shipping unused weights.
import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Edurack — NEET CBT Prep with a 1:1 NTA Replica Engine" },
      { name: "description", content: "Practice NEET on an exact 1:1 replica of the NTA CBT test engine. Smart dashboards, dual mentor ecosystem, and deep analytics — built for droppers, 11th and 12th aspirants." },
      { name: "author", content: "The Edurack Team" },
      { property: "og:title", content: "Edurack — NEET CBT Prep" },
      { property: "og:description", content: "Practice NEET on an exact 1:1 replica of the NTA CBT test engine before exam day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // FIX: dropped the fonts.googleapis.com stylesheet link and the two
    // preconnect hints that went with it — they're no longer needed now
    // that fonts are self-hosted and pulled in via the imports above,
    // which get bundled with the rest of your CSS instead of requiring
    // separate cross-origin requests.
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeInitScript = `(function(){try{var s=localStorage.getItem('edurackin-theme');var t=(s==='light'||s==='dark')?s:'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.classList.toggle('dark',r==='dark');document.documentElement.style.colorScheme=r;}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}