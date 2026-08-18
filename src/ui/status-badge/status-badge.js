import { createElement } from "../dom.js";

const TONE_BY_STATUS = Object.freeze({
  available: "available",
  active: "available",
  planned: "planned",
  archived: "planned",
  "coming-soon": "planned",
  "not-started": "planned",
  "in-progress": "progress",
  progress: "progress",
  completed: "completed"
});

const LABEL_BY_STATUS = Object.freeze({
  available: "Available",
  active: "Available",
  planned: "Planned",
  archived: "Archived",
  "coming-soon": "Planned",
  "not-started": "Not started",
  "in-progress": "In progress",
  progress: "In progress",
  completed: "Completed"
});

export function statusTone(status) {
  return TONE_BY_STATUS[status] || "planned";
}

export function statusLabel(status, fallback = "") {
  return LABEL_BY_STATUS[status] || fallback || String(status || "Planned");
}

export function createStatusBadge({
  document = globalThis.document,
  status = "planned",
  label,
  marker = true
} = {}) {
  const tone = statusTone(status);
  const element = createElement(document, "span", {
    className: `lp-status-badge lp-status-badge--${tone}`,
    role: "status"
  });
  if (marker) {
    element.append(createElement(document, "span", { "aria-hidden": "true", text: "●" }));
    element.append(document.createTextNode(" "));
  }
  element.append(document.createTextNode(label || statusLabel(status)));
  return element;
}
