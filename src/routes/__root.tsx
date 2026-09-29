import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../lib/theme-provider";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
// Fonts are self-hosted via Fontsource instead of the Google Fonts CDN, which
// removes two cross-origin round trips from the critical rendering path.
//
// Requires (run once):
//   npm install @fontsource/bricolage-grotesque @fontsource/plus-jakarta-sans
import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import { AuthProvider } from "../lib/auth-context";

// ─── Site-wide SEO constants ────────────────────────────────────────────────
// One place to change branding/copy. Nothing here is exam-specific on
// purpose — Edurack serves every exam and course, not just one.
const SITE_URL = "https://www.edurack.in"; // must match sitemap + lib/seo.ts
const SITE_NAME = "Edurack";
const SITE_TITLE = "Edurack — Mock Tests, Live Mentors & Batches for Exam Prep";
const SITE_DESCRIPTION =
  "Prepare smarter with Edurack: real exam-style CBT mock tests with deep analytics, 1:1 and group mentorship, live sessions and recorded lectures — all in one platform.";
// Must be an absolute URL and a real file: 1200×630 PNG/JPG placed at
// /public/og-image.png. Social platforms ignore relative image paths.
const OG_IMAGE = `${SITE_URL}/og-image.png`;

// Structured data — lets Google show the site name and understand what
// Edurack is. Organization + WebSite are safe at the root because they
// describe the whole site, not one page.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.ico`,
      description: SITE_DESCRIPTION,
      areaServed: "IN",
      // The full story lives on a real page, not crammed into meta tags —
      // this is what both Google and AI answer engines actually read.
      mainEntityOfPage: `${SITE_URL}/about`,
      // Real, live social profiles (see socialLinks in site-chrome.tsx) —
      // "sameAs" is one of the strongest identity-confirmation signals
      // for both classic SEO and GEO/AI-answer citation, since it lets
      // engines cross-check this Organization against independent
      // profiles instead of trusting the site's own claims alone. Keep
      // this list in sync with site-chrome.tsx if a handle ever changes.
      sameAs: [
        "https://www.linkedin.com/company/edurack",
        "https://youtube.com/@edurack",
        "https://instagram.com/edurack.in",
        "https://x.com/edurack_",
        "https://www.reddit.com/user/Edurack/",
        "https://threads.net/@edurack.in",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en-IN",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

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
      // viewport-fit=cover lets the layout use the full screen on notched
      // phones; initial-scale=1 without a maximum-scale keeps pinch-zoom
      // available, which matters for accessibility and Core Web Vitals audits.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },

      // Core
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "The Edurack Team" },
      { name: "application-name", content: SITE_NAME },
      { name: "apple-mobile-web-app-title", content: SITE_NAME },
      { name: "format-detection", content: "telephone=no" },
      { name: "referrer", content: "strict-origin-when-cross-origin" },

      // Browser UI colour, matched to light/dark
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0b0b0b", media: "(prefers-color-scheme: dark)" },

      // Open Graph (WhatsApp, Facebook, LinkedIn, Telegram, Slack…)
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_IN" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Edurack — mock tests, live mentors and batches for exam prep" },

      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(structuredData),
      },
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
    <html lang="en-IN">
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