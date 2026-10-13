// scripts/neet-blogs/seed.mjs
//
// Loads generated/neet-blog-posts.json into the `blogPosts` collection (db "Edurack"),
// using the same document shape as createBlogPost in server-functions/blog-admin.ts.
//
//   node --env-file=.env scripts/neet-blogs/seed.mjs                 # dry run: shows what would be inserted
//   node --env-file=.env scripts/neet-blogs/seed.mjs --write         # insert as DRAFTS (safe default)
//   node --env-file=.env scripts/neet-blogs/seed.mjs --write --only=year      # year | hub | subject | chapter
//   node --env-file=.env scripts/neet-blogs/seed.mjs --write --cover=https://… --cover-alt="NEET PYQ analysis" --publish
//
// Posts whose slug already exists are skipped, never overwritten. Publishing needs a cover image
// (same rule as the admin "Publish" button), so --publish requires --cover and --cover-alt.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import { MongoClient } from "mongodb";

// Some ISPs fail MongoDB Atlas SRV lookups (querySrv ECONNREFUSED). src/lib/mongo.ts uses the
// same workaround in development. Pass --no-dns-fix to skip it.
if (!process.argv.includes("--no-dns-fix")) dns.setServers(["8.8.8.8", "1.1.1.1"]);

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split(/=(.*)/s); return [k, v ?? true]; }));
const write = Boolean(args.write);
const publish = Boolean(args.publish);
if (publish && (!args.cover || !args["cover-alt"])) throw new Error("--publish needs --cover=<url> and --cover-alt=<text> (a post can't be published without a cover image).");

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../generated/neet-blog-posts.json");
let posts = JSON.parse(readFileSync(file, "utf8"));

const kind = (p) => (/-question-paper-chapter-wise-analysis$/.test(p.slug) ? "year" : p.slug.includes("all-subjects") ? "hub" : /-pyq-analysis-2020-2026$/.test(p.slug) ? "subject" : "chapter");
if (args.only) posts = posts.filter((p) => kind(p) === args.only);

const WORDS_PER_MINUTE = 200;
const readingTime = (md) => Math.max(1, Math.round(md.replace(/[|#>*:`\-]/g, " ").split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE));

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set (run with node --env-file=.env).");
const client = new MongoClient(uri);
try {
  await client.connect();
  const col = client.db("Edurack").collection("blogPosts");
  const existing = new Set((await col.find({ slug: { $in: posts.map((p) => p.slug) } }, { projection: { slug: 1 } }).toArray()).map((d) => d.slug));
  const fresh = posts.filter((p) => !existing.has(p.slug));
  console.log(`${posts.length} selected, ${existing.size} already exist (skipped), ${fresh.length} new.`);
  if (!write) { console.log("Dry run. Add --write to insert. Examples:\n" + fresh.slice(0, 5).map((p) => `  [${kind(p)}] ${p.slug}`).join("\n")); }
  else if (fresh.length) {
    const now = new Date();
    const docs = fresh.map(({ _meta, ...p }) => ({
      ...p,
      ...(args.cover ? { coverImageUrl: String(args.cover), coverImageAlt: String(args["cover-alt"] ?? "") } : {}),
      status: publish ? "published" : "draft",
      readingTimeMinutes: readingTime(p.bodyMarkdown),
      viewCount: 0,
      publishAt: null,
      publishedAt: publish ? now : null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    const r = await col.insertMany(docs);
    console.log(`Inserted ${r.insertedCount} ${publish ? "published posts" : "drafts"}.`);
  }
} finally {
  await client.close();
}
