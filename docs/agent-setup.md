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
npm install https://codeload.github.com/01ecommerce/shopify-support-chat/tar.gz/refs/tags/v2.0.2
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
`example-app`). It appears to support as the `APP` attribute, which is how the developer tells apps
apart when one Brevo inbox serves several. Do not use a display name that can change, and do not use a
short generic slug. A call without `app` throws.

## Step 4: identity, from the server session only

The options are `widgetId`, `app`, `shop`, `email` and `merchantName`. `shop`, `email` and
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

## Step 5: mount it, for your stack

Mount it **once**, in the layout that wraps every admin page, and nowhere else.

### React Router 7 / Remix embedded app

Put the helper in `app/support-chat.server.ts` (adjust the `authenticate` import path to the app's own
Shopify server module):

```ts
import { authenticate } from "./shopify.server";

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
  return {
    widgetId: process.env.BREVO_CONVERSATIONS_ID ?? "",
    app: "example-app", // Step 3: this app's repository name
    shop,
    ...identity,
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

export default function Chat(props: { widgetId: string; app: string; shop?: string; email?: string; merchantName?: string }) {
  return <SupportChat {...props} />;
}
```

Render `<Chat {...chat} />` once in the admin layout (a server component), where `chat` is built on the
server from the session as in Step 4, with `widgetId: process.env.BREVO_CONVERSATIONS_ID ?? ""`.

### Server-rendered HTML strings (Express, plain templates)

```js
import { supportChatTag } from "@01ecommerce/shopify-support-chat";

html += supportChatTag({
  widgetId: process.env.BREVO_CONVERSATIONS_ID,
  app: "example-app",
  shop,
  email,
  merchantName,
});
```

`supportChatTag` returns a `<script>` tag, or `""` when `widgetId` is empty. Values are escaped, so a shop
name cannot break out of the tag. `supportChatScript` returns the same script body without the tag.

### Plain browser code

```js
import { loadSupportChat } from "@01ecommerce/shopify-support-chat";

loadSupportChat({ widgetId, app: "example-app", shop, email, merchantName });
```

Safe to call on every page load: the Brevo script is added once and the merchant is identified again on
every call. It returns `false` on the server or with an empty `widgetId`.

## Step 6: Content Security Policy, only if the app sets one

If the app sets `script-src`, add the widget host:

```text
script-src https://conversations-widget.brevo.com
```

The loader passes the visitor as an object, so `'unsafe-inline'` is not needed. If the app sets no
CSP, do nothing.

## Step 7: privacy policy

List **Brevo** as a subprocessor in the app's privacy policy. The widget sends the merchant's chat
messages and the attributes above to Brevo.

## DO NOT

- **Never on a storefront or in a theme extension.** It fails Shopify app review. Admin pages only.
- **Never pass internal ids** (merchant, tenant or database ids).
- **Never take identity from the query string** or any client-controlled input.
- **Never commit a widget id** into a shared repository.
- **Never hand-edit the GitHub wiki.** It is generated from `README.md` and `docs/`; change those files.
- Do not add `BREVO_CONVERSATIONS_ID` to the CI environment or to development.

## Verify

Run the app with `BREVO_CONVERSATIONS_ID` set to the developer's widget id, open an admin page, and
check each item. Report the result of every one, including a FAIL with what you saw.

| # | Check | Expected | A broken result looks like |
|---|---|---|---|
| 1 | In the browser devtools, **scoped to the app iframe** (the embedded app runs inside an iframe), evaluate `window.BrevoConversationsID`. | Your widget id, exactly. | `undefined` or `""` (the variable is unset, empty, or the layout does not mount `SupportChat`); or you evaluated it in the top Shopify admin frame, not the app iframe. |
| 2 | In the same frame, run `document.querySelectorAll('#brevo-conversations-loader').length`. | `1`, and it is still `1` after navigating to another admin page. | `0` (not mounted, or a CSP blocks the script) or `2` or more (mounted twice, or a second Brevo snippet exists). |
| 3 | Open the bubble and send a test message. Open **your own** Brevo inbox. | The message arrives with the attributes `APP` (your `app` value), `SHOP` (`demo.myshopify.com` style) and `IDENTITY: UNVERIFIED`. | No message (wrong widget id, or a CSP or ad blocker blocks `conversations-widget.brevo.com`); or `APP` or `SHOP` is missing (the option was not passed). |
| 4 | Open a storefront page of the shop and view the page source. | It contains no `brevo`. | Any `brevo` text: the widget is on the storefront. Remove it; this fails app review. |
| 5 | In Safari, open the app, send a message, then reload. | The attributes (`SHOP`, `APP`) are still present on the conversation after the reload. | The conversation looks anonymous after the reload (Safari dropped the widget's cookie inside the iframe). Confirm the loader runs on every page load. |

## The support-staff rule

Everything the widget sends is set in the browser, so a visitor can fake it. Brevo has no identity
verification, so every conversation shows `IDENTITY: UNVERIFIED`. **Support staff must confirm who they
are talking to, out of band, before acting on a billing or data request.**

## API reference

All exports of `@01ecommerce/shopify-support-chat`:

- `loadSupportChat(opts, win?)`: browser loader; returns `false` on the server or with an empty `widgetId`.
- `supportChatTag(opts)`: a `<script>` tag string, or `""` without a `widgetId`.
- `supportChatScript(opts)`: the inline script body without the tag.
- `buildVisitor(opts)`: the visitor object passed to Brevo's `updateIntegrationData`; throws without `app`.
- `escapeForInlineScript(json)`: makes JSON safe inside an inline script.
- `BREVO_WIDGET_SRC`: the widget script URL. `LOADER_ELEMENT_ID`: the script element id, `brevo-conversations-loader`.
- `IDENTITY_IS_UNVERIFIED`: the label sent as the `IDENTITY` attribute.

Exports of `@01ecommerce/shopify-support-chat/react`: `SupportChat`, a component that renders nothing.

The options (type `ChatVisitor`):

| Option | Required | What it is |
|---|---|---|
| `widgetId` | yes (empty = no bubble) | The developer's Brevo Conversations widget id. |
| `app` | yes | A stable, unique id for the app (the repository name). Shown as `APP`. |
| `shop` | no | `xxx.myshopify.com`, from the server session. Shown as `SHOP`. |
| `email` | no | The store's email, from the server session. |
| `merchantName` | no | Shown as `MERCHANT` and as the visitor's first name. |

More: [README](https://github.com/01ecommerce/shopify-support-chat/blob/main/README.md),
[CHANGELOG](https://github.com/01ecommerce/shopify-support-chat/blob/main/CHANGELOG.md),
[SECURITY](https://github.com/01ecommerce/shopify-support-chat/blob/main/SECURITY.md).
