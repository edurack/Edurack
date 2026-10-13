// src/lib/blog-document-upload.ts
//
// Admin-side helpers for attaching downloadable files to a blog post.
// Own file (like blog-image-upload.ts): different bucket, different rules —
// documents are NOT compressed or re-encoded, and the bucket is private.
import { supabase, BLOG_DOCUMENTS_BUCKET, MAX_BLOG_DOCUMENT_BYTES } from "@/lib/supabase";
import type { BlogDocument } from "@/lib/blog-types";
import { formatFileSize } from "@/lib/blog-document-format";

export { formatFileSize };

const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip"];

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
};

export function newDocumentId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function extOf(name: string): string {
  return name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
}

function cleanBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[^\w\- ()]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "document";
}

/** Uploads one file to the private blog-documents bucket and returns the record to attach to the post. */
export async function uploadBlogDocument(file: File): Promise<BlogDocument> {
  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`.${ext || "?"} files aren't supported here. Use: ${ALLOWED_EXTENSIONS.map((e) => "." + e).join(", ")}.`);
  }
  if (file.size > MAX_BLOG_DOCUMENT_BYTES) {
    throw new Error(`That file is ${formatFileSize(file.size)} — the limit is ${formatFileSize(MAX_BLOG_DOCUMENT_BYTES)}.`);
  }

  const base = cleanBaseName(file.name);
  // Random prefix: two uploads with the same name never collide, and the object
  // path can't be guessed from the file name.
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}/${base.replace(/ /g, "-")}.${ext}`;
  const mimeType = file.type || MIME_BY_EXT[ext] || "application/octet-stream";

  const { error } = await supabase.storage.from(BLOG_DOCUMENTS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: mimeType,
  });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("bucket not found")) {
      throw new Error(`Bucket "${BLOG_DOCUMENTS_BUCKET}" doesn't exist yet — create it in Supabase (private) first. See db/blog-documents-setup.sql.`);
    }
    if (msg.includes("row-level security") || msg.includes("violates")) {
      throw new Error(`Supabase refused the upload — add the insert policy for "${BLOG_DOCUMENTS_BUCKET}" (see db/blog-documents-setup.sql).`);
    }
    throw error;
  }

  return {
    id: newDocumentId(),
    title: base,
    description: "",
    fileName: `${base}.${ext}`,
    mimeType,
    sizeBytes: file.size,
    bucket: BLOG_DOCUMENTS_BUCKET,
    path,
    externalUrl: null,
  };
}

/**
 * For a file that's ALREADY in Supabase: recognises its storage URL
 * (…/storage/v1/object/public|sign|authenticated/<bucket>/<path>) and keeps
 * only bucket + path, so the permanent link isn't stored or exposed.
 * Any other https:// link is kept as an external URL.
 */
export function documentFromExistingUrl(rawUrl: string, title?: string): BlogDocument {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// links can be attached.");

  const fileFromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "") || "document";
  const ext = extOf(fileFromPath);
  const base = cleanBaseName(fileFromPath);
  const m = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);

  return {
    id: newDocumentId(),
    title: (title ?? "").trim() || base,
    description: "",
    fileName: ext ? `${base}.${ext}` : base,
    mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream",
    sizeBytes: 0,
    bucket: m ? decodeURIComponent(m[1]) : null,
    path: m ? decodeURIComponent(m[2]) : null,
    externalUrl: m ? null : url.toString(),
  };
}
