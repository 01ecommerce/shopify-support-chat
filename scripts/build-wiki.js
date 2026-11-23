// Builds the GitHub wiki from the repository. The repo is the source of truth; the wiki is a GENERATED
// mirror and is never hand-edited (.github/workflows/wiki.yml publishes it on every push to main).
//
// Page set (one file per page, in the wiki's flat namespace):
//   README.md        -> Home.md
//   CHANGELOG.md     -> Changelog.md
//   docs/<name>.md   -> <Page-Name>.md   (the naming rule is below)
//   _Sidebar.md, _Footer.md              (generated)
//
// Naming rule for docs/<name>.md: drop ".md", split on "-" and "_", upper-case the first letter of each
// word, join with "-". So agent-setup.md -> Agent-Setup.md and new_thing-guide.md -> New-Thing-Guide.md.
// GitHub shows the page title as the file name with "-" read as a space ("Agent Setup"). Every docs/*.md
// is picked up by scanning the directory, so a new doc appears with no change here.
//
// Zero dependencies. Deterministic: the same files and sha always give the same bytes, with pages
// emitted in sorted order.
//
//   node scripts/build-wiki.js <outDir> <sha>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/01ecommerce/shopify-support-chat";

/** docs/<name>.md -> the wiki page file name (see the naming rule above). */
export const docPageName = (file) =>
  `${file
    .replace(/\.md$/, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-")}.md`;

const link = (page) => `- [${page.replace(/\.md$/, "").replace(/-/g, " ")}](${page.replace(/\.md$/, "")})`;

/** Returns { "<Page>.md": content } for the whole wiki, keys in sorted order. */
export function buildWiki({ repoRoot, sha }) {
  if (!repoRoot) throw new Error("buildWiki: repoRoot is required");
  if (!/^[0-9a-f]{7,40}$/i.test(sha ?? "")) throw new Error(`buildWiki: sha must be 7-40 hex characters, got ${JSON.stringify(sha)}`);
  const read = (f) => readFileSync(join(repoRoot, f), "utf8");

  const pages = { "Home.md": read("README.md"), "Changelog.md": read("CHANGELOG.md") };
  const docs = readdirSync(join(repoRoot, "docs")).filter((f) => f.endsWith(".md")).sort();
  const docPages = [];
  for (const d of docs) {
    const name = docPageName(d);
    if (name in pages) throw new Error(`buildWiki: docs/${d} maps to ${name}, which is already taken`);
    pages[name] = read(`docs/${d}`);
    docPages.push(name);
  }

  pages["_Sidebar.md"] = `${["**Documentation**", "", link("Home.md"), ...docPages.map(link), link("Changelog.md")].join("\n")}\n`;
  pages["_Footer.md"] =
    `Generated from \`main@${sha.slice(0, 7)}\` of [01ecommerce/shopify-support-chat](${REPO_URL}). ` +
    "Edit README.md or docs/ in the repository; changes made here are overwritten.\n";

  return Object.fromEntries(Object.entries(pages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [outDir, sha] = process.argv.slice(2);
  if (!outDir || !sha) {
    console.error("usage: node scripts/build-wiki.js <outDir> <sha>");
    process.exit(2);
  }
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  console.log(`build-wiki: repo ${repoRoot} -> ${outDir} (sha ${sha.slice(0, 7)})`);
  const pages = buildWiki({ repoRoot, sha });
  mkdirSync(outDir, { recursive: true });
  const names = Object.keys(pages);
  names.forEach((name, i) => {
    writeFileSync(join(outDir, name), pages[name]);
    console.log(`build-wiki: wrote ${i + 1}/${names.length} ${name}`);
  });
  console.log(`build-wiki: generated ${names.length} pages`);
}
