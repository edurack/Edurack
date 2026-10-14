// Run: npx tsx tests/outreach-templates.test.ts
// Guards the template library: unique keys, valid categories, sendable links, renderable messages.
import assert from "node:assert/strict";
import { OUTREACH_TEMPLATES, TEMPLATE_CATEGORIES } from "../src/lib/outreach-templates";
import { outreachEmailHtml, safeUrl } from "../src/lib/growth-emails";

const keys = new Set<string>();
const perCat: Record<string, number> = {};
for (const t of OUTREACH_TEMPLATES) {
  assert.ok(!keys.has(t.key), `duplicate template key: ${t.key}`);
  keys.add(t.key);
  assert.ok(TEMPLATE_CATEGORIES.includes(t.category), `${t.key}: unknown category ${t.category}`);
  perCat[t.category] = (perCat[t.category] ?? 0) + 1;

  const c = t.campaign;
  assert.ok(c.name.trim() && c.subject.trim() && c.message.trim(), `${t.key}: empty name/subject/message`);
  assert.ok(c.assets.length <= 8, `${t.key}: too many assets`);
  for (const a of c.assets) {
    assert.ok(a.label.trim(), `${t.key}: asset without label`);
    assert.ok(safeUrl(a.url), `${t.key}: bad asset url ${a.url}`);
    assert.ok(!/\[|\]/.test(a.url), `${t.key}: placeholder left in an asset URL (it would fail validation when saved)`);
  }
  assert.ok(c.subject.length <= 90, `${t.key}: subject too long for inboxes (${c.subject.length})`);
  const html = outreachEmailHtml({ name: "Aarav", message: c.message.replace(/\{\{name\}\}/g, "Aarav"), assets: c.assets, unsubscribeUrl: "#" });
  assert.ok(html.includes("Aarav") || !c.message.includes("{{name}}"), `${t.key}: name not rendered`);
  assert.ok(!html.includes("{{"), `${t.key}: unreplaced {{ }} in output`);
  assert.equal(t.needsEdit, /\[[^\]]+\]/.test(c.subject + c.message), `${t.key}: needsEdit flag wrong`);
}
for (const cat of TEMPLATE_CATEGORIES) assert.ok((perCat[cat] ?? 0) > 0, `category "${cat}" has no templates`);
console.log(`ok: ${OUTREACH_TEMPLATES.length} templates in ${Object.keys(perCat).length} categories`);
console.log(perCat);
