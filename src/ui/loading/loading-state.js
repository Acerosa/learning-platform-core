import { createElement } from "../dom.js";

export function createLoadingState({ document = globalThis.document, message = "Loading…" } = {}) {
  const element = createElement(document, "div", {
    className: "lp-loading",
    role: "status",
    "aria-live": "polite"
  });
  element.append(
    createElement(document, "span", { className: "lp-loading__spinner", "aria-hidden": "true" }),
    createElement(document, "span", { text: message })
  );
  return element;
}
