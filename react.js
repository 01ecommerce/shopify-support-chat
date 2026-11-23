import { useEffect } from "react";
import { loadSupportChat } from "./index.js";

/** Mount once in the layout that wraps every admin page.
 *  Loads the widget from the browser, so it works wherever it is mounted,
 *  including layouts that render their children only after mount. */
export function SupportChat({ widgetId, app, shop, email, merchantName }) {
  useEffect(() => {
    loadSupportChat({ widgetId, app, shop, email, merchantName });
  }, [widgetId, app, shop, email, merchantName]);
  return null;
}
