import { createElement } from "../dom.js";
import { createLearningOutcomeBadge } from "../learning-outcome-badge/learning-outcome-badge.js";
import { createStatusBadge } from "../status-badge/status-badge.js";

export function createWeekHeader({
  document = globalThis.document,
  teachingWeek,
  title = "",
  subtitle = "",
  status,
  learningOutcomes = [],
  headingLevel = 1,
  showTitle = true
} = {}) {
  const element = createElement(document, "header", { className: "lp-week-header" });
  if (status) element.append(createStatusBadge({ document, status }));
  if (showTitle) {
    const headingText = teachingWeek
      ? `Week ${teachingWeek}${title ? `: ${title}` : ""}`
      : (title || "Week");
    const level = headingLevel === 2 ? "h2" : "h1";
    element.append(createElement(document, level, { text: headingText }));
  } else if (teachingWeek) {
    element.append(createElement(document, "p", {
      className: "lp-week-header__kicker",
      text: `Teaching week ${teachingWeek}`
    }));
  }
  if (subtitle) {
    element.append(createElement(document, "p", { className: "lp-week-header__subtitle", text: subtitle }));
  }
  if (learningOutcomes.length) {
    const list = createElement(document, "ul", { className: "lp-week-header__outcomes" });
    learningOutcomes.forEach((outcome) => {
      const item = createElement(document, "li");
      item.append(createLearningOutcomeBadge({
        document,
        id: outcome.id,
        title: outcome.title
      }));
      list.append(item);
    });
    element.append(list);
  }
  return element;
}
