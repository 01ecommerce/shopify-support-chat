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

const ORIGIN = "https://app.example.com";

/** A minimal stand-in for `window` + `document`: enough for the loader, no DOM library.
 *  `url` is the path + query + hash of the page; `history.replaceState` rewrites `location` as a
 *  browser does, and records each call. */
function fakeWindow(url = "/app") {
  const appended = [];
  const win = {};
  const location = {};
  const setUrl = (u) => {
    const hashAt = u.indexOf("#");
    const rest = hashAt === -1 ? u : u.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : u.slice(hashAt);
    const queryAt = rest.indexOf("?");
    const search = queryAt === -1 ? "" : rest.slice(queryAt);
    location.pathname = queryAt === -1 ? rest : rest.slice(0, queryAt);
    location.search = search === "?" ? "" : search;
    location.hash = hash === "#" ? "" : hash;
    location.href = ORIGIN + u;
  };
  setUrl(url);
  win.location = location;
  win.history = {
    state: { key: "k1", idx: 0 },
    calls: [],
    replaceState(state, title, u) {
      this.calls.push({ state, title, url: u });
      setUrl(u);
    },
  };
  win.document = {
    head: {
      appendChild: (el) => {
        // What the widget reads as the current page when its script starts.
        el.hrefWhenAppended = win.location.href;
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
  return { win, appended, setUrl };
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

// --- Shopify launch credentials are cleared from the address before the widget starts ------
// The widget reports `location.href` to its vendor as the current page. In an embedded app that URL
// carries Shopify's launch credentials (`id_token`, `hmac`, `session`, `timestamp`), so both paths
// clear them with history.replaceState BEFORE the widget script is added, and load nothing if they
// cannot.

const LAUNCH_URL =
  "/app?admin_theme=x&embedded=1&hmac=H&host=abc%3D%3D&id_token=eyJa.eyJb.sig&locale=en&session=S" +
  "&shop=demo.myshopify.com&timestamp=1#frag";
const CREDENTIAL_PARAM = /(?:^|[?&])(?:id_token|hmac|session|timestamp)=/;

/** Both ways the package starts the widget in a page. */
const mountPaths = {
  loadSupportChat: (win, opts = base) => loadSupportChat(opts, win),
  "inline script": (win, opts = base) => {
    runInline(supportChatScript(opts), win);
    return undefined;
  },
};

const stripCases = [
  {
    name: "T1 the full launch URL loses hmac, id_token, session and timestamp; the rest and the hash stay",
    url: LAUNCH_URL,
    expect: "/app?admin_theme=x&embedded=1&host=abc%3D%3D&locale=en&shop=demo.myshopify.com#frag",
  },
  {
    name: "T1b only credentials: the query goes, the path and the hash stay",
    url: "/app/settings?id_token=eyJa.eyJb.sig&hmac=H#top",
    expect: "/app/settings#top",
  },
  {
    name: "T2 a percent-encoded key (id%5Ftoken) is dropped",
    url: "/app?id%5Ftoken=abc&shop=demo.myshopify.com",
    expect: "/app?shop=demo.myshopify.com",
  },
  {
    name: "T3 a JWT-shaped value under any key is dropped; text that only starts with eyJ is kept",
    url: "/app?foo=eyJa.eyJb.c&q=eyJustText",
    expect: "/app?q=eyJustText",
  },
  {
    name: "T4 other pairs are kept byte for byte, in order (no re-encoding)",
    url: "/app?q=a+b&page=2&example_param=%E2%9C%93&bad=%E0%A4%A&timestamp=1",
    expect: "/app?q=a+b&page=2&example_param=%E2%9C%93&bad=%E0%A4%A",
  },
];

for (const [pathName, mount] of Object.entries(mountPaths)) {
  for (const c of stripCases) {
    test(`${pathName}: ${c.name}`, () => {
      const { win, appended } = fakeWindow(c.url);
      const result = mount(win);
      if (pathName === "loadSupportChat") assert.equal(result, true);
      assert.equal(appended.length, 1, "the widget script is added");
      assert.equal(appended[0].hrefWhenAppended, ORIGIN + c.expect, "the address the widget sees");
      assert.equal(win.history.calls.length, 1, "one replaceState");
      assert.equal(win.history.calls[0].url, c.expect);
    });
  }

  test(`${pathName}: T5 replaceState keeps the router's history.state object and passes "" as the title`, () => {
    const { win } = fakeWindow(LAUNCH_URL);
    const state = win.history.state;
    mount(win);
    assert.equal(win.history.calls.length, 1);
    assert.equal(win.history.calls[0].state, state, "the same object, not a copy or null");
    assert.equal(win.history.calls[0].title, "");
  });

  test(`${pathName}: T6 nothing to clear means no replaceState call, and the widget loads`, () => {
    const url = "/app?embedded=1&host=abc%3D%3D&shop=demo.myshopify.com&q=eyJustText#frag";
    const { win, appended } = fakeWindow(url);
    const result = mount(win);
    if (pathName === "loadSupportChat") assert.equal(result, true);
    assert.equal(win.history.calls.length, 0);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].hrefWhenAppended, ORIGIN + url);
  });

  test(`${pathName}: T7 a replaceState that throws loads nothing and identifies no one (fail closed)`, () => {
    const { win, appended } = fakeWindow(LAUNCH_URL);
    win.history.replaceState = () => {
      throw new Error("SecurityError");
    };
    const result = mount(win);
    if (pathName === "loadSupportChat") assert.equal(result, false);
    assert.equal(appended.length, 0);
    assert.equal(win.BrevoConversationsID, undefined);
    assert.equal(identifyCalls(win).length, 0);
  });

  test(`${pathName}: T8 a replaceState that leaves the address unchanged loads nothing (fail closed)`, () => {
    const { win, appended } = fakeWindow(LAUNCH_URL);
    win.history.replaceState = function (state, title, u) {
      this.calls.push({ state, title, url: u });
    };
    const result = mount(win);
    if (pathName === "loadSupportChat") assert.equal(result, false);
    assert.equal(win.history.calls.length, 1, "it tried");
    assert.equal(appended.length, 0);
    assert.equal(win.BrevoConversationsID, undefined);
    assert.equal(identifyCalls(win).length, 0);
  });
}

test("T9 no widget id: the address is not touched (both paths)", () => {
  const { win, appended } = fakeWindow(LAUNCH_URL);
  assert.equal(loadSupportChat({ ...base, widgetId: "" }, win), false);
  assert.equal(supportChatScript({ ...base, widgetId: "" }), "");
  assert.equal(win.history.calls.length, 0);
  assert.equal(win.location.href, ORIGIN + LAUNCH_URL);
  assert.equal(appended.length, 0);
});

test("T10 a malformed visitorId throws before the address is touched", () => {
  const { win, appended } = fakeWindow(LAUNCH_URL);
  assert.throws(() => loadSupportChat({ ...base, visitorId: "short" }, win), /visitorId/);
  assert.throws(() => loadSupportChat({ ...base, app: "" }, win), /app/);
  assert.equal(win.history.calls.length, 0);
  assert.equal(win.location.href, ORIGIN + LAUNCH_URL);
  assert.equal(appended.length, 0);
});

test("T11 loadSupportChat: a later call clears credentials put back in the address, and adds no second script", () => {
  const { win, appended, setUrl } = fakeWindow(LAUNCH_URL);
  assert.equal(loadSupportChat(base, win), true);
  setUrl("/app/other?shop=demo.myshopify.com&id_token=eyJc.eyJd.sig2&embedded=1");
  assert.equal(loadSupportChat(base, win), true);
  assert.equal(win.history.calls.length, 2);
  assert.equal(win.location.href, `${ORIGIN}/app/other?shop=demo.myshopify.com&embedded=1`);
  assert.ok(!CREDENTIAL_PARAM.test(win.location.search));
  assert.equal(appended.length, 1);
  assert.equal(identifyCalls(win).length, 2);
});

test("T12 the tag stays one script: one </script>, no <!--, and the clearing code appears once, first", () => {
  const tag = supportChatTag({ ...base, merchantName: "</script><!--<script>x</script>", visitorId: VID });
  assert.equal(tag.match(/<\/script>/g).length, 1);
  assert.ok(!tag.includes("<!--"));
  assert.equal(tag.split("replaceState").length - 1, 1, "the clearing function is inlined exactly once");
  assert.equal(tag.split('["id_token","hmac","session","timestamp"]').length - 1, 1, "with the credential list");
  assert.match(
    supportChatScript(base),
    /^\(function\(d,w,c\)\{\n\s*if\(!\(function [\s\S]*?\)\(w,\["id_token","hmac","session","timestamp"\]\)\)return;\n\s*w\.BrevoConversationsID=/,
    "the guard is the first statement, before the widget id is set",
  );
});

test("T12b the inline script stays ES5 (it runs as written in any admin browser, no build step)", () => {
  const js = supportChatScript({ ...base, visitorId: VID });
  for (const modern of ["=>", "`", "...", /\bconst\b/, /\blet\b/, /\bclass\b/, /\bURL\b/]) {
    const hit = typeof modern === "string" ? js.includes(modern) : modern.test(js);
    assert.ok(!hit, `the inline script uses ${modern}`);
  }
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
