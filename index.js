/** Brevo Conversations support chat for our Shopify apps (merchant → us).
 *  Lifted from loyalty-platform-copy/dashboard/app/components/SupportChat.tsx.
 *
 *  Admin pages only. Never render on a storefront: that fails app review.
 *
 *  The visitor attributes are set in the browser, so they are a CLAIM, not a
 *  fact. Brevo has no identity verification, so we label them UNVERIFIED in
 *  the support panel instead. Never send internal ids (merchant/tenant UUIDs).
 */

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

/** The inline script body that loads the widget and identifies the merchant.
 *  Returns "" when widgetId is empty, so dev/CI get no bubble. */
export function supportChatScript({ widgetId, app, shop, email, merchantName }) {
  if (!widgetId) return "";
  if (!app) throw new Error("supportChatScript: `app` is required (e.g. 'loyalty')");
  const visitor = escapeForInlineScript(JSON.stringify({
    email,
    firstName: merchantName,
    attributes: { SHOP: shop, MERCHANT: merchantName, APP: app, IDENTITY: IDENTITY_IS_UNVERIFIED },
  }));
  return `(function(d,w,c){
  w.BrevoConversationsID=${escapeForInlineScript(JSON.stringify(widgetId))};
  w[c]=w[c]||function(){(w[c].q=w[c].q||[]).push(arguments)};
  var s=d.createElement('script');s.async=true;
  s.src='https://conversations-widget.brevo.com/brevo-conversations.js';
  d.head.appendChild(s);
  w[c]('updateIntegrationData',${visitor});
})(document,window,'BrevoConversations');`;
}

/** Full `<script>` tag, for apps that render HTML strings (Express, Liquid-free templates). */
export function supportChatTag(opts) {
  const js = supportChatScript(opts);
  return js ? `<script>${js}</script>` : "";
}
