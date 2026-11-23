// Docs drift tests. README.md is published as the wiki Home and docs/*.md as wiki pages, so a stale
// README is a stale wiki. Each test names the drift it catches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as indexModule from "./index.js";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

const docFiles = () =>
  ["README.md", "llms.txt", ...readdirSync(new URL("./docs/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];

/** Named runtime exports, read from the source (react.js cannot be imported: React is not installed here). */
const exportNames = (src) =>
  [...src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);

test("every install URL in README, docs and llms.txt uses exactly the package.json version", () => {
  const re = /codeload\.github\.com\/01ecommerce\/shopify-support-chat\/tar\.gz\/refs\/tags\/(v[^\s)"'`]+)/g;
  let seen = 0;
  for (const f of docFiles()) {
    for (const m of read(f).matchAll(re)) {
      seen++;
      assert.equal(m[1], `v${pkg.version}`, `${f} installs ${m[1]}, package.json is ${pkg.version}`);
    }
  }
  assert.ok(seen >= 2, "expected install URLs in README and docs/agent-setup.md");
});

test("the export scan sees what the modules really export (the scan itself is not blind)", () => {
  assert.deepEqual(exportNames(read("index.js")).sort(), Object.keys(indexModule).sort());
  assert.deepEqual(exportNames(read("react.js")), ["SupportChat"]);
});

for (const doc of ["README.md", "docs/agent-setup.md"]) {
  test(`${doc} mentions every runtime export of index.js and react.js`, () => {
    assert.ok(existsSync(new URL(`./${doc}`, import.meta.url)), `${doc} exists`);
    const text = read(doc);
    for (const name of [...exportNames(read("index.js")), ...exportNames(read("react.js"))]) {
      assert.ok(text.includes(name), `${doc} does not mention the export ${name}`);
    }
  });

  test(`${doc} mentions every ChatVisitor field`, () => {
    assert.ok(existsSync(new URL(`./${doc}`, import.meta.url)), `${doc} exists`);
    const dts = read("index.d.ts");
    const body = dts.match(/export type ChatVisitor = \{([\s\S]*?)\n\};/)[1];
    const fields = [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    assert.ok(fields.length >= 5, `parsed ${fields.length} ChatVisitor fields`);
    const text = read(doc);
    for (const f of fields) assert.ok(text.includes(`\`${f}\``), `${doc} does not mention the field \`${f}\``);
  });
}

test("the README options table has a row for every ChatVisitor field", () => {
  const body = read("index.d.ts").match(/export type ChatVisitor = \{([\s\S]*?)\n\};/)[1];
  const fields = [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  const rows = read("README.md").split("\n").filter((l) => l.startsWith("|"));
  for (const f of fields) assert.ok(rows.some((r) => r.includes(`| \`${f}\` |`)), `no options-table row for \`${f}\``);
});

test("README and docs have no relative links (README is the wiki Home; relative links break there)", () => {
  for (const f of ["README.md", ...docFiles().filter((d) => d.startsWith("docs/"))]) {
    const bad = [...read(f).matchAll(/\]\((?!https?:\/\/|#|mailto:)([^)]*)\)/g)].map((m) => m[0]);
    assert.deepEqual(bad, [], `${f} has relative links: ${bad.join(" ")}`);
  }
});

test("CLAUDE.md only imports AGENTS.md, and AGENTS.md states the docs-with-every-change rule", () => {
  assert.ok(read("CLAUDE.md").split("\n").some((l) => l.trim() === "@AGENTS.md"), "CLAUDE.md has the line @AGENTS.md");
  assert.ok(existsSync(new URL("./AGENTS.md", import.meta.url)), "AGENTS.md exists");
  const rules = read("AGENTS.md");
  for (const needle of ["README.md", "docs/", "CHANGELOG.md", "docs.test.js", "never hand-edited"]) {
    assert.ok(rules.includes(needle), `AGENTS.md does not mention ${needle}`);
  }
});

test("llms.txt follows llmstxt.org: an H1, a summary, absolute links to the key docs", () => {
  const t = read("llms.txt");
  assert.match(t, /^# shopify-support-chat\n\n> .+/);
  for (const p of ["README.md", "docs/agent-setup.md", "CHANGELOG.md", "SECURITY.md"]) {
    assert.ok(t.includes(`https://github.com/01ecommerce/shopify-support-chat/blob/main/${p}`), `llms.txt links ${p}`);
  }
});
