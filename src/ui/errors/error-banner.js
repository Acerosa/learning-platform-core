import { createElement } from "../dom.js";

export function createErrorBanner({ document = globalThis.document, heading = "There is a problem", message = "Try again." } = {}) {
  const element = createElement(document, "section", {
    className: "lp-error-banner",
    role: "alert",
    tabIndex: -1
  });
  element.append(
    createElement(document, "h2", { text: heading }),
    createElement(document, "p", { text: message })
  );
  return element;
}
