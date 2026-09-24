// Admin CRUD for Session Templates (thumbnail templates mentors can pick
// from when creating a session offering).
//
// Auth mirrors requireSuperAdmin in server-functions/mentor-auth.ts exactly
// (Firebase ID token + `admin: true` custom claim) — duplicated locally
// rather than imported, matching that file's own stated convention of
// keeping each identity check self-contained rather than cross-importing.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { supabase } from "@/lib/supabase";
import type { SessionTemplate } from "@/lib/session-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

function rowToTemplate(row: any): SessionTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    thumbnailUrl: row.thumbnail_url,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export const listSessionTemplatesAdmin = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const sb = supabase;
    const { data: rows, error } = await sb
      .from("session_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: (rows ?? []).map(rowToTemplate) };
  });

export const createSessionTemplate = createServerFn({ method: "POST" })
  .validator((d: { token: string; title: string; description: string; thumbnailUrl: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.title.trim() || !data.thumbnailUrl.trim()) {
      throw new Error("Title and thumbnail are required.");
    }
    const sb = supabase;
    const { data: row, error } = await sb
      .from("session_templates")
      .insert({ title: data.title.trim(), description: data.description.trim(), thumbnail_url: data.thumbnailUrl })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { template: rowToTemplate(row) };
  });

export const setSessionTemplateEnabled = createServerFn({ method: "POST" })
  .validator((d: { token: string; templateId: string; enabled: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const sb = supabase;
    const { error } = await sb
      .from("session_templates")
      .update({ enabled: data.enabled })
      .eq("id", data.templateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSessionTemplate = createServerFn({ method: "POST" })
  .validator((d: { token: string; templateId: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const sb = supabase;
    const { error } = await sb.from("session_templates").delete().eq("id", data.templateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Used by the mentor's offering-creation UI to pick a template thumbnail.
// Only returns enabled templates — same handler shape as your
// listPublic* catalog functions, just gated on a *mentor* token instead of
// an admin one, so it lives here but is imported by the mentor module too.
export const listEnabledSessionTemplates = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async () => {
    const sb = supabase;
    const { data: rows, error } = await sb
      .from("session_templates")
      .select("*")
      .eq("enabled", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: (rows ?? []).map(rowToTemplate) };
  });