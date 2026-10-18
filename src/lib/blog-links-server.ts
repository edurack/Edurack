// SERVER-ONLY. Internal links for a blog post's right-hand rail:
//   • the NEET chapter pages the post is about, and
//   • the most repeated NEET topics (each links to its chapter page).
// Both come from the NEET blueprint dataset, which stays on the server so it never
// ships in the blog's browser bundle. Pure functions: no DB, no request.
import type { BlogCategory } from "@/lib/blog-types";
import type { SidebarChapter, SidebarTopic } from "@/lib/blog-types";
import { getSubjects, topicLabel } from "@/lib/neet-blueprint";
import { topicsBySubject } from "@/lib/neet-topics";

export const MAX_POST_CHAPTERS = 3;
const TOPICS_PER_SUBJECT = 2;

/** Same rule the sidebar uses to decide whether to show its NEET block. */
export function isNeetRelevant(post: { category: BlogCategory; examKey?: string | null }): boolean {
  return (
    post.examKey === "neet" ||
    post.category === "neetStrategy" ||
    (!post.examKey && !["jeeStrategy", "cuetStrategy", "ipmatStrategy"].includes(post.category))
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const headOf = (name: string) => name.split(/[:(]/)[0].trim();

/**
 * Which NEET chapters a post is about, judged from its title and tags only (the
 * parts an editor chose on purpose). A chapter matches when its name — or the part
 * before a colon/bracket — appears as whole words. To keep false positives out:
 *  • a one-word chapter ("Waves", "Atoms") also needs its subject named in the
 *    title/tags, or an exact tag;
 *  • a name that exists in two subjects ("Thermodynamics", "Biomolecules") needs
 *    its subject named too.
 * Longest (most specific) matches win; at most MAX_POST_CHAPTERS are returned.
 */
export function chaptersForPost(title: string, tags: string[]): SidebarChapter[] {
  const text = ` ${norm(title)} | ${tags.map(norm).join(" | ")} `;
  const has = (phrase: string) => phrase.length > 0 && text.includes(` ${phrase} `);
  const tagSet = new Set(tags.map(norm));

  const all = getSubjects().flatMap((s) => s.chapters);
  const subjectsByPhrase = new Map<string, Set<string>>();
  for (const c of all) {
    for (const p of new Set([norm(c.name), norm(headOf(c.name))])) {
      if (!subjectsByPhrase.has(p)) subjectsByPhrase.set(p, new Set());
      subjectsByPhrase.get(p)!.add(c.subjectKey);
    }
  }

  const hits = new Map<string, { chapter: SidebarChapter; score: number }>();
  for (const c of all) {
    const subjectNamed = has(norm(c.subjectName));
    for (const p of new Set([norm(c.name), norm(headOf(c.name))])) {
      if (p.length < 4 || !has(p)) continue;
      const oneWord = !p.includes(" ");
      const crossSubject = (subjectsByPhrase.get(p)?.size ?? 0) > 1;
      const ok = oneWord ? tagSet.has(p) || subjectNamed : crossSubject ? subjectNamed : true;
      if (!ok) continue;
      const key = `${c.subjectKey}/${c.slug}`;
      const prev = hits.get(key);
      if (!prev || p.length > prev.score) {
        hits.set(key, { chapter: { subjectKey: c.subjectKey, slug: c.slug, name: c.name, subjectName: c.subjectName }, score: p.length });
      }
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, MAX_POST_CHAPTERS).map((h) => h.chapter);
}

/** The most repeated topics, a couple per subject so all four subjects are linked. */
export function repeatedTopicLinks(): SidebarTopic[] {
  return topicsBySubject(TOPICS_PER_SUBJECT).flatMap((s) =>
    s.topics.map((t) => ({
      name: topicLabel(t.name, 60),
      chapterName: t.chapter.name,
      subjectKey: t.chapter.subjectKey,
      slug: t.chapter.slug,
      papers: t.papers,
      total: t.total,
    })),
  );
}

/** Everything the blog sidebar needs from the blueprint; empty for posts that aren't about NEET. */
export function neetLinksForPost(post: { title: string; tags: string[]; category: BlogCategory; examKey?: string | null }) {
  if (!isNeetRelevant(post)) return { chapters: [] as SidebarChapter[], topics: [] as SidebarTopic[] };
  return { chapters: chaptersForPost(post.title, post.tags), topics: repeatedTopicLinks() };
}
