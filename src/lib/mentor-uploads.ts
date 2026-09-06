// Shared upload logic for the mentor portal's three upload types.
// Images and files stay on Supabase Storage — unchanged, simple, working.
// Lectures move to S3 multipart upload — chunked, so a dropped connection
// only costs the current ~10MB chunk instead of the whole file, and
// resumable across a tab close/reload, mirroring the old TUS behavior.
import {
  supabase,
  MENTOR_IMAGES_BUCKET,
  MENTOR_FILES_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  MAX_LECTURE_BYTES,
} from "@/lib/supabase";
import {
  initiateMentorMultipartUpload,
  getMentorUploadPartUrls,
  completeMentorMultipartUpload,
  abortMentorMultipartUpload,
} from "@/server-functions/mentor-portal";

export { MAX_IMAGE_BYTES, MAX_FILE_BYTES, MAX_LECTURE_BYTES };

const PART_SIZE = 10 * 1024 * 1024; // 10MB — comfortably above S3's 5MB minimum part size
const RESUME_KEY_PREFIX = "mentor-lecture-upload:";

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function uniquePath(basePath: string, fileName: string) {
  const ext = fileName.split(".").pop() || "bin";
  return `${basePath}-${Date.now()}.${ext}`;
}

// ─── Images & files: unchanged Supabase path ──────────────────────────────
async function simpleSupabaseUpload(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadMentorImage(file: File, basePath: string): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`That image is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_IMAGE_BYTES)}.`);
  }
  return simpleSupabaseUpload(MENTOR_IMAGES_BUCKET, uniquePath(basePath, file.name), file);
}

export async function uploadMentorFile(file: File, basePath: string): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  return simpleSupabaseUpload(MENTOR_FILES_BUCKET, uniquePath(basePath, file.name), file);
}

// ─── Lectures: S3 multipart upload ─────────────────────────────────────────

type ResumeState = {
  key: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  completedParts: { partNumber: number; etag: string }[];
};

// name+size+lastModified is enough to say "same file as last time" without
// hashing the whole thing — the same fingerprint strategy TUS used by
// default. A different file picked -> treated as a fresh upload.
function fingerprint(file: File) {
  return `${RESUME_KEY_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

function loadResumeState(file: File): ResumeState | null {
  try {
    const raw = localStorage.getItem(fingerprint(file));
    if (!raw) return null;
    const state = JSON.parse(raw) as ResumeState;
    if (state.fileName === file.name && state.fileSize === file.size && state.fileLastModified === file.lastModified) {
      return state;
    }
    return null;
  } catch {
    return null;
  }
}

function saveResumeState(file: File, state: ResumeState) {
  try {
    localStorage.setItem(fingerprint(file), JSON.stringify(state));
  } catch {
    // localStorage full/unavailable — resume just won't work this time,
    // not worth failing the upload over.
  }
}

function clearResumeState(file: File) {
  try {
    localStorage.removeItem(fingerprint(file));
  } catch {
    // ignore
  }
}

// NOTE: mentorToken is required here (unlike uploadMentorImage/File above)
// because the S3 presign path goes through authenticated server functions
// instead of a client-side Supabase call. LectureUploadField needs a
// mentorToken prop passed in — ImageUploadField/FileUploadField do NOT,
// since they're staying on Supabase.
export async function uploadMentorLecture(
  mentorToken: string,
  file: File,
  storagePath: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_LECTURE_BYTES) {
    throw new Error(`That video is ${formatBytes(file.size)} — please choose one under ${formatBytes(MAX_LECTURE_BYTES)}.`);
  }

  const totalParts = Math.ceil(file.size / PART_SIZE);

  let state = loadResumeState(file);
  if (!state) {
    const { uploadId, key } = await initiateMentorMultipartUpload({
      data: { token: mentorToken, storagePath, fileName: file.name, contentType: file.type || "video/mp4" },
    });
    state = {
      key,
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      fileLastModified: file.lastModified,
      completedParts: [],
    };
    saveResumeState(file, state);
  }

  const completedPartNumbers = new Set(state.completedParts.map((p) => p.partNumber));
  const remainingPartNumbers = Array.from({ length: totalParts }, (_, i) => i + 1).filter(
    (n) => !completedPartNumbers.has(n),
  );

  function reportProgress() {
    const pct = Math.round((state!.completedParts.length / totalParts) * 100);
    onProgress?.(pct);
  }
  reportProgress();

  const BATCH_SIZE = 5; // fetch presigned URLs a few parts at a time, not all at once
  for (let i = 0; i < remainingPartNumbers.length; i += BATCH_SIZE) {
    const batch = remainingPartNumbers.slice(i, i + BATCH_SIZE);
    const { urls } = await getMentorUploadPartUrls({
      data: { token: mentorToken, key: state.key, uploadId: state.uploadId, partNumbers: batch },
    });

    for (const { partNumber, url } of urls) {
      const start = (partNumber - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const chunk = file.slice(start, end);

      const res = await fetch(url, { method: "PUT", body: chunk });
      if (!res.ok) throw new Error("Upload failed. Check your connection and try again.");

      const etag = res.headers.get("ETag");
      if (!etag) {
        throw new Error(
          "Upload succeeded but the storage server didn't return a confirmation tag — check the bucket's CORS settings (ExposeHeaders must include ETag).",
        );
      }

      state.completedParts.push({ partNumber, etag });
      saveResumeState(file, state);
      reportProgress();
    }
  }

  await completeMentorMultipartUpload({
    data: { token: mentorToken, key: state.key, uploadId: state.uploadId, parts: state.completedParts },
  });

  clearResumeState(file);
  onProgress?.(100);
  return state.key;
}

// Call this if a mentor cancels a lecture upload mid-flight, so S3 doesn't
// hang onto an abandoned multipart session and its uploaded parts.
export async function cancelMentorLectureUpload(mentorToken: string, file: File) {
  const state = loadResumeState(file);
  if (!state) return;
  try {
    await abortMentorMultipartUpload({ data: { token: mentorToken, key: state.key, uploadId: state.uploadId } });
  } finally {
    clearResumeState(file);
  }
}