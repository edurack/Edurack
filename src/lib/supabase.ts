// ASSUMPTION FLAGGED: this assumes your project doesn't already have a
// Supabase client set up somewhere else. If it does, delete this file and
// point every file importing from here at your existing one instead.
//
// Setup needed before this works:
//   1. npm install @supabase/supabase-js tus-js-client
//      (tus-js-client is only needed for the lecture-video resumable
//      upload — see mentor-uploads.ts for why.)
//   2. Create a Supabase project at supabase.com (free, no card required)
//   3. In your .env (or .env.local):
//        VITE_SUPABASE_URL=https://your-project.supabase.co
//        VITE_SUPABASE_ANON_KEY=your-anon-public-key
//
// ⚠️ REAL CONSTRAINT, NOT JUST A NOTE: Supabase's Free plan caps individual
// file uploads at 50MB project-wide, regardless of what you set as a
// bucket's own "file size limit". The 100MB (files) and 500MB (lectures)
// caps below need the Pro plan's higher project-level ceiling to actually
// work — on Free, uploads past 50MB will be rejected by Supabase itself
// no matter what this code does. Check Project Settings → Storage in your
// dashboard for your project's current limit before relying on this.
//
// Buckets needed (Storage → create each, set Public, set its own "file
// size limit" to match the cap below — that's the per-bucket backstop;
// the project-level cap above is the one that can't be worked around):
//   • mentor-uploads     (existing — onboarding wizard photos, unchanged)
//   • mentor-images      (profile pictures)              — cap 50MB
//   • mentor-files       (PDF notes)                     — cap 100MB
//   • mentor-lectures    (lecture videos)                — cap 500MB
//   • bundle-thumbnails  (bundle cover images)            — cap 20MB
//   • bundle-documents   (syllabus/planner PDFs)          — cap 50MB
//   • promoter-uploads   (NEW — promoter profile photos)  — cap 20MB
//
// Policies — same open-write-scoped-by-bucket pattern as mentor-uploads,
// since neither admins nor promoters have a Supabase-side user to scope
// RLS to (admins use a Firebase ID token, promoters use the HMAC session
// token from promoter-auth.ts — Supabase Auth is never involved). Run
// once per new bucket, swapping the bucket_id:
//
//   create policy "Admins can upload to bundle-thumbnails"
//   on storage.objects for insert
//   to anon
//   with check (bucket_id = 'bundle-thumbnails');
//
//   create policy "Admins can upload to bundle-documents"
//   on storage.objects for insert
//   to anon
//   with check (bucket_id = 'bundle-documents');
//
//   create policy "Promoters can upload to promoter-uploads"
//   on storage.objects for insert
//   to anon
//   with check (bucket_id = 'promoter-uploads');
//
// (repeat the pattern for mentor-images / mentor-files / mentor-lectures
// if those policies don't already exist from earlier work)
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// ─── Onboarding wizard (existing, unchanged) ─────────────────────────────
export const MENTOR_UPLOADS_BUCKET = "mentor-uploads";

// ─── Mentor portal uploads (existing, unchanged) ─────────────────────────
export const MENTOR_IMAGES_BUCKET = "mentor-images";
export const MENTOR_FILES_BUCKET = "mentor-files";
export const MENTOR_LECTURES_BUCKET = "mentor-lectures";

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_LECTURE_BYTES = 500 * 1024 * 1024; // 500MB

// ─── Admin bundle uploads (thumbnails, syllabus PDFs, planners) ─────────
export const BUNDLE_THUMBNAILS_BUCKET = "bundle-thumbnails";
export const BUNDLE_DOCUMENTS_BUCKET = "bundle-documents";

export const MAX_BUNDLE_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_BUNDLE_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50MB

// ─── NEW: Promoter uploads (profile photos) ──────────────────────────────
// Deliberately its own bucket, not shared with MENTOR_UPLOADS_BUCKET or
// MENTOR_IMAGES_BUCKET — promoters are a separate identity system end to
// end (see promoter-auth.ts), so their storage stays separate too.
export const PROMOTER_UPLOADS_BUCKET = "promoter-uploads";
export const MAX_PROMOTER_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

// Shared helper — uploads a single File to the given bucket under a
// collision-proof generated name, and returns its public URL. Every
// upload field across the admin dashboard, mentor portal, and promoter
// portal goes through this one function so the naming scheme and error
// shape stay identical everywhere.
export async function uploadToSupabase(bucket: string, file: File): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}