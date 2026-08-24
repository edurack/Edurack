// ASSUMPTION FLAGGED: this assumes your project doesn't already have a
// Supabase client set up somewhere else. If it does, delete this file and
// point mentor-onboarding.$applicationId.tsx's import at your existing one
// instead.
//
// Setup needed before this works:
//   1. npm install @supabase/supabase-js
//   2. Create a Supabase project at supabase.com (free, no card required)
//   3. In your .env (or .env.local): 
//        VITE_SUPABASE_URL=https://your-project.supabase.co
//        VITE_SUPABASE_ANON_KEY=your-anon-public-key
//      (both are safe to expose client-side — the anon key is designed
//      for this, access is controlled by Storage policies, not secrecy)
//   4. In the Supabase dashboard → Storage → create a bucket named
//      "mentor-uploads", set it to Public, and cap "file size limit" at
//      5 MB (the stricter 1MB profile-photo cap is already enforced
//      client-side before upload; this bucket-level limit is the
//      can't-be-bypassed server-side backstop for the larger cap).
//   5. Storage → Policies → allow public/anon INSERT on this bucket, e.g.:
//
//        create policy "Public can upload mentor onboarding images"
//        on storage.objects for insert
//        to anon
//        with check (bucket_id = 'mentor-uploads');
//
//      This is intentionally open-write since mentors uploading here don't
//      have a platform account yet (same reasoning as the rest of this
//      onboarding flow being unauthenticated). If you want tighter control,
//      scope the policy to paths starting with a valid applicationId
//      instead of allowing any path.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export const MENTOR_UPLOADS_BUCKET = "mentor-uploads";