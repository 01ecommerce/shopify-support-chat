export type ChatVisitor = {
  /** Brevo Conversations widget id. Empty = no bubble. */
  widgetId: string;
  /** A stable, unique id for your app (suggest the repo name). Shown to support as the APP property. */
  app: string;
  /** xxx.myshopify.com, from the server session (never from the query string). */
  shop?: string;
  /** The store's email, from the server session. */
  email?: string;
  merchantName?: string;
};

/** What Brevo's `updateIntegrationData` receives: one flat object of string values (Brevo accepts only
 *  String, Number, Boolean or null, and takes custom properties as top-level keys). Nothing is nested.
 *  https://developers.brevo.com/docs/javascript-api-reference */
export type BrevoVisitor = {
  email?: string;
  firstName?: string;
  SHOP?: string;
  MERCHANT?: string;
  APP: string;
  IDENTITY: string;
};

/** The minimal slice of `window` the loader uses. */
export type ChatWindow = {
  document: {
    head: { appendChild(el: unknown): unknown };
    createElement(tag: string): any;
    getElementById(id: string): unknown;
  };
  [key: string]: any;
};

export const BREVO_WIDGET_SRC: string;
export const LOADER_ELEMENT_ID: string;
export const IDENTITY_IS_UNVERIFIED: string;
export function escapeForInlineScript(json: string): string;
export function buildVisitor(opts: Omit<ChatVisitor, "widgetId"> & { widgetId?: string }): BrevoVisitor;
/** Browser loader. Returns false on the server or with an empty widgetId. Throws without `app`. */
export function loadSupportChat(opts: ChatVisitor, win?: ChatWindow | undefined): boolean;
export function supportChatScript(opts: ChatVisitor): string;
export function supportChatTag(opts: ChatVisitor): string;
