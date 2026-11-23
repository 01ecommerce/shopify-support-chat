export type ChatVisitor = {
  /** Brevo Conversations widget id. Empty = no bubble. */
  widgetId: string;
  /** Which app the merchant is writing from: "loyalty", "reviews", ... */
  app: string;
  /** xxx.myshopify.com, from the server session (never from the query string). */
  shop?: string;
  email?: string;
  merchantName?: string;
};
export const IDENTITY_IS_UNVERIFIED: string;
export function escapeForInlineScript(json: string): string;
export function supportChatScript(opts: ChatVisitor): string;
export function supportChatTag(opts: ChatVisitor): string;
