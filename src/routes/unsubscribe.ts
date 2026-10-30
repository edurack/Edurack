// GET  /unsubscribe?u&k&t → confirmation page (so mail scanners that prefetch links can't opt people out)
// POST /unsubscribe       → records the opt-out on profiles.emailOptOut.<kind>
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { esc } from "@/lib/growth-emails";

const page = (title: string, inner: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#F5F7FB;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;border:1px solid #E4E9F1;border-radius:24px;padding:32px;max-width:420px;text-align:center;color:#1F2333">${inner}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const LABEL = { streak: "streak reminder", marketing: "Edurack update", nudges: "practice nudge" } as const;

export const Route = createFileRoute("/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const [u, k, t] = [q.get("u") ?? "", q.get("k") ?? "", q.get("t") ?? ""];
        if (!u || !verifyUnsubscribe(u, k, t)) return page("Invalid link", "<h2>This link isn't valid</h2><p>Open it from the email again.</p>", 400);
        return page(
          "Unsubscribe",
          `<h2>Stop ${LABEL[k as keyof typeof LABEL]} emails?</h2>
           <form method="POST"><input type="hidden" name="u" value="${esc(u)}"><input type="hidden" name="k" value="${esc(k)}"><input type="hidden" name="t" value="${esc(t)}">
           <button style="background:#4F8FE0;color:#fff;border:0;border-radius:999px;padding:12px 28px;font-weight:700;font-size:15px;cursor:pointer">Yes, unsubscribe me</button></form>`,
        );
      },
      POST: async ({ request }) => {
        const form = await request.formData();
        const [u, k, t] = [String(form.get("u") ?? ""), String(form.get("k") ?? ""), String(form.get("t") ?? "")];
        if (!u || !verifyUnsubscribe(u, k, t)) return page("Invalid link", "<h2>This link isn't valid</h2>", 400);
        const db = await getDb();
        await db.collection("profiles").updateOne({ uid: u }, { $set: { [`emailOptOut.${k}`]: true, "emailOptOut.updatedAt": new Date() } });
        return page("Unsubscribed", `<h2>Done ✓</h2><p>You won't get ${LABEL[k as keyof typeof LABEL]} emails any more.</p>`);
      },
    },
  },
});
