/** Server-only helpers. Never import this from browser code: it uses `node:crypto`, and its input
 *  is a server secret. The browser entry (`index.js`) does not import it. */
import { createHmac } from "node:crypto";

const MESSAGE_PREFIX = "shopify-support-chat:visitor:v1\n";

function field(name, value) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`supportChatVisitorId: \`${name}\` is required (a non-empty string)`);
  }
  return value;
}

/** A length-prefixed field, `<UTF-8 byte length>:<value>`, so no value can forge a field boundary. */
const lengthPrefixed = (value) => `${Buffer.byteLength(value, "utf8")}:${value}`;

/** The Brevo visitor id for one app + one store: one conversation per app per store, instead of the
 *  one anonymous visitor every app in the Shopify admin shares in a browser.
 *
 *  HMAC-SHA256 keyed by `secret` over
 *    "shopify-support-chat:visitor:v1\n" + <len(app)> + ":" + app + "\n" + <len(shop)> + ":" + shop
 *  (lengths in UTF-8 bytes, decimal), hex, first 32 characters (128 bits).
 *
 *  `secret` is a server-only secret, such as the app's API secret; at least 16 characters. Brevo:
 *  the visitor id "must be unique and secret (not available to other users), since knowing it could
 *  grant access to the conversation". https://developers.brevo.com/docs/javascript-api-reference */
export function supportChatVisitorId({ secret, app, shop } = {}) {
  field("secret", secret);
  if (secret.length < 16) throw new Error("supportChatVisitorId: `secret` must be at least 16 characters");
  const message = MESSAGE_PREFIX + lengthPrefixed(field("app", app)) + "\n" + lengthPrefixed(field("shop", shop));
  return createHmac("sha256", secret).update(message, "utf8").digest("hex").slice(0, 32);
}
