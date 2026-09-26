// src/components/blog/blog-breadcrumbs.tsx
//
// Breadcrumb trail for a blog post: Home > [Exam] > [Category] > [Post title].
// Two accessibility/SEO details worth calling out:
//   - The current page (post title) is marked aria-current="page" and is
//     not a link — a breadcrumb's last crumb shouldn't link to itself.
//   - The trail is a real <ol> inside <nav aria-label="Breadcrumb">, and
//     the matching BreadcrumbList JSON-LD is emitted separately (see
//     buildBreadcrumbJsonLd) so it can be dropped into the route's head()
//     without rendering the same data twice.

import { Link } from "@tanstack/react-router";
import { IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { EXAM_LABELS } from "@/lib/admin-types";
import type { ExamKey } from "@/lib/admin-types";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { BlogCategory } from "@/lib/blog-types";

const SITE_URL = "https://www.edurack.in";

export type BreadcrumbCrumb =
  | { label: string; kind: "home" }
  | { label: string; kind: "blogFilter"; examKey?: ExamKey; category?: BlogCategory }
  | { label: string; kind: "current" };

// Builds the crumb list for a post given its taxonomy. Kept as a plain
// function (not a component) so both the visual breadcrumb and the
// JSON-LD builder use the exact same trail — one source of truth.
export function buildPostBreadcrumbs(post: {
  title: string;
  examKey: ExamKey | null;
  category: BlogCategory;
}): BreadcrumbCrumb[] {
  const crumbs: BreadcrumbCrumb[] = [{ label: "Home", kind: "home" }];

  if (post.examKey) {
    crumbs.push({ label: EXAM_LABELS[post.examKey], kind: "blogFilter", examKey: post.examKey });
  }

  crumbs.push({ label: BLOG_CATEGORY_LABELS[post.category], kind: "blogFilter", category: post.category });
  crumbs.push({ label: post.title, kind: "current" });

  return crumbs;
}

function crumbUrl(crumb: BreadcrumbCrumb): string {
  if (crumb.kind === "home") return `${SITE_URL}/`;
  if (crumb.kind === "current") return "";
  const params = new URLSearchParams();
  if (crumb.examKey) params.set("examKey", crumb.examKey);
  if (crumb.category) params.set("category", crumb.category);
  const qs = params.toString();
  return `${SITE_URL}/blog${qs ? `?${qs}` : ""}`;
}

export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.kind !== "current" ? { item: crumbUrl(c) } : {}),
    })),
  };
}

export function BlogBreadcrumbs({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground/50">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-foreground/30" aria-hidden="true" />}
              {c.kind === "home" ? (
                <Link to="/" className="truncate hover:text-foreground hover:underline underline-offset-2">
                  {c.label}
                </Link>
              ) : c.kind === "blogFilter" ? (
                <Link
                  to="/blog"
                  search={{ examKey: c.examKey, category: c.category }}
                  className="truncate hover:text-foreground hover:underline underline-offset-2"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="truncate text-foreground/70">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
