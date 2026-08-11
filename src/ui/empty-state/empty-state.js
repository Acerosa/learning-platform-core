import { createElement } from "../dom.js";

export function createEmptyState({ document = globalThis.document, heading = "Nothing to show yet", message = "Check again later.", action } = {}) {
  const element = createElement(document, "section", { className: "lp-empty-state" });
  element.append(
    createElement(document, "h2", { text: heading }),
    createElement(document, "p", { text: message })
  );
  if (action?.label && action?.href) {
    element.append(createElement(document, "a", { className: "lp-button", href: action.href, text: action.label }));
  }
  return element;
}
