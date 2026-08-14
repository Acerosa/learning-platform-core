import { createElement } from "../dom.js";
import { createStatusBadge, statusLabel } from "../status-badge/status-badge.js";

function actionLabelFor(state, fallback = "Open activity") {
  if (state === "completed") return "Review activity";
  if (state === "in-progress") return "Resume activity";
  if (state === "not-started") return "Start activity";
  return fallback;
}

export function createActivityCard({
  document = globalThis.document,
  title,
  description = "",
  activityType = "Activity",
  duration = "",
  status = "Not started",
  state,
  href,
  actionLabel,
  badge = false,
  badgeStatus,
  headingLevel = 2
} = {}) {
  const element = createElement(document, "article", { className: "lp-card lp-activity-card" });
  if (state) element.dataset.state = state;
  const headingTag = headingLevel === 3 ? "h3" : "h2";
  const metaParts = [activityType, duration].filter(Boolean);
  if (badge) {
    element.append(createStatusBadge({
      document,
      status: badgeStatus || state || "planned",
      label: typeof status === "string" && status !== "Not started" ? status : undefined
    }));
  }
  if (metaParts.length) {
    element.append(createElement(document, "p", { className: "lp-card__meta", text: metaParts.join(" · ") }));
  }
  element.append(createElement(document, headingTag, { text: title || "Untitled activity" }));
  if (description) element.append(createElement(document, "p", { text: description }));
  const readableStatus = state ? statusLabel(state, status) : status;
  element.append(createElement(document, "p", { className: "lp-card__meta", text: `Status: ${readableStatus}` }));
  if (href) {
    const actions = createElement(document, "div", { className: "lp-card__actions" });
    const label = actionLabel || actionLabelFor(state);
    actions.append(createElement(document, "a", { className: "lp-button", href, text: label }));
    element.append(actions);
  }
  return element;
}
