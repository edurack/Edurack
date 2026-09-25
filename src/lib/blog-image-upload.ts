// src/lib/blog-image-upload.ts
//
// Own file, own bucket — deliberately not sharing question-image-upload.ts
// even though the compress-then-upload shape is nearly identical. Same
// project convention as promoter-uploads vs mentor-uploads: different
// trust boundary and different consumer (blog readers, not the test
// engine), so it gets its own upload path rather than a shared coupling
// that would need to grow special cases for both callers over time.
import { uploadToSupabase, BLOG_ASSETS_BUCKET } from "@/lib/supabase";

// Blog images render large (hero/cover, full-width body images) — higher
// ceiling than the question-diagram pipeline's 1200px.
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.84;

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compression failed"))), "image/webp", WEBP_QUALITY),
  );
  return new File([blob], "blog-image.webp", { type: "image/webp" });
}

// Cover image and inline body images both go through this — same pipeline,
// same bucket. If cover images ever need a different aspect-ratio crop
// step, that's the point to split them, not before.
export async function uploadBlogImage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  // 1-year cache: uploadToSupabase randomizes the filename, so a given
  // URL's content never changes.
  return uploadToSupabase(BLOG_ASSETS_BUCKET, compressed, 31536000);
}

export function extractImageFromClipboard(e: React.ClipboardEvent): File | null {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
