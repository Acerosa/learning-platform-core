import { createElement } from "../dom.js";

export function createToastRegion({ document = globalThis.document, timeoutMs = 6000 } = {}) {
  const element = createElement(document, "div", {
    className: "lp-toast-region",
    "aria-label": "Notifications",
    "aria-live": "polite",
    "aria-relevant": "additions"
  });

  function notify(message, { type = "info", persistent = false } = {}) {
    const toast = createElement(document, "div", {
      className: `lp-toast lp-toast--${type}`,
      role: type === "error" ? "alert" : "status",
      text: String(message)
    });
    element.append(toast);
    if (!persistent && timeoutMs > 0) globalThis.setTimeout?.(() => toast.remove(), timeoutMs);
    return () => toast.remove();
  }

  return Object.freeze({ element, notify, clear: () => element.replaceChildren() });
}
