// Admin → Content → JEE Resources. Every handler starts with requireTeamAdmin(token), so a student (or a
// logged-out visitor) calling these directly gets "Forbidden" and nothing is read or changed.
import { createServerFn } from "@tanstack/react-start";
import { logAdminAction, requireTeamAdmin } from "@/lib/team-core";
import { adminFileUrl, adminList, createResource, createUploadTarget, deleteResource, setPublished, updateResource } from "@/lib/jee-resource-core";
import type { JeeAdminFilters, JeeAdminList, JeeResourceInput } from "@/lib/jee-resource-types";

const MODULE = "JEE Resources";

export const adminJeeListResources = createServerFn({ method: "POST" })
  .validator((data: { token: string; filters: JeeAdminFilters }) => data)
  .handler(async ({ data }): Promise<JeeAdminList> => {
    await requireTeamAdmin(data.token);
    return adminList(data.filters ?? {});
  });

/** Step 1 of an upload: validates the file's name/size/type and returns a one-time signed upload URL. */
export const adminJeeCreateUpload = createServerFn({ method: "POST" })
  .validator((data: { token: string; fileName: string; sizeBytes: number; mimeType: string }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    return createUploadTarget({ fileName: String(data.fileName ?? ""), sizeBytes: Number(data.sizeBytes) || 0, mimeType: String(data.mimeType ?? "") });
  });

/** Create (no id) or edit (id) a resource. An edit that carries a new filePath replaces the PDF in place. */
export const adminJeeSaveResource = createServerFn({ method: "POST" })
  .validator((data: { token: string; id?: string; input: JeeResourceInput }) => data)
  .handler(async ({ data }) => {
    const admin = await requireTeamAdmin(data.token);
    const meta = { title: data.input?.title, subject: data.input?.subjectKey, chapter: data.input?.chapterSlug, type: data.input?.type };
    if (data.id) {
      await logAdminAction(data.token, "updateJeeResource", { id: data.id, ...meta, replacedFile: !!data.input?.filePath }, MODULE);
      const r = await updateResource(data.id, data.input);
      return { id: data.id, replaced: r.replaced };
    }
    await logAdminAction(data.token, "createJeeResource", meta, MODULE);
    const r = await createResource(data.input, admin.uid);
    return { id: r.id, replaced: false };
  });

export const adminJeeSetPublished = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; published: boolean }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "setJeeResourcePublished", { id: data.id, published: !!data.published }, MODULE);
    await setPublished(data.id, !!data.published);
    return { ok: true };
  });

export const adminJeeDeleteResource = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "deleteJeeResource", { id: data.id }, MODULE);
    await deleteResource(data.id);
    return { ok: true };
  });

/** Short-lived link so an admin can preview any resource (draft or published). Not counted as a student view. */
export const adminJeeFileUrl = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    return adminFileUrl(data.id);
  });
