/** Server only: imports `node:crypto`. Never import it from browser code. */
export type VisitorIdInput = {
  /** A server-only secret, such as the app's API secret. At least 16 characters. Never sent to the browser. */
  secret: string;
  /** The same `app` value you pass to the chat. */
  app: string;
  /** The store's `xxx.myshopify.com`, from the server session. */
  shop: string;
};

/** The Brevo visitor id for this app + store: 32 lowercase hex characters, the first 32 of
 *  HMAC-SHA256(secret, "shopify-support-chat:visitor:v1\n<len>:<app>\n<len>:<shop>"), lengths in UTF-8
 *  bytes. Pass it to the page as the `visitorId` option. Throws on a missing input or a short secret. */
export function supportChatVisitorId(opts: VisitorIdInput): string;
