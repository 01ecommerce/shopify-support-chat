# Agent setup guide

This page is written for an **AI coding agent** (Claude Code, Codex, Cursor, ChatGPT) that is adding
`@01ecommerce/shopify-support-chat` to a Shopify app. Follow the steps in order, paste the code as
written, and do not skip the Verify section. A human can follow it too.

What you are building: a chat bubble inside the app's **admin** pages. The merchant messages the app
developer; each conversation arrives in the developer's own Brevo inbox, tagged with the shop, the
merchant and the app.

## Step 0: preconditions

Check all four. If one is false, stop and ask the developer; do not guess.

1. The app is an **admin-embedded** or **admin-only** Shopify app. This package never goes on a storefront.
2. The developer has their **own Brevo account** with Conversations enabled, and knows their widget id.
   It is in Brevo under Conversations, then the installation (or chat widget) settings. If the developer
   does not have it, ask them for it. Never invent one and never reuse an id from another project.
3. Node 20 or later (`node --version`).
4. The server session is available where the admin layout loads (a loader, a route handler or a
   server-rendered page). Identity comes from there.

## Step 1: install the release tag

```sh
npm install https://codeload.github.com/01ecommerce/shopify-support-chat/tar.gz/refs/tags/v2.2.1
```

Use a **tag** tarball, never a branch and never a `github:` dependency. A tag does not move, and the
lockfile records an integrity hash of the tarball, so every install gets the same bytes. It needs no
`git` binary and no credentials, so it also works in Docker builds and CI. Run the install the way the
app already installs packages (inside its Docker image if the app builds in Docker).

React 17 or later is an optional peer dependency, needed only for `@01ecommerce/shopify-support-chat/react`.

## Step 2: the environment variable

Add one variable, `BREVO_CONVERSATIONS_ID`, holding the widget id.

- **Unset in development and CI.** With an empty id nothing is loaded and nothing is added to the page.
- **Set in production**, in the host's environment settings (not in a file in the repository).
- It is a public identifier that appears in the page source. It is **not a secret and not an API key**.
  Still, never commit a real widget id into a shared repository: it belongs to one developer's inbox.
- Add the name (never the value) to the app's `.env.example`, if it has one.

## Step 3: the `app` value

Every call needs `app`: **one stable, unique id for this app, the repository name** (for example
`example-app`). It appears to support as the `APP` property, which is how the developer tells apps
apart when one Brevo inbox serves several. Do not use a display name that can change, and do not use a
short generic slug. A call without `app` throws.

## Step 4: identity, from the server session only

The options are `widgetId`, `app`, `shop`, `email`, `merchantName` and `visitorId` (Step 5). `shop`, `email` and
`merchantName` come from the **server session**. Never read them from the query string, a cookie the
browser can set, or any client input.

For an embedded app with offline access tokens the session token carries no user email, so ask the Admin
API for the store's own name and email, once per shop, and cache the result:

```graphql
query SupportChatIdentity { shop { name email myshopifyDomain } }
```

Map it as `shop` = `myshopifyDomain`, `email` = `email`, `merchantName` = `name`. This is the store's
address, not necessarily the person typing. A failed query must **not break the page**: catch the error
and pass `shop` only.

Never pass an internal merchant, tenant or database id. It would be a browser-set claim and it would leak.

## Step 5: the visitor id, derived on the server

Derive the visitor id on the server with `supportChatVisitorId` and pass it as `visitorId`.

Why: Brevo keeps its anonymous visitor in the browser's storage for the top site, which inside the Shopify
admin is `admin.shopify.com`. Without a `visitorId`, every app using the same Brevo widget id and every
store open in one browser is ONE Brevo visitor with ONE conversation, relabelled by whichever page loaded
last. A `visitorId` per app + store gives each its own conversation.

```ts
import { supportChatVisitorId } from "@01ecommerce/shopify-support-chat/server";

const visitorId = supportChatVisitorId({
  secret: process.env.SHOPIFY_API_SECRET ?? "", // a server-only secret: the app's API secret
  app: "example-app", // the same `app` value as Step 3
  shop, // xxx.myshopify.com, from the server session (Step 4)
});
```

- **Server only.** `@01ecommerce/shopify-support-chat/server` imports `node:crypto`. Import it only in
  server code (a loader, a route handler, a `.server.ts` file), never in a component that runs in the
  browser.
- **The secret stays on the server.** Use the app's API secret (or another server-only secret of at least
  16 characters). Pass only the derived id to the page, never the secret.
- **Never compute or invent the id in the browser**, and never use public data (the shop domain, an email,
  a user id) as the id. Brevo: the `visitorId` "must be unique and secret (not available to other users),
  since knowing it could grant access to the conversation".
