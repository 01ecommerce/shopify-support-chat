# shopify-support-chat: rules for AI agents working on this repo

This is the canonical file for any AI coding agent changing THIS repo (Codex, Cursor, Claude Code).
`CLAUDE.md` only imports it. (To integrate the package into a Shopify app, read
`docs/agent-setup.md` instead.)

A tiny public, MIT-licensed npm-style package (Node >= 20): the Brevo Conversations chat bubble for
Shopify app **admin** pages. ESM, no build step, zero runtime dependencies.

## Rules
- **Docker only.** Run tests with `make test` (or `make check`). Never host `node` or `npm`.
- **TDD.** A failing test first, then the code. A guard gets a mutation check: break it, see the test fail, revert.
- **Community files stay current.** `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` and `.github/` stay current; `package.test.js` pins the license, `engines.node`
  and the exact tarball file set. CI actions are pinned by commit SHA.
- **Zero runtime dependencies.** React is an optional peer dependency and is not installed here, so
  `react.js` is covered by a source-level test.
- **Generalized.** Nothing specific to one consumer: no widget id, no app or product names, no internal
  paths or ids. Examples use placeholders (`example-app`, `demo.myshopify.com`).
- **Admin only.** Never render the widget on a storefront.
- **Docs travel with every change.** Every change updates `README.md`, `docs/` and `CHANGELOG.md` in the
  same commit. `README.md` is published as the wiki Home and `docs/*.md` as wiki pages, by an automatic
  job: the wiki is generated, never hand-edited. `docs.test.js` guards drift (install URLs match the
  version, every export and `ChatVisitor` field is documented, README has no relative links). The README
  and docs link to repo files with absolute `https://github.com/01ecommerce/shopify-support-chat/blob/main/...` URLs.
- **The wiki is generated, never hand-edited.** `scripts/build-wiki.js` turns `README.md` into Home,
  each `docs/*.md` into a page (`agent-setup.md` becomes `Agent-Setup`) and `CHANGELOG.md` into Changelog,
  plus a sidebar and a footer. `.github/workflows/wiki.yml` publishes it to the wiki's `master` on every
  push to `main` that touches those files. A new `docs/*.md` appears in the wiki by itself: add no list
  anywhere. `wiki.test.js` guards it. Preview with `make wiki-preview` (writes `.wiki-preview/` in Docker).
- **Every release** = a `CHANGELOG.md` entry, the `package.json` version, and a tag `vX.Y.Z`; every install URL in the README and docs bumped to it (the test enforces it). Consumers
  install the tag tarball, so a tag is the release.
- **No Claude or AI attribution** in commit messages or pull requests.
