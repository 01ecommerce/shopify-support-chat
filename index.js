/** Brevo Conversations support chat for Shopify app admin pages
 *  (merchant -> the app's developer).
 *
 *  Admin pages only. Never render on a storefront: that fails app review.
 *
 *  The visitor attributes are set in the browser, so they are a CLAIM, not a
 *  fact. Brevo has no identity verification, so they are labelled UNVERIFIED
 *  in the support panel. Never send internal ids (merchant or tenant ids).
 */

export const BREVO_WIDGET_SRC = "https://conversations-widget.brevo.com/brevo-conversations.js";
export const LOADER_ELEMENT_ID = "brevo-conversations-loader";

export const IDENTITY_IS_UNVERIFIED =
  "UNVERIFIED — set by the browser, not by us. Confirm before acting on it.";

/** JSON.stringify leaves `<` alone, so a shop name containing `</script>`
 *  would break out of an inline script. These escapes stay valid JSON. */
export function escapeForInlineScript(json) {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** The object Brevo's `updateIntegrationData` takes: ONE flat object. Brevo accepts only String,
 *  Number, Boolean or null values, and custom properties are top-level keys beside the standard
 *  ones (email, firstName), so nothing is nested. Undefined fields are omitted, never sent as null
 *  (null removes a property Brevo already holds).
 *  https://developers.brevo.com/docs/javascript-api-reference */
export function buildVisitor({ app, shop, email, merchantName }) {
  if (!app) throw new Error("buildVisitor: `app` is required (a stable unique id for your app)");
  return omitUndefined({
    email,
    firstName: merchantName,
    SHOP: shop,
    MERCHANT: merchantName,
    APP: app,
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
}

/** Load the widget from the browser and identify the merchant.
 *  Safe to call on every page load or render: the script is added once, the
 *  merchant is identified again on each call (the widget's cookie can drop
 *  inside a third-party iframe).
 *  Returns false when there is no `window` (server render) or no widget id. */
export function loadSupportChat(opts, win = globalThis.window) {
  if (!win) return false;
  const { widgetId } = opts;
  if (!widgetId) return false;
  const visitor = buildVisitor(opts);
  const doc = win.document;

  win.BrevoConversationsID = widgetId;
  win.BrevoConversations =
    win.BrevoConversations ||
    function () {
      (win.BrevoConversations.q = win.BrevoConversations.q || []).push(arguments);
    };

  if (!doc.getElementById(LOADER_ELEMENT_ID)) {
    const s = doc.createElement("script");
    s.async = true;
    s.src = BREVO_WIDGET_SRC;
    s.id = LOADER_ELEMENT_ID;
    doc.head.appendChild(s);
  }

  win.BrevoConversations("updateIntegrationData", visitor);
  return true;
}

/** The inline script body that loads the widget and identifies the merchant.
 *  Returns "" when widgetId is empty, so dev/CI get no bubble. */
export function supportChatScript(opts) {
  const { widgetId } = opts;
  if (!widgetId) return "";
  if (!opts.app) throw new Error("supportChatScript: `app` is required (a stable unique id for your app)");
  const visitor = escapeForInlineScript(JSON.stringify(buildVisitor(opts)));
  return `(function(d,w,c){
  w.BrevoConversationsID=${escapeForInlineScript(JSON.stringify(widgetId))};
  w[c]=w[c]||function(){(w[c].q=w[c].q||[]).push(arguments)};
  var s=d.createElement('script');s.async=true;
  s.src='${BREVO_WIDGET_SRC}';
  s.id='${LOADER_ELEMENT_ID}';
  d.head.appendChild(s);
  w[c]('updateIntegrationData',${visitor});
})(document,window,'BrevoConversations');`;
}

/** Full `<script>` tag, for apps that render HTML strings (Express, plain templates). */
export function supportChatTag(opts) {
  const js = supportChatScript(opts);
  return js ? `<script>${js}</script>` : "";
}
