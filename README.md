# shopify-support-chat

[![test](https://github.com/01ecommerce/shopify-support-chat/actions/workflows/test.yml/badge.svg)](https://github.com/01ecommerce/shopify-support-chat/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/01ecommerce/shopify-support-chat/blob/main/LICENSE)

A [Brevo Conversations](https://www.brevo.com/products/conversations/) chat bubble for the **admin** side
of a Shopify app. Merchants use it to message you, the app developer, from inside your app. Each
conversation is tagged with the shop, the merchant and the app it came from.

- Zero runtime dependencies, ESM, no build step.
- React component for embedded apps, plus a plain `<script>` string for apps that render HTML.

## What it is not

- **Not for storefronts.** Never render it on a shop's storefront; that fails Shopify app review. Mount
  it only on pages inside your app's admin.
- **Not a way to verify who is chatting.** See [Identity is unverified](#identity-is-unverified).

## Set up with an AI coding agent

Most developers set this up through an AI coding agent. Paste this prompt into Claude Code, ChatGPT/Codex
or Cursor, in your Shopify app's repository:

```text
Add the Brevo support chat bubble to this Shopify app's admin using the npm package
@01ecommerce/shopify-support-chat. Install it from the tag tarball:
https://codeload.github.com/01ecommerce/shopify-support-chat/tar.gz/refs/tags/v2.2.0
Then follow node_modules/@01ecommerce/shopify-support-chat/docs/agent-setup.md exactly, step by step.
If that file is not there, read it at
https://github.com/01ecommerce/shopify-support-chat/blob/main/docs/agent-setup.md
Take the identity from the server session only. Use my Brevo widget id from BREVO_CONVERSATIONS_ID;
ask me for it, never invent one. When you finish, report the result of every item in its Verify checklist.
```

The guide is deterministic: preconditions, install, environment, the `app` id, identity, exact code for
React Router 7, Next.js, HTML strings and plain browser code, CSP, privacy, a DO NOT list and a verify
checklist. Machine-readable index: [llms.txt](https://github.com/01ecommerce/shopify-support-chat/blob/main/llms.txt).
Full guide: [docs/agent-setup.md](https://github.com/01ecommerce/shopify-support-chat/blob/main/docs/agent-setup.md).

## Install

Install a release tag, not a branch:

```sh
npm install https://codeload.github.com/01ecommerce/shopify-support-chat/tar.gz/refs/tags/v2.2.0
```

Why a tag tarball: a tag does not move, and your lockfile stores an integrity hash of the tarball, so
every install gets the same bytes. It needs no `git` binary and no credentials, so it also works in
Docker builds and CI. A `github:` dependency or a branch URL resolves to whatever the branch holds that
day.

Requires Node 20 or later (CI tests 20, 22 and 24). React 17 or later is an optional peer dependency (only for `/react`).

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
  visitorId={chat.visitorId} // from supportChatVisitorId, on the server
/>
```

Mount it once, in the layout that wraps every admin page. It loads the widget from the browser, in an
effect, and renders nothing, so it works wherever it is mounted: server-rendered pages, and layouts
that render their children only after mount. (Version 1 rendered an inline script, which React never
executes when it inserts it on the client.)

### HTML strings

```js
import { supportChatTag } from "@01ecommerce/shopify-support-chat";

html += supportChatTag({ widgetId: process.env.BREVO_CONVERSATIONS_ID, app: "my-shopify-app", shop, email, merchantName, visitorId });
```

`supportChatScript(opts)` returns the script body without the `<script>` tag. Both return `""` when
`widgetId` is empty. Values are escaped, so a shop name cannot break out of the tag.

### Plain browser code

```js
import { loadSupportChat } from "@01ecommerce/shopify-support-chat";

loadSupportChat({ widgetId, app: "my-shopify-app", shop, email, merchantName, visitorId });
```

Safe to call on every page load. It adds the Brevo script once and identifies the merchant on every
call. It returns `false` on the server or with an empty `widgetId`.

### One conversation per app and store: `visitorId`

Brevo keeps its anonymous visitor in the browser's storage for the top site, which inside the Shopify
admin is `admin.shopify.com`. Without a `visitorId`, every app that uses the same Brevo widget id and every
store open in one browser is **one** Brevo visitor with **one** conversation, relabelled by whichever page
loaded last. Pass a `visitorId` per app + store to give each its own conversation.

Derive it on the server with `supportChatVisitorId` and pass it to the page:

```js
import { supportChatVisitorId } from "@01ecommerce/shopify-support-chat/server";

const visitorId = supportChatVisitorId({
  secret: process.env.SHOPIFY_API_SECRET, // a server-only secret, at least 16 characters
  app: "my-shopify-app",                  // the same `app` you pass to the chat
  shop,                                   // xxx.myshopify.com, from the server session
});
```

- **Server only.** `@01ecommerce/shopify-support-chat/server` imports `node:crypto`; the browser entry does
  not import it. Never compute the id in the browser and never send the secret to the page. Brevo: the
  `visitorId` "must be unique and secret (not available to other users), since knowing it could grant
  access to the conversation", so never use the shop domain or another public value as the id.
- **Switching to it** starts a new Brevo conversation per app + store. An existing anonymous conversation
  is not carried over (Brevo documents no merge). Rotating the secret starts new conversations too.
- **When it is set:** the loader merges `visitorId` into `window.BrevoConversationsSetup` before it adds
  the Brevo script, which reads its settings when it starts. The first call in a page sets the id; later
  calls leave it alone, and the package never calls Brevo's `restart`.
- **Validation:** 16 to 128 of `A-Z a-z 0-9 _ -`, or the call throws, so a malformed id never falls back
  to the shared anonymous visitor. Empty or absent keeps Brevo's anonymous visitor (the behaviour before 2.2.0).
- **Derivation**, for porting: HMAC-SHA256 keyed by `secret` over
  `"shopify-support-chat:visitor:v1\n" + <len(app)> + ":" + app + "\n" + <len(shop)> + ":" + shop` (each
  `<len>` the field's UTF-8 byte length, in decimal), hex, first 32 characters. The length prefixes mean no
  `app` or `shop` value can forge the field boundary. Test vector: secret `0123456789abcdef0123456789abcdef`,
  app `example-app`, shop `demo.myshopify.com` gives `bc4dd335276f23de8c7edcd3701aed32`.
- Brevo documents `visitorId` in its
  [JavaScript API reference](https://developers.brevo.com/docs/javascript-api-reference). That separate
  conversations result for each app + store has not been checked in a live run at this release.

## Options

| Option | Required | What it is |
|---|---|---|
| `widgetId` | yes (empty = no bubble) | Your Brevo Conversations widget id. |
| `app` | yes | A stable, unique id for your app. Shown to support as the visitor's last name (`lastName`) and as the `APP` property. Use your repo name. Calls without it throw. |
| `shop` | no | `xxx.myshopify.com`, from the server session. Shown in the visitor's notes (`notes`) and as `SHOP`. |
| `email` | no | The merchant's email, from the server session. |
| `merchantName` | no | Shown as `MERCHANT` and as the visitor's first name (`firstName`). |
| `visitorId` | no (strongly recommended) | Brevo's visitor id: one conversation per app + store. From `supportChatVisitorId`, on the server. 16 to 128 of `A-Z a-z 0-9 _ -`, or the call throws. Never sent as a visitor property. See [above](#one-conversation-per-app-and-store-visitorid). |

What Brevo receives: one flat object. Brevo's `updateIntegrationData` takes only string, number, boolean
or `null` values and reads custom properties as top-level keys beside the standard fields, so the visitor
is `{ email, firstName, lastName, notes, SHOP, MERCHANT, APP, IDENTITY }` with nothing nested and any field
you did not pass left out (never sent as `null`, which would erase a value Brevo holds). See
[Brevo's JavaScript API reference](https://developers.brevo.com/docs/javascript-api-reference).

- **Standard fields, shown in the conversation's visitor panel.** `lastName` is your `app`, so the inbox list reads
  `<merchantName> <app>`. `notes` is `<shop> · UNVERIFIED — set by the browser, not by us. Confirm before
  acting on it.`, or only the warning when you passed no `shop`. This is where support reads the store
  address and the do-not-trust warning.
- **Custom keys** (`SHOP`, `MERCHANT`, `APP`, `IDENTITY`). In a live run they did not show in Brevo.
  Brevo's wording: "If custom properties set in
  `updateIntegrationData` match existing contact attributes, they sync with your Contacts database.
  Otherwise, they're available in Conversations only." That run's account had no such
  attributes, and the keys showed nowhere in the visitor panel or on the contact page. Why is not
  established, and creating the attributes has not been tested here; rely on `lastName` and `notes`.

Why `app` matters: when one Brevo inbox serves several apps, `APP` is how you tell which app a merchant
wrote from. It is the visitor's last name in the inbox. Short slugs collide; the repo name does not.

## API

Exports of `@01ecommerce/shopify-support-chat`:

- `loadSupportChat(opts, win?)`, `supportChatTag(opts)`, `supportChatScript(opts)`: the three ways to mount it (above).
- `buildVisitor(opts)`: the flat visitor object passed to Brevo's `updateIntegrationData` (`email`, `firstName`, `lastName`, `notes`, `SHOP`, `MERCHANT`, `APP`, `IDENTITY`; no nested object). Throws without `app`.
- `escapeForInlineScript(json)`: makes JSON safe inside an inline script.
- `BREVO_WIDGET_SRC` (the widget script URL), `LOADER_ELEMENT_ID` (`brevo-conversations-loader`) and
  `IDENTITY_IS_UNVERIFIED` (the `IDENTITY` label).

Exports of `@01ecommerce/shopify-support-chat/react`: `SupportChat`.

Exports of `@01ecommerce/shopify-support-chat/server` (server only; it imports `node:crypto`):
`supportChatVisitorId({ secret, app, shop })`, the `visitorId` for one app + store (32 lowercase hex
characters). Throws on a missing input or a secret shorter than 16 characters.

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
verification, so the visitor's Notes field carries the warning `UNVERIFIED` on every conversation (the
custom `IDENTITY` key shows only if your account has a contact attribute of that name). Support staff
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

The widget sends the merchant's chat messages and the visitor properties above to Brevo. List Brevo as a
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

CI runs `npm test` on Node 20, 22 and 24 for every push to `main` and every pull request.

The GitHub wiki is generated from this README, `docs/` and the changelog on every push to `main`; it is never edited by hand.

## Contributing

Issues and pull requests are welcome. Development is Docker-only and test-driven; the rules, the commit
style and the release steps are in [CONTRIBUTING.md](https://github.com/01ecommerce/shopify-support-chat/blob/main/CONTRIBUTING.md). Everyone taking part follows the
[Code of Conduct](https://github.com/01ecommerce/shopify-support-chat/blob/main/CODE_OF_CONDUCT.md).

## Security

Report a vulnerability privately, never in a public issue: see [SECURITY.md](https://github.com/01ecommerce/shopify-support-chat/blob/main/SECURITY.md).

## License

[MIT](https://github.com/01ecommerce/shopify-support-chat/blob/main/LICENSE), copyright 2026 01ecommerce.
