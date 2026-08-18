import { createElement } from "../dom.js";
import { SESSION_KIND_LABELS, SESSION_KINDS } from "../contracts.js";

export function createSessionSection({
  document = globalThis.document,
  id,
  title,
  kind = "session",
  summary = "",
  defaultOpen = false,
  meta,
  children = []
} = {}) {
  const resolvedKind = SESSION_KINDS.includes(kind) ? kind : "session";
  const details = createElement(document, "details", {
    className: "lp-session lp-panel",
    id,
    dataset: { kind: resolvedKind }
  });
  details.open = Boolean(defaultOpen);
  const kindLabel = SESSION_KIND_LABELS[resolvedKind];
  const summaryEl = createElement(document, "summary", { className: "lp-session__summary" });
  const text = createElement(document, "span", { className: "lp-session__text" });
  text.append(
    createElement(document, "h2", { className: "lp-session__heading", text: title || kindLabel }),
    createElement(document, "span", { className: "lp-session__meta", text: meta || kindLabel })
  );
  summaryEl.append(text);
  const content = createElement(document, "div", { className: "lp-session__content" });
  if (summary) content.append(createElement(document, "p", { className: "lp-panel-note", text: summary }));
  const list = createElement(document, "div", { className: "lp-activity-list" });
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach((child) => list.append(child));
  content.append(list);
  details.append(summaryEl, content);
  return details;
}
