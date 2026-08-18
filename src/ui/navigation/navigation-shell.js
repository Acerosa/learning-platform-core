import { createElement } from "../dom.js";

export function createNavigationShell({
  document = globalThis.document,
  config,
  currentId = "home",
  currentIds = [],
  themeService = null,
  brandTitle,
  brandTagline,
  actions = null
} = {}) {
  const nav = createElement(document, "nav", { className: "lp-navigation", "aria-label": "Main navigation" });
  const bar = createElement(document, "div", { className: "lp-navigation__bar" });
  const home = config.navigation.find((item) => item.id === "home" && item.enabled);
  const brand = createElement(document, "a", {
    className: "lp-navigation__brand",
    href: home?.path || "./"
  });
  brand.append(createElement(document, "span", {
    className: "lp-navigation__brand-title",
    text: brandTitle || config.hubName
  }));
  if (brandTagline) {
    brand.append(createElement(document, "span", {
      className: "lp-navigation__brand-tagline",
      text: brandTagline
    }));
  }
  const listId = `lp-navigation-list-${config.hubCode}`;
  const toggle = createElement(document, "button", {
    className: "lp-button lp-button--secondary lp-navigation__toggle",
    type: "button",
    text: "Menu",
    "aria-expanded": "false",
    "aria-controls": listId,
    "aria-label": "Open main menu"
  });
  const list = createElement(document, "ul", {
    className: "lp-navigation__list",
    id: listId,
    dataset: { open: "false" }
  });
  const current = new Set([currentId, ...currentIds].filter(Boolean));
  config.navigation.filter((item) => item.enabled).forEach((item) => {
    const link = createElement(document, "a", {
      className: "lp-navigation__link",
      href: item.path,
      text: item.label,
      "aria-current": current.has(item.id) ? "page" : null
    });
    list.append(createElement(document, "li", {}, link));
  });
  bar.append(brand, toggle, list);

  if (themeService) {
    const label = createElement(document, "label", { className: "lp-theme-control", text: "Theme" });
    const select = createElement(document, "select", { "aria-label": "Theme preference" });
    themeService.modes.forEach((mode) => select.append(createElement(document, "option", {
      value: mode,
      text: mode[0].toUpperCase() + mode.slice(1)
    })));
    select.value = themeService.getPreference();
    select.addEventListener("change", () => themeService.setPreference(select.value));
    label.append(select);
    bar.append(label);
  }
  if (actions) {
    actions.classList.add("lp-navigation__actions");
    bar.append(actions);
  }
  nav.append(bar);

  function closeMenu(returnFocus = false) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open main menu");
    list.dataset.open = "false";
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    toggle.setAttribute("aria-label", open ? "Open main menu" : "Close main menu");
    list.dataset.open = String(!open);
  });
  const keyHandler = (event) => {
    if (event.key === "Escape") closeMenu(true);
  };
  nav.addEventListener("keydown", keyHandler);
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu(false);
  });

  return Object.freeze({
    element: nav,
    closeMenu,
    destroy() {
      nav.removeEventListener("keydown", keyHandler);
      nav.remove();
    }
  });
}
