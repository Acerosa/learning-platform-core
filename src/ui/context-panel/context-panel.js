import { createElement, labelledValue } from "../dom.js";
import { CONTEXT_TYPES } from "../contracts.js";

export function createContextPanel({
  document = globalThis.document,
  contextType = "assignment",
  heading = "Context",
  items = [],
  description = "",
  action
} = {}) {
  const type = CONTEXT_TYPES.includes(contextType) ? contextType : "assignment";
  const headingId = `lp-context-${type}`;
  const element = createElement(document, "section", {
    className: `lp-context-panel lp-panel lp-context-panel--${type}`,
    "aria-labelledby": headingId,
    dataset: { contextType: type }
  });
  element.append(createElement(document, "h2", { id: headingId, text: heading }));
  if (items.length) {
    const list = createElement(document, "dl", { className: "lp-meta-list" });
    items.forEach((item) => list.append(labelledValue(document, item.label, item.value)));
    element.append(list);
  }
  if (description) element.append(createElement(document, "p", { text: description }));
  if (action?.label && action?.href) {
    const paragraph = createElement(document, "p");
    paragraph.append(createElement(document, "a", {
      className: "lp-text-link",
      href: action.href,
      text: action.label
    }));
    element.append(paragraph);
  }
  return element;
}
