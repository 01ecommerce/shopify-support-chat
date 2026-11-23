# shopify-support-chat

The Brevo Conversations chat bubble from the loyalty app, packaged so any of our
Shopify apps can add it. Merchants use it to message us from the **app admin**.
Never put it on a storefront.

All apps share one widget id, `6a855703dd6e8294c20f34e8`, so every chat lands in
one inbox. The `APP` attribute shows which app the merchant wrote from.

## Add it to an app

1. Install:
   ```sh
   npm install github:01ecommerce/shopify-support-chat
   # or, local only (breaks Docker/CI builds that can't see the sibling folder):
   npm install ../shopify-support-chat
   ```
2. Env: `BREVO_CONVERSATIONS_ID=6a855703dd6e8294c20f34e8`. Leave it unset in dev and CI so no bubble shows.
3. Mount it once, in the layout that wraps every admin page.

**React / Remix / Next**
```tsx
import { SupportChat } from "@exc/shopify-support-chat/react";

// loader: widgetId: process.env.BREVO_CONVERSATIONS_ID ?? "", shop: session.shop, email
<SupportChat widgetId={chat.widgetId} app="reviews" shop={chat.shop} email={chat.email} merchantName={shop.name} />
```

**Anything that renders HTML strings**
```js
import { supportChatTag } from "@exc/shopify-support-chat";
html += supportChatTag({ widgetId: process.env.BREVO_CONVERSATIONS_ID, app: "reviews", shop, email, merchantName });
```

## Rules
- `app` is required. Set it per app: `loyalty`, `reviews`, `dashboard`, `buildingcode`, and so on.
- Take `shop` and `email` from the server session. Never take them from the query string.
- Never send internal merchant or tenant ids.
- Everything the widget sends is set in the browser, so it can be faked. Brevo cannot verify it, so the panel shows `IDENTITY: UNVERIFIED`. Confirm who you're talking to before acting on billing or data requests.
- If the app sets a CSP `script-src`, allow `https://conversations-widget.brevo.com`.
- List Brevo as a subprocessor in the app's privacy policy.
- In an embedded app, test in Safari. The widget's cookie can drop inside the admin iframe, which is why the merchant is identified again on every page load.

Background: `loyalty-platform-copy/docs/SUPPORT-CHAT.md`.

## Test
`npm test` (uses `node:test`, no dependencies).
