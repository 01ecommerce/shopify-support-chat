# Changelog

All notable changes to this package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [2.0.0]

### Changed (breaking)
- The React `SupportChat` component now loads the widget from the browser, in an effect, and renders
  `null`. Before, it rendered an inline `<script>`. A script that React inserts on the client never
  executes, so in an app whose layout renders its children only after mount the bubble silently never
  appeared. It now works wherever it is mounted.
- The package is renamed `@01ecommerce/shopify-support-chat` (was `@exc/shopify-support-chat`). Update
  your imports.
- The widget `<script>` now carries the id `brevo-conversations-loader`.

### Added
- `loadSupportChat(opts, win?)`: the browser loader behind the React component. It adds the Brevo script
  once and identifies the merchant on every call. Returns `false` on the server or with an empty widget id.
- `buildVisitor(opts)`: the visitor object passed to Brevo, with undefined fields omitted.
- Exports `BREVO_WIDGET_SRC` and `LOADER_ELEMENT_ID`.
- `make test` / `make check` run the tests in Docker.

### Unchanged
- `supportChatScript` and `supportChatTag` (HTML-string apps) behave as before, with the same escaping.

## [1.0.0]

- First release: `supportChatScript`, `supportChatTag`, `escapeForInlineScript`, `IDENTITY_IS_UNVERIFIED`
  and a React `SupportChat` component that rendered an inline script.

[2.0.0]: https://github.com/01ecommerce/shopify-support-chat/releases/tag/v2.0.0
[1.0.0]: https://github.com/01ecommerce/shopify-support-chat/commits/af30278
