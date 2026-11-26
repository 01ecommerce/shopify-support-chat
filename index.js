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
 *  ones (email, firstName, lastName, notes), so nothing is nested.
 *
 *  The app and the store go into the standard `lastName` and `notes` fields, because those show in
 *  the conversation's visitor panel. The custom keys (SHOP, MERCHANT, APP, IDENTITY) did not show in a
 *  live run on an account without matching contact attributes (why is not established). Brevo says custom properties that match
 *  existing contact attributes sync to Contacts, "Otherwise, they're available in Conversations only". Undefined fields are omitted, never sent as null
 *  (null removes a property Brevo already holds).
 *  https://developers.brevo.com/docs/javascript-api-reference */
export function buildVisitor({ app, shop, email, merchantName }) {
  if (!app) throw new Error("buildVisitor: `app` is required (a stable unique id for your app)");
  return omitUndefined({
    email,
    firstName: merchantName,
    lastName: app,
    notes: [shop, IDENTITY_IS_UNVERIFIED].filter(Boolean).join(" · "),
    SHOP: shop,
    MERCHANT: merchantName,
    APP: app,
    IDENTITY: IDENTITY_IS_UNVERIFIED,
  });
}

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** `visitorId` is optional: undefined, null or "" means none (the widget's own anonymous visitor).
 *  Anything else must match VISITOR_ID_PATTERN, or this throws: a malformed id must never silently
 *  fall back to the anonymous visitor every app in the browser shares. */
function checkVisitorId(visitorId, caller) {
  if (visitorId === undefined || visitorId === null || visitorId === "") return undefined;
  if (typeof visitorId !== "string" || !VISITOR_ID_PATTERN.test(visitorId)) {
    throw new Error(
      `${caller}: \`visitorId\` must be 16 to 128 characters of A-Z, a-z, 0-9, _ or - ` +
        "(derive it on the server with supportChatVisitorId from @01ecommerce/shopify-support-chat/server)",
    );
  }
  return visitorId;
}

/** The query parameters Shopify adds to an embedded app's address when the admin opens it, that are
 *  credentials: the session token (`id_token`, a JWT), and the launch signature and its inputs. */
const LAUNCH_CREDENTIALS = ["id_token", "hmac", "session", "timestamp"];

/** The widget reports `location.href` to its vendor as the current page, so the address must not hold
 *  Shopify's launch credentials when it starts. Drops every query pair whose decoded key is in `names`
 *  or whose decoded value is shaped like a JWT, keeps every other pair byte for byte and in order, and
 *  keeps `history.state` (the router's) and the hash. Nothing to drop: no history call.
 *  Returns false when the address could not be cleared: the caller must then load nothing.
 *
 *  Self-contained ES5 with no outer references and no `URL`: `supportChatScript` inlines its source. */
function stripLaunchCredentials(w, names) {
  var jwt = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
  function decode(text) {
    try {
      return decodeURIComponent(text);
    } catch (e) {
      return text;
    }
  }
  function isCredential(pair) {
    var at = pair.indexOf("=");
    var key = decode(at === -1 ? pair : pair.slice(0, at));
    var value = at === -1 ? "" : decode(pair.slice(at + 1));
    return names.indexOf(key) !== -1 || jwt.test(value);
  }
  function pairs() {
    var search = String((w.location && w.location.search) || "").replace(/^\?/, "");
    return search === "" ? [] : search.split("&");
  }
  var all = pairs();
  var kept = all.filter(function (pair) {
    return !isCredential(pair);
  });
  if (kept.length === all.length) return true;
  try {
    w.history.replaceState(
      w.history.state,
      "",
      w.location.pathname + (kept.length ? "?" + kept.join("&") : "") + w.location.hash
    );
  } catch (e) {
    return false;
  }
  return !pairs().some(isCredential);
}

/** Load the widget from the browser and identify the merchant.
 *  Safe to call on every page load or render: the script is added once, the
 *  merchant is identified again on each call (the widget's cookie can drop
 *  inside a third-party iframe).
 *  `visitorId` goes into `BrevoConversationsSetup` (merged, never replaced) before the script is
 *  added, and only by the call that adds it: Brevo reads its settings when the widget starts, so the
 *  first call in a page sets the id and later calls leave it alone. Nothing calls Brevo's `restart`.
 *  Before the script is added, on every call, Shopify's launch credentials (`id_token`, `hmac`,
 *  `session`, `timestamp`, and any JWT-shaped value) are cleared from the address with
 *  `history.replaceState`, because the widget reports the page address to its vendor.
 *  Returns false when there is no `window` (server render), no widget id, or the address could not be
 *  cleared (then nothing is loaded and no one is identified). */
export function loadSupportChat(opts, win = globalThis.window) {
  if (!win) return false;
  const { widgetId } = opts;
  if (!widgetId) return false;
  const visitor = buildVisitor(opts);
  const visitorId = checkVisitorId(opts.visitorId, "loadSupportChat");
  // Fail closed: if the launch credentials cannot be cleared, nothing loads and no one is identified.
  if (!stripLaunchCredentials(win, LAUNCH_CREDENTIALS)) return false;
  const doc = win.document;

  win.BrevoConversationsID = widgetId;
  win.BrevoConversations =
    win.BrevoConversations ||
    function () {
      (win.BrevoConversations.q = win.BrevoConversations.q || []).push(arguments);
    };

  if (!doc.getElementById(LOADER_ELEMENT_ID)) {
    if (visitorId) (win.BrevoConversationsSetup = win.BrevoConversationsSetup || {}).visitorId = visitorId;
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
 *  With `visitorId`, it sets `BrevoConversationsSetup.visitorId` (merged) before adding the script.
 *  Its first statement clears Shopify's launch credentials from the address, as `loadSupportChat` does,
 *  and stops (loads nothing) if it cannot.
 *  Returns "" when widgetId is empty, so dev/CI get no bubble. */
export function supportChatScript(opts) {
  const { widgetId } = opts;
  if (!widgetId) return "";
  if (!opts.app) throw new Error("supportChatScript: `app` is required (a stable unique id for your app)");
  const visitor = escapeForInlineScript(JSON.stringify(buildVisitor(opts)));
  const visitorId = checkVisitorId(opts.visitorId, "supportChatScript");
  const setup = visitorId
    ? `\n  (w.BrevoConversationsSetup=w.BrevoConversationsSetup||{}).visitorId=${escapeForInlineScript(JSON.stringify(visitorId))};`
    : "";
  return `(function(d,w,c){
  if(!(${String(stripLaunchCredentials)})(w,${JSON.stringify(LAUNCH_CREDENTIALS)}))return;
  w.BrevoConversationsID=${escapeForInlineScript(JSON.stringify(widgetId))};${setup}
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
