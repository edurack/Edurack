// Admin-side upload for the Free Resources library. Goes straight from the browser to the
// private "free-resources" Supabase bucket (same approach as blog-document-upload.ts).
import { supabase, FREE_RESOURCES_BUCKET } from "@/lib/supabase";
import { MAX_RESOURCE_BYTES, RESOURCE_ALLOWED_EXTENSIONS } from "@/lib/resource-types";
import { formatFileSize } from "@/lib/blog-document-format";

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
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export type UploadedResourceFile = { fileName: string; mimeType: string; sizeBytes: number; path: string; suggestedTitle: string };

const extOf = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "");
const baseOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^\w\- ()]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "resource";

export async function uploadResourceFile(file: File): Promise<UploadedResourceFile> {
  const ext = extOf(file.name);
  if (!RESOURCE_ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`.${ext || "?"} files aren't supported. Use: ${RESOURCE_ALLOWED_EXTENSIONS.map((e) => "." + e).join(", ")}.`);
  }
  if (file.size > MAX_RESOURCE_BYTES) {
    throw new Error(`That file is ${formatFileSize(file.size)} — the limit is ${formatFileSize(MAX_RESOURCE_BYTES)}.`);
  }
  const base = baseOf(file.name);
  // Random prefix so the object path can't be guessed and two same-named uploads never collide.
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}/${base.replace(/ /g, "-")}.${ext}`;
  const mimeType = file.type || MIME_BY_EXT[ext] || "application/octet-stream";

  const { error } = await supabase.storage.from(FREE_RESOURCES_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: mimeType });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("bucket not found")) throw new Error(`Bucket "${FREE_RESOURCES_BUCKET}" doesn't exist yet — create it in Supabase (private). See db/free-resources-setup.sql.`);
    if (msg.includes("row-level security") || msg.includes("violates")) throw new Error(`Supabase refused the upload — add the insert policy for "${FREE_RESOURCES_BUCKET}" (see db/free-resources-setup.sql).`);
    throw error;
  }
  return { fileName: `${base}.${ext}`, mimeType, sizeBytes: file.size, path, suggestedTitle: base.replace(/[-_]+/g, " ") };
}
