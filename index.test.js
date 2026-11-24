import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  supportChatScript,
  supportChatTag,
  escapeForInlineScript,
  buildVisitor,
  loadSupportChat,
  BREVO_WIDGET_SRC,
  LOADER_ELEMENT_ID,
  IDENTITY_IS_UNVERIFIED,
} from "./index.js";

const base = { widgetId: "abc123", app: "example-app", shop: "demo.myshopify.com", merchantName: "Demo Co" };

/** A minimal stand-in for `window` + `document`: enough for the loader, no DOM library. */
function fakeWindow() {
  const appended = [];
  const document = {
    head: { appendChild: (el) => appended.push(el) },
    createElement: (tag) => ({ tag }),
    getElementById: (id) => appended.find((el) => el.id === id) ?? null,
  };
  return { win: { document }, appended };
}

const identifyCalls = (win) =>
  [...(win.BrevoConversations?.q ?? [])].filter((args) => args[0] === "updateIntegrationData");

// --- HTML-string path (unchanged behaviour) ---------------------------------

test("no widget id, no bubble", () => {
  assert.equal(supportChatTag({ ...base, widgetId: "" }), "");
  assert.equal(supportChatScript({ ...base, widgetId: "" }), "");
});

test("boots the widget and identifies the merchant and app", () => {
  const js = supportChatScript(base);
  for (const s of ["conversations-widget.brevo.com", '"abc123"', "demo.myshopify.com", "Demo Co", '"APP":"example-app"', "UNVERIFIED"]) {
    assert.ok(js.includes(s), s);
  }
  assert.ok(!js.includes("MERCHANT_ID"));
});

test("inline script: the updateIntegrationData payload is the flat visitor, no nested object", () => {
  const js = supportChatScript({ ...base, email: "owner@demo.example" });
  const m = js.match(/w\[c\]\('updateIntegrationData',(\{.*\})\);/);
  assert.ok(m, "updateIntegrationData call not found");
  const payload = JSON.parse(m[1]);
  assert.deepEqual(payload, buildVisitor({ ...base, email: "owner@demo.example" }));
  assert.equal(payload.attributes, undefined);
  assert.equal(payload.APP, "example-app");
  assert.equal(payload.SHOP, "demo.myshopify.com");
  assert.equal(payload.firstName, "Demo Co");
});

test("app is required", () => {
  assert.throws(() => supportChatScript({ ...base, app: "" }));
});

test("a shop name cannot break out of the script tag", () => {
  const html = supportChatTag({ ...base, merchantName: "</script><script>window.__pwned=1</script>" });
  assert.equal(html.match(/<\/script>/g).length, 1);
  assert.equal(escapeForInlineScript('{"a":"<&>"}'), '{"a":"\\u003c\\u0026\\u003e"}');
});

// --- buildVisitor ------------------------------------------------------------

