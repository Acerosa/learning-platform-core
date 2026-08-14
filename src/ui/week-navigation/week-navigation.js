import { createElement } from "../dom.js";

export function createWeekNavigation({
  document = globalThis.document,
  previousWeek,
  nextWeek
} = {}) {
  if (!previousWeek?.href && !nextWeek?.href) return null;
  const nav = createElement(document, "nav", {
    className: "lp-week-nav",
    "aria-label": "Week"
  });
  const list = createElement(document, "ul", { className: "lp-week-nav__list" });
  if (previousWeek?.href) {
    list.append(createElement(document, "li", {}, [
      createElement(document, "a", {
        className: "lp-text-link",
        href: previousWeek.href,
        text: previousWeek.label || "Previous week",
        rel: "prev"
      })
    ]));
  }
  if (nextWeek?.href) {
    list.append(createElement(document, "li", {}, [
      createElement(document, "a", {
        className: "lp-text-link",
        href: nextWeek.href,
        text: nextWeek.label || "Next week",
        rel: "next"
      })
    ]));
  }
  nav.append(list);
  return nav;
}
