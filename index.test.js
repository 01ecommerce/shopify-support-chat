import { test } from "node:test";
import assert from "node:assert/strict";
import { supportChatScript, supportChatTag, escapeForInlineScript } from "./index.js";

const base = { widgetId: "abc123", app: "reviews", shop: "demo.myshopify.com", merchantName: "Demo Co" };

test("no widget id, no bubble", () => {
  assert.equal(supportChatTag({ ...base, widgetId: "" }), "");
});

test("boots the widget and identifies the merchant and app", () => {
  const js = supportChatScript(base);
  for (const s of ["conversations-widget.brevo.com", '"abc123"', "demo.myshopify.com", "Demo Co", '"APP":"reviews"', "UNVERIFIED"]) {
    assert.ok(js.includes(s), s);
  }
  assert.ok(!js.includes("MERCHANT_ID"));
});

test("app is required", () => {
  assert.throws(() => supportChatScript({ ...base, app: "" }));
});

test("a shop name cannot break out of the script tag", () => {
  const html = supportChatTag({ ...base, merchantName: "</script><script>window.__pwned=1</script>" });
  assert.equal(html.match(/<\/script>/g).length, 1);
  assert.equal(escapeForInlineScript('{"a":"<&>"}'), '{"a":"\\u003c\\u0026\\u003e"}');
});
