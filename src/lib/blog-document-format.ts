// Tiny, dependency-free helpers shared by the admin panel and the public post
// page. Kept apart from blog-document-upload.ts so the public page never pulls
// the Supabase client into its bundle just to print a file size.
export function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentKindLabel(mimeType: string, fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf") return "PDF";
  if (["doc", "docx"].includes(ext)) return "Word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Sheet";
  if (["ppt", "pptx"].includes(ext)) return "Slides";
  if (ext === "zip") return "ZIP";
  return ext ? ext.toUpperCase() : "File";
}