test("buildVisitor is ONE flat object: standard keys and SHOP, MERCHANT, APP, IDENTITY beside them", () => {
  const v = buildVisitor({ app: "example-app", shop: "demo.myshopify.com", email: "a@b.co", merchantName: "Demo Co" });
  assert.deepEqual(v, {
    email: "a@b.co",
    firstName: "Demo Co",
    SHOP: "demo.myshopify.com",
    MERCHANT: "Demo Co",
    APP: "example-app",
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
});

test("buildVisitor omits undefined fields (never null: null would erase what Brevo holds)", () => {
  const v = buildVisitor({ app: "example-app" });
  assert.deepEqual(Object.keys(v).sort(), ["APP", "IDENTITY"]);
});

// Brevo documents updateIntegrationData(data): "Each property's value must be a String, Number,
// Boolean, or null." https://developers.brevo.com/docs/javascript-api-reference
test("buildVisitor: every value is a string, number, boolean or null (Brevo accepts nothing nested)", () => {
  const scalar = (x) => x === null || ["string", "number", "boolean"].includes(typeof x);
  const full = buildVisitor({ app: "example-app", shop: "demo.myshopify.com", email: "a@b.co", merchantName: "Demo Co" });
  const minimal = buildVisitor({ app: "example-app" });
  for (const v of [full, minimal]) {
    for (const [k, x] of Object.entries(v)) assert.ok(scalar(x), `${k} is ${Array.isArray(x) ? "an array" : typeof x}`);
    assert.equal(v.attributes, undefined);
  }
});

test("buildVisitor requires app", () => {
  assert.throws(() => buildVisitor({ shop: "demo.myshopify.com" }));
});

// --- loadSupportChat ---------------------------------------------------------

test("loadSupportChat: no window (server render) returns false", () => {
  assert.equal(loadSupportChat(base, undefined), false);
});

test("loadSupportChat: empty widget id returns false and appends nothing", () => {
  const { win, appended } = fakeWindow();
  assert.equal(loadSupportChat({ ...base, widgetId: "" }, win), false);
  assert.equal(appended.length, 0);
  assert.equal(win.BrevoConversations, undefined);
  assert.equal(win.BrevoConversationsID, undefined);
});

test("loadSupportChat: app is required", () => {
  const { win } = fakeWindow();
  assert.throws(() => loadSupportChat({ ...base, app: "" }, win));
});

test("loadSupportChat: sets the id, the queue and one async loader script", () => {
  const { win, appended } = fakeWindow();
  assert.equal(loadSupportChat(base, win), true);
  assert.equal(win.BrevoConversationsID, "abc123");
  assert.equal(typeof win.BrevoConversations, "function");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tag, "script");
  assert.equal(appended[0].async, true);
  assert.equal(appended[0].src, BREVO_WIDGET_SRC);
  assert.equal(appended[0].id, LOADER_ELEMENT_ID);
  assert.equal(BREVO_WIDGET_SRC, "https://conversations-widget.brevo.com/brevo-conversations.js");
});

test("loadSupportChat: two calls append exactly ONE script", () => {
  const { win, appended } = fakeWindow();
  loadSupportChat(base, win);
  loadSupportChat(base, win);
  assert.equal(appended.length, 1);
});

test("loadSupportChat: two calls identify TWICE (re-identify on every page load)", () => {
  const { win } = fakeWindow();
  loadSupportChat(base, win);
  loadSupportChat({ ...base, merchantName: "Renamed Co" }, win);
  const calls = identifyCalls(win);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].firstName, "Renamed Co");
});

test("loadSupportChat: keeps a queue function the widget already installed", () => {
  const { win } = fakeWindow();
  const existing = () => {};
  win.BrevoConversations = existing;
  loadSupportChat(base, win);
  assert.equal(win.BrevoConversations, existing);
});

test("loadSupportChat: the visitor carries APP, SHOP, MERCHANT, IDENTITY and no internal id", () => {
  const { win } = fakeWindow();
  loadSupportChat({ ...base, email: "owner@demo.example", tenantId: "t-123", merchantId: "m-456" }, win);
  const visitor = identifyCalls(win)[0][1];
  assert.deepEqual(visitor, {
    email: "owner@demo.example",
    firstName: "Demo Co",
    SHOP: "demo.myshopify.com",
    MERCHANT: "Demo Co",
    APP: "example-app",
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
  assert.equal(visitor.attributes, undefined);
  const flat = JSON.stringify(visitor);
  assert.ok(!flat.includes("t-123") && !flat.includes("m-456"));
});

// --- react.js tripwire (React is not installed, so read the source) ----------

test("react.js loads in an effect and never injects a script", () => {
  const src = readFileSync(new URL("./react.js", import.meta.url), "utf8");
  assert.match(src, /useEffect/);
  assert.match(src, /loadSupportChat/);
  assert.ok(!src.includes("dangerouslySetInnerHTML"), "a script React inserts on the client never runs");
});
