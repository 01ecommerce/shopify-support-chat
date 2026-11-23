import { createElement } from "react";
import { supportChatScript } from "./index.js";

/** Mount once in the layout that wraps every admin page. */
export function SupportChat(props) {
  const __html = supportChatScript(props);
  if (!__html) return null;
  return createElement("script", { suppressHydrationWarning: true, dangerouslySetInnerHTML: { __html } });
}
