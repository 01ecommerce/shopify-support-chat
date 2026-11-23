import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("LICENSE is the MIT text and package.json says MIT", () => {
  assert.ok(existsSync(new URL("./LICENSE", import.meta.url)), "LICENSE exists");
  const text = read("LICENSE");
  assert.match(text, /^MIT License\n\nCopyright \(c\) 2026 01ecommerce\n/);
  assert.ok(text.includes("Permission is hereby granted, free of charge, to any person obtaining a copy"));
  assert.ok(text.includes('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND'));
  assert.equal(pkg.license, "MIT");
});

test("engines.node is >=20 (the package is browser-first; Node-side code is ESM and string building)", () => {
  assert.equal(pkg.engines.node, ">=20");
});

test("the tarball ships exactly the public files", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
  });
  const shipped = JSON.parse(out)[0].files.map((f) => f.path).sort();
  assert.deepEqual(shipped, [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "index.d.ts",
    "index.js",
    "package.json",
    "react.d.ts",
    "react.js",
  ]);
});

test("every exports target exists on disk", () => {
  const targets = [];
  const walk = (v) => (typeof v === "string" ? targets.push(v) : Object.values(v).forEach(walk));
  walk(pkg.exports);
  assert.ok(targets.length >= 4);
  for (const t of targets) assert.ok(existsSync(new URL(t, import.meta.url)), t);
});
