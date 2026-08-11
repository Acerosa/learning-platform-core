import { createElement } from "../dom.js";

export function createProgressCard({ document = globalThis.document, title, completed = 0, total = 0, description = "" } = {}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0));
  const percentage = safeTotal ? Math.round((safeCompleted / safeTotal) * 100) : 0;
  const element = createElement(document, "article", { className: "lp-card lp-progress-card" });
  element.append(createElement(document, "h2", { text: title || "Progress" }));
  if (description) element.append(createElement(document, "p", { className: "lp-card__meta", text: description }));
  element.append(
    createElement(document, "progress", {
      className: "lp-progress",
      max: safeTotal || 1,
      value: safeCompleted,
      "aria-label": `${percentage}% complete`
    }),
    createElement(document, "p", { text: `${safeCompleted} of ${safeTotal} complete (${percentage}%)` })
  );
  return element;
}