- It throws on a missing `secret`, `app` or `shop`, or a secret shorter than 16 characters. Derive it only
  when `widgetId` is set, so development without the widget id needs no secret.
- **What changes for merchants:** each app + store starts a new Brevo conversation. An existing anonymous
  conversation is not carried over (Brevo documents no merge). Rotating the secret changes every id, so it
  also starts new conversations.
- How it is derived, for porting to another language: HMAC-SHA256 keyed by the secret over
  `"shopify-support-chat:visitor:v1\n" + <len(app)> + ":" + app + "\n" + <len(shop)> + ":" + shop`, where each
  `<len>` is the field's length in UTF-8 bytes, in decimal; hex; the first 32 characters. Test vector:
  secret `0123456789abcdef0123456789abcdef`, app `example-app`, shop `demo.myshopify.com` gives
  `bc4dd335276f23de8c7edcd3701aed32`.

The loader sets `BrevoConversationsSetup.visitorId` (merged into any existing `BrevoConversationsSetup`)
before it adds the Brevo script. The widget reads it when it starts, so the first call in a page sets the
id and later calls leave it alone; the package never calls Brevo's `restart`. A malformed `visitorId` (not
16 to 128 of `A-Z a-z 0-9 _ -`) throws rather than falling back to the shared anonymous visitor. An empty or
absent `visitorId` keeps Brevo's anonymous visitor, as before 2.2.0. That a `visitorId` per app + store
gives separate Brevo conversations is what Brevo documents; it had not been checked in a live run when 2.2.0
was released, so Verify item 6 checks it.

## Step 6: mount it, for your stack

Mount it **once**, in the layout that wraps every admin page, and nowhere else.

### React Router 7 / Remix embedded app

Put the helper in `app/support-chat.server.ts` (adjust the `authenticate` import path to the app's own
Shopify server module):

```ts
import { supportChatVisitorId } from "@01ecommerce/shopify-support-chat/server";
import { authenticate } from "./shopify.server";

const APP = "example-app"; // Step 3: this app's repository name
const identityCache = new Map<string, { email?: string; merchantName?: string }>();

export async function getSupportChat(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  let identity = identityCache.get(shop);
  if (!identity) {
    try {
      const response = await admin.graphql(`#graphql
        query SupportChatIdentity { shop { name email myshopifyDomain } }`);
      const { data } = await response.json();
      identity = { email: data?.shop?.email ?? undefined, merchantName: data?.shop?.name ?? undefined };
      identityCache.set(shop, identity);
    } catch {
      identity = {}; // a failed query must not break the page: pass `shop` only
    }
  }
  const widgetId = process.env.BREVO_CONVERSATIONS_ID ?? "";
  return {
    widgetId,
    app: APP,
    shop,
    ...identity,
    // Step 5: one Brevo conversation per app + store. Derived here, on the server; the secret never leaves it.
    visitorId: widgetId
      ? supportChatVisitorId({ secret: process.env.SHOPIFY_API_SECRET ?? "", app: APP, shop })
      : undefined,
  };
}
```

In the admin layout route (the one that renders `<AppProvider>`), return it from the loader and render
the component once, inside the provider:

```tsx
import { SupportChat } from "@01ecommerce/shopify-support-chat/react";
import { getSupportChat } from "../support-chat.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // ...the layout's existing loader work (apiKey, etc.)...
  return { /* existing fields, */ chat: await getSupportChat(request) };
};

// inside the layout component, within <AppProvider>:
const { chat } = useLoaderData<typeof loader>();
// ...
<SupportChat {...chat} />
```

`SupportChat` renders nothing and loads the widget from the browser, in an effect. It works even when
the layout renders its children only after mount (the case where version 1 never showed the bubble).

### Next.js

`SupportChat` uses an effect, so it is a client component. Create it once:

```tsx
"use client";
import { SupportChat } from "@01ecommerce/shopify-support-chat/react";

export default function Chat(props: { widgetId: string; app: string; shop?: string; email?: string; merchantName?: string; visitorId?: string }) {
  return <SupportChat {...props} />;
}
```

Render `<Chat {...chat} />` once in the admin layout (a server component), where `chat` is built on the
server from the session as in Step 4, with `widgetId: process.env.BREVO_CONVERSATIONS_ID ?? ""` and the
`visitorId` from Step 5 (computed in the server component, never in the client one).

### Server-rendered HTML strings (Express, plain templates)

