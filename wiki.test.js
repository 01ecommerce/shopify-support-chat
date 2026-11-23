// Tests for scripts/build-wiki.js: the GitHub wiki is a generated mirror of README.md, docs/ and
// CHANGELOG.md, never hand-edited. Each test names the drift it catches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWiki } from "./scripts/build-wiki.js";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const SHA = "259b4e3d5c1f0a7b8e9d2c4f6a1b3d5e7f9a0c2e";
const read = (f) => readFileSync(join(repoRoot, f), "utf8");
const docNames = () => readdirSync(join(repoRoot, "docs")).filter((f) => f.endsWith(".md")).sort();
const pageNameOf = (doc) => `${doc.replace(/\.md$/, "").split(/[-_]/).map((w) => w[0].toUpperCase() + w.slice(1)).join("-")}.md`;

test("Home.md is exactly README.md", () => {
  assert.equal(buildWiki({ repoRoot, sha: SHA })["Home.md"], read("README.md"));
});

test("every docs/*.md has a page, and the sidebar links each page (a new doc can never be missed)", () => {
  const pages = buildWiki({ repoRoot, sha: SHA });
  const sidebar = pages["_Sidebar.md"];
  assert.ok(docNames().length >= 1, "the docs scan found docs");
  for (const d of docNames()) {
    const page = pageNameOf(d);
    assert.equal(pages[page], read(`docs/${d}`), `${page} is docs/${d}`);
    assert.ok(sidebar.includes(`](${page.replace(/\.md$/, "")})`), `sidebar links ${page}`);
  }
});

test("a doc added to docs/ appears with no change to the script", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-fixture-"));
  try {
    execFileSync("mkdir", ["-p", join(dir, "docs")]);
    execFileSync("sh", ["-c", `printf '# r' > '${dir}/README.md'; printf '# c' > '${dir}/CHANGELOG.md'; printf '# a' > '${dir}/docs/new_thing-guide.md'`]);
    const pages = buildWiki({ repoRoot: dir, sha: SHA });
    assert.equal(pages["New-Thing-Guide.md"], "# a");
    assert.ok(pages["_Sidebar.md"].includes("](New-Thing-Guide)"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Changelog.md is CHANGELOG.md and the sidebar lists Home and Changelog", () => {
  const pages = buildWiki({ repoRoot, sha: SHA });
  assert.equal(pages["Changelog.md"], read("CHANGELOG.md"));
  assert.ok(pages["_Sidebar.md"].includes("](Home)"));
  assert.ok(pages["_Sidebar.md"].includes("](Changelog)"));
});

test("the footer names the short sha, links the repo and says edits are overwritten", () => {
  const footer = buildWiki({ repoRoot, sha: SHA })["_Footer.md"];
  assert.ok(footer.includes("`main@259b4e3`"), "short sha, 7 characters");
  assert.ok(!footer.includes(SHA), "not the full sha");
  assert.ok(footer.includes("https://github.com/01ecommerce/shopify-support-chat"), "links the repo");
  assert.ok(
    footer.includes("Edit README.md or docs/ in the repository; changes made here are overwritten."),
    "overwritten line",
  );
});

test("the output holds only the expected page set", () => {
  const expected = ["Home.md", "Changelog.md", "_Sidebar.md", "_Footer.md", ...docNames().map(pageNameOf)].sort();
  assert.deepEqual(Object.keys(buildWiki({ repoRoot, sha: SHA })).sort(), expected);
});

test("two runs give identical output, key order included", () => {
  const a = buildWiki({ repoRoot, sha: SHA });
  const b = buildWiki({ repoRoot, sha: SHA });
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a), [...Object.keys(a)].sort(), "keys are emitted in sorted order");
});

test("the CLI writes every page to the out dir", () => {
  const out = mkdtempSync(join(tmpdir(), "wiki-out-"));
  try {
    const log = execFileSync("node", [join(repoRoot, "scripts/build-wiki.js"), out, SHA], { encoding: "utf8" });
    const expected = buildWiki({ repoRoot, sha: SHA });
    assert.deepEqual(readdirSync(out).sort(), Object.keys(expected).sort());
    for (const [name, content] of Object.entries(expected)) assert.equal(readFileSync(join(out, name), "utf8"), content, name);
    assert.ok(log.includes(`generated ${Object.keys(expected).length} pages`), "prints progress");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the CLI refuses a missing out dir or sha", () => {
  assert.throws(() => execFileSync("node", [join(repoRoot, "scripts/build-wiki.js")], { stdio: "pipe" }));
});
