// Shared upload logic for the mentor portal's three upload types. Every
// upload always gets a unique, timestamped path (never the same path
// twice) — this is deliberate: it means every upload is a plain INSERT,
// never an upsert, which sidesteps a real Supabase RLS gotcha where
// upsert requires SELECT + UPDATE policies in addition to INSERT (see the
// comment history on the onboarding wizard's uploader for how that one
// actually broke in practice). The tradeoff is that replacing a file
// leaves the old object in the bucket — harmless at this scale, and
// something a cleanup job can address later if it ever matters.
import {
  supabase,
  MENTOR_IMAGES_BUCKET,
  MENTOR_FILES_BUCKET,
  MENTOR_LECTURES_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  MAX_LECTURE_BYTES,
} from "@/lib/supabase";
import type { PreviousUpload } from "tus-js-client";

export { MAX_IMAGE_BYTES, MAX_FILE_BYTES, MAX_LECTURE_BYTES };

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function uniquePath(basePath: string, fileName: string) {
  const ext = fileName.split(".").pop() || "bin";
  return `${basePath}-${Date.now()}.${ext}`;
}

async function simpleUpload(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadMentorImage(file: File, basePath: string): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`That image is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_IMAGE_BYTES)}.`);
  }
  return simpleUpload(MENTOR_IMAGES_BUCKET, uniquePath(basePath, file.name), file);
}

export async function uploadMentorFile(file: File, basePath: string): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  return simpleUpload(MENTOR_FILES_BUCKET, uniquePath(basePath, file.name), file);
}

// Lectures use TUS resumable upload instead of a single PUT. A plain
// upload of a several-hundred-MB file is fragile over a real connection —
// one dropped packet and the whole thing fails and restarts from zero.
// TUS uploads in ~6MB chunks (Supabase's chunk-size requirement), can
// resume from where it left off after a network blip, and reports real
// progress instead of a spinner that sits still for minutes.
export async function uploadMentorLecture(
  file: File,
  basePath: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_LECTURE_BYTES) {
    throw new Error(`That video is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_LECTURE_BYTES)}.`);
  }

  // NOTE: if this next line itself errors ("Cannot find module
  // 'tus-js-client'"), that's the real problem — run
  // `npm install tus-js-client` and restart your TS server. Everything
  // below assumes that import succeeds; without it, `Upload` silently
  // becomes `any` and every callback parameter in this function loses its
  // type, which shows up as a confusing scatter of "implicitly has an
  // 'any' type" errors on unrelated-looking parameter names instead of one
  // clear "module not found" error.
  const { Upload } = await import("tus-js-client");
  const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const path = uniquePath(basePath, file.name);

  return new Promise<string>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${anonKey}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: MENTOR_LECTURES_BUCKET,
        objectName: path,
        contentType: file.type || "video/mp4",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // Supabase's resumable endpoint requires <= 6MB chunks
      onError: (error: Error) => reject(error),
      onProgress: (bytesUploaded: number, bytesTotal: number) => {
        onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(MENTOR_LECTURES_BUCKET).getPublicUrl(path);
        resolve(data.publicUrl);
      },
    });

    // If this exact file was mid-upload when the tab closed/refreshed,
    // resume instead of starting over from 0%.
    upload.findPreviousUploads().then((previous: PreviousUpload[]) => {
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}