```js
import { supportChatTag } from "@01ecommerce/shopify-support-chat";

html += supportChatTag({
  widgetId: process.env.BREVO_CONVERSATIONS_ID,
  app: "example-app",
  shop,
  email,
  merchantName,
  visitorId, // Step 5, derived on the server
});
```

`supportChatTag` returns a `<script>` tag, or `""` when `widgetId` is empty. Values are escaped, so a shop
name cannot break out of the tag. `supportChatScript` returns the same script body without the tag.

Place the tag in `<head>` **after** the `app-bridge.js` script tag
(`https://cdn.shopify.com/shopifycloud/app-bridge.js`). Shopify requires `app-bridge.js` to be the first
script that blocks parsing, and this tag is a blocking script. Its first statement clears Shopify's launch
credentials from the address (see the README's Privacy section) before the widget starts.

### Plain browser code

```js
import { loadSupportChat } from "@01ecommerce/shopify-support-chat";

loadSupportChat({ widgetId, app: "example-app", shop, email, merchantName, visitorId });
```

Safe to call on every page load: the Brevo script is added once and the merchant is identified again on
every call. It returns `false` on the server, with an empty `widgetId`, or when it could not clear Shopify's
launch credentials from the address (then nothing is loaded). `visitorId` comes from the server (Step 5),
for example in the page's server-rendered data.

## Step 7: Content Security Policy, only if the app sets one

If the app sets `script-src`, add the widget host:

```text
script-src https://conversations-widget.brevo.com
```

The loader passes the visitor as an object, so `'unsafe-inline'` is not needed. If the app sets no
CSP, do nothing.

## Step 8: privacy policy

List **Brevo** as a subprocessor in the app's privacy policy. The widget sends the merchant's chat
messages and the visitor properties above to Brevo.

## DO NOT

- **Never on a storefront or in a theme extension.** It fails Shopify app review. Admin pages only.
- **Never pass internal ids** (merchant, tenant or database ids).
- **Never take identity from the query string** or any client-controlled input.
- **Never commit a widget id** into a shared repository.
- **Never compute the `visitorId` in the browser**, never send the secret to the page, and never use the
  shop domain or any other public value as the `visitorId`.
- **Never build a URL by copying the current query string** (`searchParams`, `location.search`,
  `useSearchParams()`). The package clears Shopify's launch credentials (`id_token`, `hmac`, `session`,
  `timestamp`) from the address, but your router still holds the launch URL; a link copied from it puts
  them back. Build every link from the parameters you name.
- **Never hand-edit the GitHub wiki.** It is generated from `README.md` and `docs/`; change those files.
- Do not add `BREVO_CONVERSATIONS_ID` to the CI environment or to development.

## Verify

Run the app with `BREVO_CONVERSATIONS_ID` set to the developer's widget id, open an admin page, and
check each item. Report the result of every one, including a FAIL with what you saw.

