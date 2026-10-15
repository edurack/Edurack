// "Most repeated topics" for /neet/most-repeated-topics, from the same tagged dataset as the weightage pages.
import { getSubjects, type Chapter, type Topic } from "@/lib/neet-blueprint";

export type RepeatedTopic = Topic & { chapter: Chapter };

export const TOPICS_PATH = "/neet/most-repeated-topics";

export function topicsBySubject(limit = 25): { key: string; name: string; topics: RepeatedTopic[] }[] {
  return getSubjects().map((s) => ({
    key: s.key,
    name: s.name,
    topics: s.chapters
      .flatMap((c) => c.topics.map((t) => ({ ...t, chapter: c })))
      .sort((a, b) => b.total - a.total || b.papers - a.papers)
      .slice(0, limit),
  }));
}

export function overallTopics(limit = 30): RepeatedTopic[] {
  return getSubjects()
    .flatMap((s) => s.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, chapter: c }))))
    .sort((a, b) => b.total - a.total || b.papers - a.papers)
    .slice(0, limit);
}

/** Topics asked in 5 or more of the 8 papers: the "every year" ones. */
export function everyYearTopics(): RepeatedTopic[] {
  return getSubjects()
    .flatMap((s) => s.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, chapter: c }))))
    .filter((t) => t.papers >= 5)
    .sort((a, b) => b.papers - a.papers || b.total - a.total);
}
