// Upload helper for the resume/portfolio field on the public /join-intern
// form. Deliberately simple — no image compression pipeline like
// question-image-upload.ts, since a resume is a document, not a diagram:
// we just size/type-check it and hand it to Supabase as-is.
import { uploadToSupabase, INTERN_APPLICATIONS_BUCKET, MAX_INTERN_APPLICATION_FILE_BYTES } from "@/lib/supabase";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

function hasAllowedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Returns the public URL to store on the application. Throws a
// user-readable Error on anything that should stop the upload.
export async function uploadInternApplicationFile(file: File): Promise<string> {
  if (!hasAllowedExtension(file.name)) {
    throw new Error("Please upload a PDF or Word document (.pdf, .doc, .docx).");
  }
  if (file.size > MAX_INTERN_APPLICATION_FILE_BYTES) {
    throw new Error(
      `That file is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_INTERN_APPLICATION_FILE_BYTES)}.`,
    );
  }
  // 1-year cache: uploadToSupabase randomizes the storage path per file,
  // so a given URL's content never changes.
  return uploadToSupabase(INTERN_APPLICATIONS_BUCKET, file, 31536000);
}
