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
//   • mentor-uploads   (existing — onboarding wizard photos, unchanged)
//   • mentor-images    (profile pictures)              — cap 50MB
//   • mentor-files     (PDF notes)                     — cap 100MB
//   • mentor-lectures  (lecture videos)                — cap 500MB
//
// Policies — same open-write-scoped-by-bucket pattern as mentor-uploads,
// since mentors already have their own session-token auth (not Supabase
// Auth), so there's no Supabase-side user to scope RLS to. Run once per
// new bucket, swapping the bucket_id:
//
//   create policy "Mentors can upload to mentor-images"
//   on storage.objects for insert
//   to anon
//   with check (bucket_id = 'mentor-images');
//
// (repeat for mentor-files and mentor-lectures)
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// ─── Onboarding wizard (existing, unchanged) ─────────────────────────────
export const MENTOR_UPLOADS_BUCKET = "mentor-uploads";

// ─── Mentor portal uploads ────────────────────────────────────────────────
export const MENTOR_IMAGES_BUCKET = "mentor-images";
export const MENTOR_FILES_BUCKET = "mentor-files";
export const MENTOR_LECTURES_BUCKET = "mentor-lectures";

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_LECTURE_BYTES = 500 * 1024 * 1024; // 500MB