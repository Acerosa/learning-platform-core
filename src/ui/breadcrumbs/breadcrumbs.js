import { createElement } from "../dom.js";

export function createBreadcrumbs({
  document = globalThis.document,
  items = [],
  resolveHref
} = {}) {
  const nav = createElement(document, "nav", {
    className: "lp-breadcrumbs",
    "aria-label": "Breadcrumb"
  });
  if (!items.length) {
    nav.hidden = true;
    return nav;
  }
  const list = createElement(document, "ol", { className: "lp-breadcrumbs__list" });
  items.forEach((item, index) => {
    const last = index === items.length - 1;
    const li = createElement(document, "li");
    const href = item.href || (item.path != null && item.path !== "" && resolveHref ? resolveHref(item.path) : item.path);
    if (last || !href) {
      li.append(createElement(document, "span", { text: item.label || "", "aria-current": "page" }));
    } else {
      li.append(createElement(document, "a", { href, text: item.label || "" }));
    }
    list.append(li);
  });
  nav.append(list);
  return nav;
}
