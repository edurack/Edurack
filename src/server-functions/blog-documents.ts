// src/server-functions/blog-documents.ts
//
// The ONE place a blog document's real file location is ever released.
//
// Flow: a student clicks Download → the browser sends its Firebase ID token →
// we verify it → look the document up on the published post → return a URL
// that is valid for two minutes. Logged-out callers get an error and no URL.
// The public post payload (blog-public.ts) carries document metadata only,
// so there is nothing for a crawler or a curious visitor to copy.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { supabase } from "@/lib/supabase";
import type { BlogDocument } from "@/lib/blog-types";

const SIGNED_URL_SECONDS = 120;

async function resolveDownloadUrl(doc: BlogDocument): Promise<string> {
  if (doc.bucket && doc.path) {
    // Preferred: private bucket + service-role key → short-lived signed URL.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
    if (serviceKey && baseUrl) {
      const admin = createClient(baseUrl, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await admin.storage.from(doc.bucket).createSignedUrl(doc.path, SIGNED_URL_SECONDS, { download: doc.fileName });
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    // Fallback (no service key yet): the public URL. Works only for a public
    // bucket, and is only as private as that bucket — see db/blog-documents-setup.sql.
    const { data } = supabase.storage.from(doc.bucket).getPublicUrl(doc.path, { download: doc.fileName });
    return data.publicUrl;
  }
  if (doc.externalUrl) return doc.externalUrl;
  throw new Error("This document isn't available.");
}

export const getBlogDocumentDownload = createServerFn({ method: "POST" })
  .validator((data: { token: string; slug: string; documentId: string }) => data)
  .handler(async ({ data }) => {
    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(data.token)).uid;
    } catch {
      throw new Error("Please log in to download this file.");
    }

    const db = await getDb();
    // Same "is this post public right now" rule as every other public read.
    const post = await db.collection("blogPosts").findOne(
      { slug: data.slug, status: "published", deletedAt: null },
      { projection: { documents: 1 } },
    );
    const doc = ((post?.documents as BlogDocument[] | undefined) ?? []).find((d) => d.id === data.documentId);
    if (!post || !doc) throw new Error("This document isn't available.");

    const url = await resolveDownloadUrl(doc);

    // Fire-and-forget download log (who/what/when) — never blocks or fails the download.
    db.collection("blogDocumentDownloads")
      .insertOne({ postId: String(post._id), slug: data.slug, documentId: doc.id, title: doc.title, uid, at: new Date() })
      .catch(() => {});

    return { url, fileName: doc.fileName };
  });
