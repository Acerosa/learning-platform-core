import { createElement } from "../dom.js";

export function createActivityCard({
  document = globalThis.document,
  title,
  description = "",
  activityType = "Activity",
  duration = "",
  status = "Not started",
  href
} = {}) {
  const element = createElement(document, "article", { className: "lp-card lp-activity-card" });
  element.append(
    createElement(document, "p", { className: "lp-card__meta", text: [activityType, duration].filter(Boolean).join(" · ") }),
    createElement(document, "h2", { text: title || "Untitled activity" })
  );
  if (description) element.append(createElement(document, "p", { text: description }));
  element.append(createElement(document, "p", { className: "lp-card__meta", text: `Status: ${status}` }));
  if (href) {
    const actions = createElement(document, "div", { className: "lp-card__actions" });
    actions.append(createElement(document, "a", { className: "lp-button", href, text: "Open activity" }));
    element.append(actions);
  }
  return element;
}
