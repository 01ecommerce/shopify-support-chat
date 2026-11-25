import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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
  const win = {};
  win.document = {
    head: {
      appendChild: (el) => {
        // What the widget would read when its script starts: the setup as it stood at append time.
        const setup = win.BrevoConversationsSetup;
        el.setupWhenAppended = setup === undefined ? undefined : { ...setup };
        el.setupObjectWhenAppended = setup;
        appended.push(el);
      },
    },
    createElement: (tag) => ({ tag }),
    getElementById: (id) => appended.find((el) => el.id === id) ?? null,
  };
  return { win, appended };
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
  assert.equal(payload.lastName, "example-app");
  assert.equal(payload.notes, `demo.myshopify.com · ${IDENTITY_IS_UNVERIFIED}`);
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
    lastName: "example-app",
    notes: `demo.myshopify.com · ${IDENTITY_IS_UNVERIFIED}`,
    SHOP: "demo.myshopify.com",
    MERCHANT: "Demo Co",
    APP: "example-app",
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
});

test("buildVisitor omits undefined fields (never null: null would erase what Brevo holds)", () => {
  const v = buildVisitor({ app: "example-app" });
  assert.deepEqual(Object.keys(v).sort(), ["APP", "IDENTITY", "lastName", "notes"]);
});

test("buildVisitor: lastName is the app (a standard Brevo field, so support sees it in any account)", () => {
  assert.equal(buildVisitor({ app: "example-app", shop: "demo.myshopify.com" }).lastName, "example-app");
  assert.equal(buildVisitor({ app: "example-app" }).lastName, "example-app");
});

test("buildVisitor: notes is the shop and the UNVERIFIED warning, or only the warning without a shop", () => {
  assert.equal(
    buildVisitor({ app: "example-app", shop: "demo.myshopify.com" }).notes,
    `demo.myshopify.com · ${IDENTITY_IS_UNVERIFIED}`,
  );
  assert.equal(buildVisitor({ app: "example-app" }).notes, IDENTITY_IS_UNVERIFIED);
});

// Brevo documents updateIntegrationData(data): "Each property's value must be a String, Number,
// Boolean, or null." https://developers.brevo.com/docs/javascript-api-reference
test("buildVisitor: every value is a string, number, boolean or null (Brevo accepts nothing nested)", () => {
  const scalar = (x) => x === null || ["string", "number", "boolean"].includes(typeof x);
  const full = buildVisitor({ app: "example-app", shop: "demo.myshopify.com", email: "a@b.co", merchantName: "Demo Co" });
  const minimal = buildVisitor({ app: "example-app" });
  for (const v of [full, minimal]) {
    assert.ok("lastName" in v && "notes" in v);
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
    lastName: "example-app",
    notes: `demo.myshopify.com · ${IDENTITY_IS_UNVERIFIED}`,
    SHOP: "demo.myshopify.com",
    MERCHANT: "Demo Co",
    APP: "example-app",
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
  assert.equal(visitor.attributes, undefined);
  const flat = JSON.stringify(visitor);
  assert.ok(!flat.includes("t-123") && !flat.includes("m-456"));
});

// --- visitorId: a known Brevo visitor per app + store --------------------------

const VID = "0123456789abcdef0123456789abcdef";

test("loadSupportChat: sets BrevoConversationsSetup.visitorId BEFORE the loader script is appended", () => {
  const { win, appended } = fakeWindow();
  assert.equal(loadSupportChat({ ...base, visitorId: VID }, win), true);
  assert.equal(appended.length, 1);
  assert.deepEqual(appended[0].setupWhenAppended, { visitorId: VID });
  assert.equal(win.BrevoConversationsSetup.visitorId, VID);
});

test("loadSupportChat: merges visitorId into an existing BrevoConversationsSetup (never replaces it)", () => {
  const { win, appended } = fakeWindow();
  const existing = { existingSetting: "kept" };
  win.BrevoConversationsSetup = existing;
  loadSupportChat({ ...base, visitorId: VID }, win);
  assert.equal(win.BrevoConversationsSetup, existing, "the same object, not a replacement");
  assert.deepEqual(existing, { existingSetting: "kept", visitorId: VID });
  assert.equal(appended[0].setupObjectWhenAppended, existing);
  assert.deepEqual(appended[0].setupWhenAppended, { existingSetting: "kept", visitorId: VID });
});

test("loadSupportChat: no visitorId (absent, empty or null) leaves BrevoConversationsSetup exactly as it was", () => {
  for (const visitorId of [undefined, "", null]) {
    const { win, appended } = fakeWindow();
    assert.equal(loadSupportChat({ ...base, visitorId }, win), true);
    assert.equal(win.BrevoConversationsSetup, undefined);
    assert.equal(appended[0].setupWhenAppended, undefined);
    const other = fakeWindow();
    other.win.BrevoConversationsSetup = { existingSetting: "kept" };
    loadSupportChat({ ...base, visitorId }, other.win);
    assert.deepEqual(other.win.BrevoConversationsSetup, { existingSetting: "kept" });
  }
});

test("loadSupportChat: the first call in a page sets the id; a later call cannot change it (no restart)", () => {
  const { win, appended } = fakeWindow();
  loadSupportChat({ ...base, visitorId: VID }, win);
  loadSupportChat({ ...base, visitorId: "ffffffffffffffffffffffffffffffff" }, win);
  assert.equal(appended.length, 1);
  assert.equal(win.BrevoConversationsSetup.visitorId, VID);
  assert.equal(identifyCalls(win).length, 2, "the merchant is still identified on every call");
});

const badIds = ["short", "0123456789abcde", "x".repeat(129), "0123456789abcdef 0123", "0123456789abcdef\"</script>", "0123456789abcdéf0", 12345678901234567890, {}];

test("loadSupportChat: a malformed visitorId throws and loads nothing (never falls back to the shared visitor)", () => {
  for (const visitorId of badIds) {
    const { win, appended } = fakeWindow();
    assert.throws(() => loadSupportChat({ ...base, visitorId }, win), /visitorId/, String(visitorId));
    assert.equal(appended.length, 0);
    assert.equal(win.BrevoConversationsID, undefined);
    assert.equal(win.BrevoConversationsSetup, undefined);
  }
});

test("visitorId: 16 to 128 of A-Z a-z 0-9 _ - are accepted", () => {
  for (const visitorId of ["0123456789abcdef", "A".repeat(128), "abc_DEF-123_xyz-0"]) {
    const { win } = fakeWindow();
    assert.equal(loadSupportChat({ ...base, visitorId }, win), true, visitorId);
    assert.equal(win.BrevoConversationsSetup.visitorId, visitorId);
    assert.ok(supportChatScript({ ...base, visitorId }).includes(visitorId));
  }
});

test("loadSupportChat: the visitorId is never sent in updateIntegrationData (it is a secret)", () => {
  const { win } = fakeWindow();
  loadSupportChat({ ...base, visitorId: VID }, win);
  assert.ok(!JSON.stringify(identifyCalls(win)).includes(VID));
});

/** Run the inline script against a fake window, as a browser would. */
function runInline(js, win) {
  vm.runInNewContext(js, { window: win, document: win.document });
}

test("supportChatScript: without visitorId the script never touches BrevoConversationsSetup", () => {
  for (const visitorId of [undefined, "", null]) {
    assert.ok(!supportChatScript({ ...base, visitorId }).includes("BrevoConversationsSetup"));
  }
});

test("supportChatScript: sets visitorId BEFORE the loader script is appended, when run in a page", () => {
  const { win, appended } = fakeWindow();
  runInline(supportChatScript({ ...base, visitorId: VID }), win);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, BREVO_WIDGET_SRC);
  assert.deepEqual(appended[0].setupWhenAppended, { visitorId: VID });
  assert.equal(win.BrevoConversationsID, "abc123");
});

