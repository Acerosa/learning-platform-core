import { createElement } from "../dom.js";
import { createBreadcrumbs } from "../breadcrumbs/breadcrumbs.js";
import { createLearnerHeader } from "../learner-header/learner-header.js";
import { createNavigationShell } from "../navigation/navigation-shell.js";

export function createHubShell({
  document = globalThis.document,
  config,
  currentId = "home",
  currentIds = [],
  themeService = null,
  brandTitle,
  brandTagline,
  actions = null,
  breadcrumbs,
  pageHeader,
  footer,
  skipLabel = "Skip to main content",
  mainId = "main-content",
  learnerHeader,
  learnerContext,
  authService
} = {}) {
  const shell = createElement(document, "div", { className: "lp-shell" });
  const skip = createElement(document, "a", {
    className: "lp-skip-link",
    href: `#${mainId}`,
    text: skipLabel
  });
  const banner = createElement(document, "header", {
    className: "lp-shell__banner",
    role: "banner"
  });
  const navigation = createNavigationShell({
    document,
    config,
    currentId,
    currentIds,
    themeService,
    brandTitle,
    brandTagline,
    actions
  });
  banner.append(navigation.element);

  const headerController = learnerHeader || (learnerContext && authService
    ? createLearnerHeader({ document, learnerContext, authService, config })
    : null);
  const learnerMount = createElement(document, "div", { className: "lp-shell__learner" });
  if (headerController?.element) learnerMount.append(headerController.element);

  const crumbNode = breadcrumbs?.element
    || (Array.isArray(breadcrumbs?.items)
      ? createBreadcrumbs({ document, items: breadcrumbs.items, resolveHref: breadcrumbs.resolveHref })
      : breadcrumbs)
    || null;

  let intro = null;
  if (pageHeader?.title) {
    intro = createElement(document, "header", { className: "lp-page-header" });
    intro.append(createElement(document, "h1", { text: pageHeader.title }));
    if (pageHeader.subtitle) {
      intro.append(createElement(document, "p", { className: "lp-page-header__subtitle", text: pageHeader.subtitle }));
    }
  }

  const main = createElement(document, "main", {
    className: "lp-shell__main",
    id: mainId,
    tabIndex: -1
  });

  const footerEl = createElement(document, "footer", {
    className: "lp-shell__footer",
    role: "contentinfo"
  });
  if (footer?.element) footerEl.append(footer.element);
  else if (Array.isArray(footer?.lines)) {
    footer.lines.forEach((line) => footerEl.append(createElement(document, "p", { text: line })));
  }

  shell.append(skip, banner, learnerMount);
  if (crumbNode) shell.append(crumbNode);
  if (intro) shell.append(intro);
  shell.append(main, footerEl);

  return Object.freeze({
    element: shell,
    main,
    footer: footerEl,
    navigation,
    destroy() {
      navigation.destroy();
      headerController?.destroy?.();
      shell.remove();
    }
  });
}
