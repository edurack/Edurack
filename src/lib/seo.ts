// src/lib/seo.ts
//
// One place that builds every page's <head>. Each route calls pageHead()
// (public, indexable pages) or noindexHead() (logged-in / private pages)
// with its OWN title, description and path — so no two pages share the
// same title, description or canonical.
//
// SITE_URL must match the host in sitemap[.]xml.ts and blog/$slug.tsx.

export const SITE_URL = "https://www.edurack.in";
export const SITE_NAME = "Edurack";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`; // 1200×630, put in /public

const BRAND_SUFFIX = " · Edurack";

// Keep <title> under ~60 chars and the description under ~160, or Google
// truncates them in results.
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function absolute(url: string | null | undefined): string {
  if (!url) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export type PageSeo = {
  /** Page-specific title WITHOUT the brand — the brand is appended. */
  title: string;
  description: string;
  /** Path only, e.g. "/contact" or "/mentor-profile/abc". Used for canonical + og:url. */
  path: string;
  image?: string | null;
  type?: "website" | "article" | "profile";
  /** Skip the " · Edurack" suffix (homepage uses a full custom title). */
  rawTitle?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function pageHead(seo: PageSeo): { meta: any[]; links: any[]; scripts: any[] } {
  const title = seo.rawTitle ? seo.title : truncate(seo.title, 52) + BRAND_SUFFIX;
  const description = truncate(seo.description, 160);
  const url = `${SITE_URL}${seo.path}`;
  const image = absolute(seo.image);
  const ld = seo.jsonLd ? (Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd]) : [];

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:type", content: seo.type ?? "website" },
      { property: "og:url", content: url },
      { property: "og:title", content: seo.title },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      { name: "twitter:title", content: seo.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: ld.map((obj) => ({ type: "application/ld+json", children: JSON.stringify(obj) })),
  };
}

// For pages behind a login or that are per-user / per-attempt: a distinct
// browser-tab title (so tabs and history aren't all the marketing title)
// and a noindex so they never appear in search.
export function noindexHead(title: string, description?: string): { meta: any[] } {
  return {
    meta: [
      { title: title + BRAND_SUFFIX },
      ...(description ? [{ name: "description", content: description }] : []),
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