test("supportChatScript: merges visitorId into an existing BrevoConversationsSetup", () => {
  const { win, appended } = fakeWindow();
  const existing = { existingSetting: "kept" };
  win.BrevoConversationsSetup = existing;
  runInline(supportChatScript({ ...base, visitorId: VID }), win);
  assert.equal(win.BrevoConversationsSetup, existing);
  assert.deepEqual(appended[0].setupWhenAppended, { existingSetting: "kept", visitorId: VID });
});

test("supportChatScript and supportChatTag: a malformed visitorId throws", () => {
  for (const visitorId of badIds) {
    assert.throws(() => supportChatScript({ ...base, visitorId }), /visitorId/, String(visitorId));
    assert.throws(() => supportChatTag({ ...base, visitorId }), /visitorId/, String(visitorId));
  }
});

test("supportChatScript: the visitorId is never in the updateIntegrationData payload", () => {
  const js = supportChatScript({ ...base, visitorId: VID });
  const payload = js.match(/w\[c\]\('updateIntegrationData',(\{.*\})\);/)[1];
  assert.ok(!payload.includes(VID));
  assert.equal(js.split(VID).length - 1, 1, "the id appears exactly once, in the setup");
});

// --- react.js tripwire (React is not installed, so read the source) ----------

test("react.js loads in an effect and never injects a script", () => {
  const src = readFileSync(new URL("./react.js", import.meta.url), "utf8");
  assert.match(src, /useEffect/);
  assert.match(src, /loadSupportChat/);
  assert.ok(!src.includes("dangerouslySetInnerHTML"), "a script React inserts on the client never runs");
});

test("react.js passes visitorId to loadSupportChat and re-runs the effect when it changes", () => {
  const src = readFileSync(new URL("./react.js", import.meta.url), "utf8");
  assert.match(src, /SupportChat\(\{[^}]*\bvisitorId\b[^}]*\}\)/, "the component takes visitorId");
  assert.match(src, /loadSupportChat\(\{[^}]*\bvisitorId\b[^}]*\}\)/, "and passes it on");
  assert.match(src, /\}, \[[^\]]*\bvisitorId\b[^\]]*\]\);/, "it is in the effect's dependencies");
});