| # | Check | Expected | A broken result looks like |
|---|---|---|---|
| 1 | In the browser devtools, **scoped to the app iframe** (the embedded app runs inside an iframe), evaluate `window.BrevoConversationsID`. | Your widget id, exactly. | `undefined` or `""` (the variable is unset, empty, or the layout does not mount `SupportChat`); or you evaluated it in the top Shopify admin frame, not the app iframe. |
| 2 | In the same frame, run `document.querySelectorAll('#brevo-conversations-loader').length`. | `1`, and it is still `1` after navigating to another admin page. | `0` (not mounted, or a CSP blocks the script) or `2` or more (mounted twice, or a second Brevo snippet exists). |
| 3 | Open the bubble and send a test message. Open **your own** Brevo inbox. | The message arrives from a visitor with the email and first name you passed, and with Last name = your `app` value and Notes = `<shop> · UNVERIFIED — set by the browser, not by us. Confirm before acting on it.` (`demo.myshopify.com` style shop). The custom `APP`, `SHOP`, `MERCHANT` and `IDENTITY` keys show only if your Brevo account has contact attributes with those names. | No message (wrong widget id, or a CSP or ad blocker blocks `conversations-widget.brevo.com`); or Last name is empty or Notes lacks the shop (the `app` or `shop` option was not passed), or the visitor has no email or name when you passed them (the package is older than v2.0.3, which nested the fields where Brevo ignores them; Last name and Notes need v2.1.0 or later). |
| 4 | Open a storefront page of the shop and view the page source. | It contains no `brevo`. | Any `brevo` text: the widget is on the storefront. Remove it; this fails app review. |
| 5 | In Safari, open the app, send a message, then reload. | Last name and Notes are still present on the conversation after the reload. | The conversation looks anonymous after the reload (Safari dropped the widget's cookie inside the iframe). Confirm the loader runs on every page load. |
| 6 | In the same app iframe, evaluate `window.BrevoConversationsSetup.visitorId`. Then, in the same browser, open a **second store** (or a second app that uses this package) and send a message from each. | 32 lowercase hex characters, different per store and per app. In your Brevo inbox the two messages are in **two separate conversations**. | `undefined` (Step 5 not done, or `visitorId` not passed to the component); the same id for two stores (the `shop` passed to `supportChatVisitorId` is not the session's shop); or both messages in one conversation. |
| 7 | Open the app from the Shopify admin (so the address carries the launch parameters). In devtools, **Network**, filter **WS**, select the widget's WebSocket, open its **Messages**, and find the `updateClientSession` message. Read its `currentPage`. | `currentPage` holds `shop=` and none of `id_token=`, `hmac=`, `session=` or `timestamp=`. | Any of `id_token=`, `hmac=`, `session=` or `timestamp=` in `currentPage`: the package is older than v2.2.1, or a second Brevo snippet starts the widget before the package does. Remove the other snippet and install v2.2.1 or later. |

## The support-staff rule

Everything the widget sends is set in the browser, so a visitor can fake it. Brevo has no identity
verification, so every conversation carries `UNVERIFIED` in the visitor's Notes field. **Support staff must confirm who they
are talking to, out of band, before acting on a billing or data request.**

## API reference

All exports of `@01ecommerce/shopify-support-chat`:

- `loadSupportChat(opts, win?)`: browser loader; returns `false` on the server, with an empty `widgetId`, or when it could not clear Shopify's launch credentials from the address (then it loads nothing). Every call clears them before the widget starts; so does the script from `supportChatTag` and `supportChatScript`.
- `supportChatTag(opts)`: a `<script>` tag string, or `""` without a `widgetId`.
- `supportChatScript(opts)`: the inline script body without the tag.
- `buildVisitor(opts)`: the flat visitor object passed to Brevo's `updateIntegrationData` (`email`, `firstName`, `lastName`, `notes`, `SHOP`, `MERCHANT`, `APP`, `IDENTITY`). Brevo takes only string, number, boolean or `null` values, with custom properties as top-level keys, so nothing is nested ([Brevo's JavaScript API reference](https://developers.brevo.com/docs/javascript-api-reference)); throws without `app`. `lastName` is the `app` and `notes` is `<shop> · UNVERIFIED…`: standard Brevo fields, shown in the conversation's visitor panel. The custom keys did not show in a live run on an account without matching contact attributes; why is not established. Brevo: "If custom properties set in `updateIntegrationData` match existing contact attributes, they sync with your Contacts database. Otherwise, they're available in Conversations only." Creating those attributes has not been tested.
- `escapeForInlineScript(json)`: makes JSON safe inside an inline script.
- `BREVO_WIDGET_SRC`: the widget script URL. `LOADER_ELEMENT_ID`: the script element id, `brevo-conversations-loader`.
- `IDENTITY_IS_UNVERIFIED`: the label sent as the `IDENTITY` property and in `notes`.

Exports of `@01ecommerce/shopify-support-chat/react`: `SupportChat`, a component that renders nothing.

Exports of `@01ecommerce/shopify-support-chat/server` (server only; it imports `node:crypto`):

- `supportChatVisitorId({ secret, app, shop })`: the `visitorId` for one app + store, 32 lowercase hex
  characters (Step 5). Throws on a missing input or a secret shorter than 16 characters.

The options (type `ChatVisitor`):

| Option | Required | What it is |
|---|---|---|
| `widgetId` | yes (empty = no bubble) | The developer's Brevo Conversations widget id. |
| `app` | yes | A stable, unique id for the app (the repository name). Shown as the visitor's last name (`lastName`) and as `APP`. |
| `shop` | no | `xxx.myshopify.com`, from the server session. Shown in the visitor's notes (`notes`) and as `SHOP`. |
| `email` | no | The store's email, from the server session. |
| `merchantName` | no | Shown as `MERCHANT` and as the visitor's first name (`firstName`). |
| `visitorId` | no (strongly recommended) | Brevo's visitor id: one conversation per app + store. From `supportChatVisitorId` on the server (Step 5). 16 to 128 of `A-Z a-z 0-9 _ -`, or the call throws. Never sent as a visitor property. |

More: [README](https://github.com/01ecommerce/shopify-support-chat/blob/main/README.md),
[CHANGELOG](https://github.com/01ecommerce/shopify-support-chat/blob/main/CHANGELOG.md),
[SECURITY](https://github.com/01ecommerce/shopify-support-chat/blob/main/SECURITY.md).
