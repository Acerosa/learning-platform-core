import { createElement, labelledValue } from "../dom.js";

export function createLearnerHeader({ document = globalThis.document, learnerContext, authService, config } = {}) {
  const element = createElement(document, "section", {
    className: "lp-learner-header",
    "aria-label": "Learner account",
    hidden: true
  });
  let lastContext = null;

  function render(state) {
    if (state?.context) lastContext = state.context;
    if (state?.status === "signed-out") lastContext = null;
    if (!lastContext) {
      element.hidden = true;
      element.replaceChildren();
      return;
    }
    const details = createElement(document, "dl", { className: "lp-learner-header__details" });
    details.append(
      labelledValue(document, "Learner", lastContext.fullName || lastContext.displayName),
      labelledValue(document, "Year group", lastContext.yearGroup || lastContext.academicYear || "Not set"),
      labelledValue(document, "Email", lastContext.contactEmail || "Not set"),
      labelledValue(document, "Current hub", config.hubName)
    );
    const actions = createElement(document, "div", { className: "lp-learner-header__actions" });
    const account = createElement(document, "a", { href: config.accountPath, text: "Account" });
    const signOut = createElement(document, "button", { className: "lp-button lp-button--secondary", type: "button", text: "Sign out" });
    signOut.addEventListener("click", () => authService.signOut());
    actions.append(account, signOut);
    element.replaceChildren(details, actions);
    element.hidden = false;
  }

  const unsubscribe = learnerContext.subscribe(render);
  return Object.freeze({ element, render, destroy() { unsubscribe(); element.remove(); } });
}
