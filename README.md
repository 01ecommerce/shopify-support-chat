# shopify-support-chat

[![test](https://github.com/01ecommerce/shopify-support-chat/actions/workflows/test.yml/badge.svg)](https://github.com/01ecommerce/shopify-support-chat/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Brevo Conversations](https://www.brevo.com/products/conversations/) chat bubble for the **admin** side
of a Shopify app. Merchants use it to message you, the app developer, from inside your app. Each
conversation is tagged with the shop, the merchant and the app it came from.

- Zero runtime dependencies, ESM, no build step.
- React component for embedded apps, plus a plain `<script>` string for apps that render HTML.

## What it is not

- **Not for storefronts.** Never render it on a shop's storefront; that fails Shopify app review. Mount
  it only on pages inside your app's admin.
- **Not a way to verify who is chatting.** See [Identity is unverified](#identity-is-unverified).

## Install

Install a release tag, not a branch:

```sh
npm install https://codeload.github.com/01ecommerce/shopify-support-chat/tar.gz/refs/tags/v2.0.0
```

Why a tag tarball: a tag does not move, and your lockfile stores an integrity hash of the tarball, so
every install gets the same bytes. It needs no `git` binary and no credentials, so it also works in
Docker builds and CI. A `github:` dependency or a branch URL resolves to whatever the branch holds that
day.

Requires Node 22 or later (the supported LTS lines are 22 and 24). React 17 or later is an optional peer dependency (only for `/react`).

## Usage

You need a Brevo Conversations widget id, from your Brevo account's Conversations installation settings.

### React (any layout)

```tsx
import { SupportChat } from "@01ecommerce/shopify-support-chat/react";

// Values come from your server session, via your loader or props.
<SupportChat
  widgetId={chat.widgetId}
  app="my-shopify-app"
  shop={chat.shop}
  email={chat.email}
  merchantName={chat.merchantName}
/>
```

Mount it once, in the layout that wraps every admin page. It loads the widget from the browser, in an
effect, and renders nothing, so it works wherever it is mounted: server-rendered pages, and layouts
that render their children only after mount. (Version 1 rendered an inline script, which React never
executes when it inserts it on the client.)

### HTML strings

```js
import { supportChatTag } from "@01ecommerce/shopify-support-chat";

html += supportChatTag({ widgetId: process.env.BREVO_CONVERSATIONS_ID, app: "my-shopify-app", shop, email, merchantName });
```

`supportChatScript(opts)` returns the script body without the `<script>` tag. Both return `""` when
`widgetId` is empty. Values are escaped, so a shop name cannot break out of the tag.

### Plain browser code

```js
import { loadSupportChat } from "@01ecommerce/shopify-support-chat";

loadSupportChat({ widgetId, app: "my-shopify-app", shop, email, merchantName });
```

Safe to call on every page load. It adds the Brevo script once and identifies the merchant on every
call. It returns `false` on the server or with an empty `widgetId`.

## Options

| Option | Required | What it is |
|---|---|---|
| `widgetId` | yes (empty = no bubble) | Your Brevo Conversations widget id. |
| `app` | yes | A stable, unique id for your app. Shown to support as the `APP` attribute. Use your repo name. Calls without it throw. |
| `shop` | no | `xxx.myshopify.com`, from the server session. Shown as `SHOP`. |
| `email` | no | The merchant's email, from the server session. |
| `merchantName` | no | Shown as `MERCHANT` and as the visitor's first name. |

Why `app` matters: when one Brevo inbox serves several apps, `APP` is how you tell which app a merchant
wrote from. Short slugs collide; the repo name does not.

## Where `shop` and `email` come from

From the **server session**, never from the query string or anything else the browser can set.

In an embedded app that uses offline access tokens, the session token carries no user email. Ask the
Admin API for the store's own address and name, once per shop, and cache it:

```graphql
query SupportChatIdentity { shop { name email myshopifyDomain } }
```

That is the store's email, not necessarily the person typing. If the query fails, render the widget
with `shop` alone rather than breaking the page.

## Identity is unverified

Everything the widget sends is set in the browser, so a visitor can fake it. Brevo has no identity
verification, so the support panel shows `IDENTITY: UNVERIFIED` on every conversation. Support staff
must confirm who they are talking to, out of band, before acting on a billing or data request.

Never pass internal merchant or tenant ids. They would be a browser-set claim too, and they would leak.

## Content Security Policy

If your app sets a CSP, allow the widget's script host:

```text
script-src https://conversations-widget.brevo.com
```

The loader passes the visitor as an object, not as inline script, so no `'unsafe-inline'` is needed. The
widget itself opens further connections to Brevo; check your browser console for blocked requests after
turning a CSP on.

## Privacy

The widget sends the merchant's chat messages and the attributes above to Brevo. List Brevo as a
subprocessor in your privacy policy before you ship the widget.

## Safari and iframes

An embedded app runs in an iframe inside the Shopify admin. Browsers such as Safari can drop the
widget's cookie there, which would make the conversation look anonymous on the next page. That is why
the merchant is identified again on every call. Test in Safari.

## Development and CI: leave the widget id unset

With an empty `widgetId` nothing is loaded and nothing is added to the page. Leave your widget id
variable unset in development and CI.

## Development

Tests run in Docker only (`node:22-alpine`), using `node:test`:

```sh
make test     # or: make check
make clean    # removes leftover test containers
```

CI runs `npm test` on Node 22 and 24 for every push to `main` and every pull request.

## Contributing

Issues and pull requests are welcome. Development is Docker-only and test-driven; the rules, the commit
style and the release steps are in [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report a vulnerability privately, never in a public issue: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), copyright 2026 01ecommerce.
