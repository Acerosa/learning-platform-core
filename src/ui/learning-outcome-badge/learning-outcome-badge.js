import { createElement } from "../dom.js";

export function createLearningOutcomeBadge({
  document = globalThis.document,
  id,
  title
} = {}) {
  const label = [id, title].filter(Boolean).join(" ");
  return createElement(document, "span", {
    className: "lp-outcome-badge",
    text: label || "Learning outcome"
  });
}
