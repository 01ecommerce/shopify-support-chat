# Changelog

All notable changes to this package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.1.0] - 2026-11-24

### Added
- `buildVisitor` sets the standard Brevo fields `lastName` (the `app`) and `notes` (`<shop> · UNVERIFIED…`,
  or only the warning without a `shop`). In a live run the custom keys `SHOP`, `MERCHANT`, `APP` and
  `IDENTITY` showed nowhere in the Brevo inbox, because Brevo shows custom properties only when the
  account has contact attributes with those names ("Otherwise, they're available in Conversations
  only", [Brevo's JavaScript API reference](https://developers.brevo.com/docs/javascript-api-reference)).
  The standard Last name and Notes fields show in any account, so support now sees the app and the store
  address with the do-not-trust warning. The inbox list reads `<merchantName> <app>`. The custom keys are
  unchanged. The `BrevoVisitor` type gains `lastName` and `notes`. Creating contact attributes with the
  custom names has not been tested.
- The wiki is generated from README.md, docs/ and CHANGELOG.md on every push to main
  (`scripts/build-wiki.js` and `.github/workflows/wiki.yml`). Not part of the npm tarball, so no release.

## [2.0.3] - 2026-11-24

### Fixed
- The visitor's email and name, and the `SHOP`, `MERCHANT`, `APP` and `IDENTITY` fields, never reached
  the Brevo inbox: the custom fields were nested under `attributes`, which Brevo's
  `updateIntegrationData` does not accept (it takes only string, number, boolean or `null` values, with
  custom properties as top-level keys; see
  [Brevo's JavaScript API reference](https://developers.brevo.com/docs/javascript-api-reference)). They are
  now flat scalar properties, as Brevo documents. Fields you do not pass are still omitted, never sent as `null`.
- `buildVisitor` returns that flat object (`email`, `firstName`, `SHOP`, `MERCHANT`, `APP`, `IDENTITY`)
  and the `BrevoVisitor` type drops `attributes`. The old shape never reached Brevo, so this is a fix, not a breaking change.

## [2.0.2] - 2026-11-23

### Added
- `docs/agent-setup.md`: a step-by-step setup guide written for an AI coding agent, with exact code per
  stack and a verify checklist. The README has a paste-ready prompt for it.
- `llms.txt` (llmstxt.org) and `AGENTS.md` (the rules for agents working on this repo; `CLAUDE.md` now
  only imports it).
- Docs drift tests (`docs.test.js`): install URLs match the version, every export and option is
  documented, no relative links in the README. The tarball now also ships `docs/agent-setup.md` and `llms.txt`.

### Fixed
- The README install URL pointed at v2.0.0.

## [2.0.1] - 2026-11-23

### Fixed
- `engines.node` is lowered to `>=20` (was `>=22` in 2.0.0), so consumers on Node 20 with
  `engine-strict=true` can install it. The package mostly runs in the browser and its Node-side code is
  ESM and string building. CI now also tests Node 20.

## [2.0.0]

### Changed (breaking)
- The React `SupportChat` component now loads the widget from the browser, in an effect, and renders
  `null`. Before, it rendered an inline `<script>`. A script that React inserts on the client never
  executes, so in an app whose layout renders its children only after mount the bubble silently never
  appeared. It now works wherever it is mounted.
- The package is renamed `@01ecommerce/shopify-support-chat` (was `@exc/shopify-support-chat`). Update
  your imports.
- The widget `<script>` now carries the id `brevo-conversations-loader`.
- `engines.node` is now `>=22` (was `>=18`; Node 18 and 20 are end-of-life). The package tarball now
  also carries `README.md`, `LICENSE` and `CHANGELOG.md`.

### Added
- `loadSupportChat(opts, win?)`: the browser loader behind the React component. It adds the Brevo script
  once and identifies the merchant on every call. Returns `false` on the server or with an empty widget id.
- `buildVisitor(opts)`: the visitor object passed to Brevo, with undefined fields omitted.
- Exports `BREVO_WIDGET_SRC` and `LOADER_ELEMENT_ID`.
- `make test` / `make check` run the tests in Docker.
- MIT license (`LICENSE`, `license` and `author` in `package.json`).
- Community files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  issue forms and a pull-request template.
- CI: a GitHub Actions workflow running the tests on Node 22 and 24, with actions pinned by commit SHA,
  and Dependabot for the actions.
- `.editorconfig`, `.gitattributes`, `.nvmrc`, and `"sideEffects": false`.
- Tests for the license, the engines range, the exports targets and the exact tarball file set.

### Unchanged
- `supportChatScript` and `supportChatTag` (HTML-string apps) behave as before, with the same escaping.

## [1.0.0]

- First release: `supportChatScript`, `supportChatTag`, `escapeForInlineScript`, `IDENTITY_IS_UNVERIFIED`
  and a React `SupportChat` component that rendered an inline script.

[2.0.3]: https://github.com/01ecommerce/shopify-support-chat/releases/tag/v2.0.3
[2.0.2]: https://github.com/01ecommerce/shopify-support-chat/releases/tag/v2.0.2
[2.0.1]: https://github.com/01ecommerce/shopify-support-chat/releases/tag/v2.0.1
[2.0.0]: https://github.com/01ecommerce/shopify-support-chat/releases/tag/v2.0.0
[1.0.0]: https://github.com/01ecommerce/shopify-support-chat/commits/af30278
