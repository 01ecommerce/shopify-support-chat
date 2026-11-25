import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { supportChatVisitorId } from "./server.js";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

const SECRET = "0123456789abcdef0123456789abcdef";
const base = { secret: SECRET, app: "example-app", shop: "demo.myshopify.com" };

test("supportChatVisitorId: same inputs give the same id, 32 lowercase hex characters", () => {
  const a = supportChatVisitorId(base);
  const b = supportChatVisitorId({ ...base });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
});

test("supportChatVisitorId: the documented message format, so any language can derive the same id", () => {
  // HMAC-SHA256(secret, message), hex, first 32 characters. The message is a fixed prefix and two
  // length-prefixed fields (length = UTF-8 bytes): "shopify-support-chat:visitor:v1\n<len>:<app>\n<len>:<shop>".
  const message = "shopify-support-chat:visitor:v1\n11:example-app\n18:demo.myshopify.com";
  const expected = createHmac("sha256", SECRET).update(message, "utf8").digest("hex").slice(0, 32);
  assert.equal(supportChatVisitorId(base), expected);
  // The published test vector (README and docs/agent-setup.md quote it).
  assert.equal(supportChatVisitorId(base), "bc4dd335276f23de8c7edcd3701aed32");
});

test("supportChatVisitorId: the field length is counted in UTF-8 bytes, not UTF-16 code units", () => {
  const shop = "démo.myshopify.com"; // é is 2 bytes
  const message = `shopify-support-chat:visitor:v1\n11:example-app\n19:${shop}`;
  const expected = createHmac("sha256", SECRET).update(message, "utf8").digest("hex").slice(0, 32);
  assert.equal(supportChatVisitorId({ ...base, shop }), expected);
});

test("supportChatVisitorId: a different app, shop or secret gives a different id", () => {
  const id = supportChatVisitorId(base);
  assert.notEqual(supportChatVisitorId({ ...base, app: "other-app" }), id);
  assert.notEqual(supportChatVisitorId({ ...base, shop: "other.myshopify.com" }), id);
  assert.notEqual(supportChatVisitorId({ ...base, secret: "fedcba9876543210fedcba9876543210" }), id);
});

test("supportChatVisitorId: app and shop are not interchangeable", () => {
  assert.notEqual(
    supportChatVisitorId({ ...base, app: "x-app", shop: "y-app" }),
    supportChatVisitorId({ ...base, app: "y-app", shop: "x-app" }),
  );
});

test("supportChatVisitorId: the field separator cannot be forged", () => {
  assert.notEqual(
    supportChatVisitorId({ ...base, app: "a\nb", shop: "c" }),
    supportChatVisitorId({ ...base, app: "a", shop: "b\nc" }),
  );
  assert.notEqual(
    supportChatVisitorId({ ...base, app: "a\n1:b", shop: "c" }),
    supportChatVisitorId({ ...base, app: "a", shop: "b\n1:c" }),
  );
});

test("supportChatVisitorId: throws on a missing or empty secret, app or shop", () => {
  for (const key of ["secret", "app", "shop"]) {
    assert.throws(() => supportChatVisitorId({ ...base, [key]: undefined }), new RegExp(key), `${key} undefined`);
    assert.throws(() => supportChatVisitorId({ ...base, [key]: "" }), new RegExp(key), `${key} empty`);
    assert.throws(() => supportChatVisitorId({ ...base, [key]: 42 }), new RegExp(key), `${key} not a string`);
  }
  assert.throws(() => supportChatVisitorId(), /secret/);
});

test("supportChatVisitorId: a secret shorter than 16 characters throws; 16 is accepted", () => {
  assert.throws(() => supportChatVisitorId({ ...base, secret: "0123456789abcde" }), /16/);
  assert.match(supportChatVisitorId({ ...base, secret: "0123456789abcdef" }), /^[0-9a-f]{32}$/);
});

test("the browser entries never import node:crypto or the server helper", () => {
  const imports = (src) => [...src.matchAll(/(?:^|\s)(?:import|from)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(imports(read("index.js")), [], "index.js imports nothing");
  assert.deepEqual(imports(read("react.js")), ["react", "./index.js"]);
  assert.deepEqual(imports(read("server.js")), ["node:crypto"], "the scan sees a real import");
  for (const f of ["index.js", "react.js"]) assert.ok(!read(f).includes("node:crypto"), `${f} references node:crypto`);
});
