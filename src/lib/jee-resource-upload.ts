// src/lib/jee-resource-upload.ts — browser side of an admin PDF upload.
//
// Flow: validate (name, size, type, "%PDF-" header) → ask the server for a one-time signed upload URL
// (admin-only) → PUT the file straight to private storage with a progress bar. The PDF is never opened,
// parsed or modified.
import { supabase } from "@/lib/supabase";
import { adminJeeCreateUpload } from "@/server-functions/jee-resources-admin";
import { JEE_RESOURCES_BUCKET, JEE_PDF_MIME, hasPdfMagic, validatePdfMeta } from "@/lib/jee-resource-types";

export type JeeUploaded = { path: string; fileName: string; sizeBytes: number };

/** Returns an error message, or null when the file looks like a real, acceptable PDF. */
export async function validateJeePdf(file: File): Promise<string | null> {
  const meta = validatePdfMeta(file);
  if (meta) return meta;
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (!hasPdfMagic(head)) return "That file has a .pdf name but isn't a valid PDF. Export it again and retry.";
  } catch {
    return "Couldn't read that file. Please try again.";
  }
  return null;
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file); // storage's signed-upload endpoint expects the file under an empty field name
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (anon) {
      xhr.setRequestHeader("apikey", anon);
      xhr.setRequestHeader("Authorization", `Bearer ${anon}`);
    }
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(body);
  });
}

export async function uploadJeePdf(file: File, adminToken: string, onProgress: (pct: number) => void): Promise<JeeUploaded> {
  const bad = await validateJeePdf(file);
  if (bad) throw new Error(bad);
  const target = await adminJeeCreateUpload({ data: { token: adminToken, fileName: file.name, sizeBytes: file.size, mimeType: file.type || JEE_PDF_MIME } });
  onProgress(0);
  try {
    await putWithProgress(target.signedUrl, file, onProgress);
  } catch {
    // Fallback: the storage SDK's own signed upload (no progress bar, but the same one-time token).
    onProgress(0);
    const { error } = await supabase.storage.from(JEE_RESOURCES_BUCKET).uploadToSignedUrl(target.path, target.token, file, { contentType: JEE_PDF_MIME });
    if (error) throw new Error("The upload failed. Check your connection and try again.");
  }
  onProgress(100);
  return { path: target.path, fileName: file.name, sizeBytes: file.size };
}
