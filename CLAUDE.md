# shopify-support-chat

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
- **Every release** = a `CHANGELOG.md` entry, the `package.json` version, and a tag `vX.Y.Z`. Consumers
  install the tag tarball, so a tag is the release.
- **No Claude or AI attribution** in commit messages or pull requests.
