import { createElement } from "../dom.js";

export function createNavigationShell({
  document = globalThis.document,
  config,
  currentId = "home",
  themeService = null
} = {}) {
  const nav = createElement(document, "nav", { className: "lp-navigation", "aria-label": "Main navigation" });
  const bar = createElement(document, "div", { className: "lp-navigation__bar" });
  const home = config.navigation.find((item) => item.id === "home" && item.enabled);
  const brand = createElement(document, "a", {
    className: "lp-navigation__brand",
    href: home?.path || "./",
    text: config.hubName
  });
  const toggle = createElement(document, "button", {
    className: "lp-button lp-button--secondary lp-navigation__toggle",
    type: "button",
    text: "Menu",
    "aria-expanded": "false",
    "aria-controls": `lp-navigation-list-${config.hubCode}`
  });
  const list = createElement(document, "ul", {
    className: "lp-navigation__list",
    id: `lp-navigation-list-${config.hubCode}`,
    dataset: { open: "false" }
  });
  config.navigation.filter((item) => item.enabled).forEach((item) => {
    const link = createElement(document, "a", {
      className: "lp-navigation__link",
      href: item.path,
      text: item.label,
      "aria-current": item.id === currentId ? "page" : null
    });
    list.append(createElement(document, "li", {}, link));
  });
  bar.append(brand, toggle, list);

  if (themeService) {
    const label = createElement(document, "label", { text: "Theme" });
    const select = createElement(document, "select", { "aria-label": "Theme preference" });
    themeService.modes.forEach((mode) => select.append(createElement(document, "option", { value: mode, text: mode[0].toUpperCase() + mode.slice(1) })));
    select.value = themeService.getPreference();
    select.addEventListener("change", () => themeService.setPreference(select.value));
    label.append(select);
    bar.append(label);
  }
  nav.append(bar);

  function closeMenu(returnFocus = false) {
    toggle.setAttribute("aria-expanded", "false");
    list.dataset.open = "false";
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    list.dataset.open = String(!open);
  });
  const keyHandler = (event) => { if (event.key === "Escape") closeMenu(true); };
  nav.addEventListener("keydown", keyHandler);

  return Object.freeze({ element: nav, closeMenu, destroy() { nav.removeEventListener("keydown", keyHandler); nav.remove(); } });
}
