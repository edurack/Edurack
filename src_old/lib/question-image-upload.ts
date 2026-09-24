import { uploadToSupabase, QUESTION_ASSETS_BUCKET } from "@/lib/supabase";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 0.82;
const SVG_MIME = "image/svg+xml";

// SVGs go through this pipeline as raw vector markup and come out the
// other end as a flat raster (webp) — same as any pasted screenshot. This
// is deliberate: every consumer (this ingestion form, the admin/intern
// preview renderers, and the live test/result/analysis pages) just
// displays whatever URL ends up stored on the question, so converting
// once here — rather than teaching every renderer to special-case SVG —
// is what keeps a vector diagram from being re-parsed and repainted by
// the browser on every single page it shows up on.
async function compressImage(file: File): Promise<File> {
  if (isSvgFile(file)) return rasterizeSvg(file);

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

function isSvgFile(file: File): boolean {
  return file.type === SVG_MIME || file.name.toLowerCase().endsWith(".svg");
}

// Renders SVG markup onto a canvas and exports it as a webp File, the same
// shape compressImage() produces for a raster image, so it's a drop-in
// replacement downstream.
async function rasterizeSvg(file: File): Promise<File> {
  const rawMarkup = await file.text();
  const { width, height, hasExplicitSize } = svgIntrinsicSize(rawMarkup);
  // Browsers rasterize an unsized SVG (no width/height, no viewBox) at a
  // tiny fixed default — stamp explicit dimensions on before rendering so
  // it comes out crisp instead of upscaled-blurry. Skip this when the
  // markup already declares a size, since an XML document can't have a
  // duplicate attribute without failing to parse.
  const markup = hasExplicitSize ? rawMarkup : ensureSvgHasExplicitSize(rawMarkup, width, height);

  const objectUrl = URL.createObjectURL(new Blob([markup], { type: SVG_MIME }));
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    // SVGs are transparent by default — flatten onto white first so a
    // diagram with no background doesn't turn into a solid black square
    // once it's a flat raster.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("SVG conversion failed"))), "image/webp", WEBP_QUALITY),
    );
    return new File([blob], "diagram.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load SVG for conversion"));
    img.src = src;
  });
}

const SVG_FALLBACK_RENDER_WIDTH = 1000;

// Explicit width/height on the <svg> tag if present, else derived from
// viewBox (scaled up so small diagrams still rasterize sharply), else a
// generic fallback size.
function svgIntrinsicSize(markup: string): { width: number; height: number; hasExplicitSize: boolean } {
  const svgTag = /<svg\b[^>]*>/i.exec(markup)?.[0] ?? "";

  const widthAttr = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(svgTag);
  const heightAttr = /\bheight\s*=\s*["']?([\d.]+)/i.exec(svgTag);
  if (widthAttr && heightAttr) {
    return { width: parseFloat(widthAttr[1]), height: parseFloat(heightAttr[1]), hasExplicitSize: true };
  }

  const viewBoxAttr = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(svgTag);
  if (viewBoxAttr) {
    const parts = viewBoxAttr[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const [, , vbWidth, vbHeight] = parts;
      const scale = SVG_FALLBACK_RENDER_WIDTH / vbWidth;
      return { width: SVG_FALLBACK_RENDER_WIDTH, height: Math.round(vbHeight * scale), hasExplicitSize: false };
    }
  }

  return { width: SVG_FALLBACK_RENDER_WIDTH, height: Math.round(SVG_FALLBACK_RENDER_WIDTH * 0.6), hasExplicitSize: false };
}

function ensureSvgHasExplicitSize(markup: string, width: number, height: number): string {
  return markup.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
}

export async function uploadQuestionImage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  // 1-year cache: filenames are randomized in uploadToSupabase, so a given
  // URL's content never changes — safe to cache indefinitely.
  return uploadToSupabase(QUESTION_ASSETS_BUCKET, compressed, 31536000);
}

function extractSvgMarkup(text: string): string | null {
  return /<svg[\s\S]*?<\/svg\s*>/i.exec(text)?.[0] ?? null;
}

export function extractImageFromClipboard(e: React.ClipboardEvent): File | null {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  // No image file on the clipboard — but a lot of diagram/whiteboard
  // tools (and anything copied out of an SVG code editor or an AI chat)
  // put raw <svg>…</svg> markup on the clipboard as plain text rather
  // than an image file. Catch that here too, so it goes through the same
  // upload-and-rasterize pipeline instead of landing as literal XML text
  // in the question body.
  const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text/html");
  const svgMarkup = text ? extractSvgMarkup(text) : null;
  if (svgMarkup) return new File([svgMarkup], "diagram.svg", { type: SVG_MIME });
  return null;
}