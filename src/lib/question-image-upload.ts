import { uploadToSupabase, QUESTION_ASSETS_BUCKET } from "@/lib/supabase";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 0.82;

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
  return new File([blob], "diagram.webp", { type: "image/webp" });
}

export async function uploadQuestionImage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  // 1-year cache: filenames are randomized in uploadToSupabase, so a given
  // URL's content never changes — safe to cache indefinitely.
  return uploadToSupabase(QUESTION_ASSETS_BUCKET, compressed, 31536000);
}

export function extractImageFromClipboard(e: React.ClipboardEvent): File | null {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}