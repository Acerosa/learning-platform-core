import { createElement, formField } from "../dom.js";
import { createLoadingState } from "../loading/loading-state.js";

export function createOnboardingView({
  document = globalThis.document,
  onboardingService,
  onComplete = () => {}
} = {}) {
  const element = createElement(document, "section", { "aria-labelledby": "lp-onboarding-title" });
  const heading = createElement(document, "h3", { id: "lp-onboarding-title", text: "Finish setting up your learner account" });
  const intro = createElement(document, "p", { text: "Enter your learner details, then choose an available course and group." });
  const form = createElement(document, "form", { className: "lp-form" });
  const firstName = formField(document, { id: "lp-onboarding-first-name", label: "First name", autocomplete: "given-name" });
  const surname = formField(document, { id: "lp-onboarding-surname", label: "Surname", autocomplete: "family-name" });
  const studentNumber = formField(document, { id: "lp-onboarding-student-number", label: "Student ID", autocomplete: "off" });
  const optionWrapper = createElement(document, "div", { className: "lp-form__field" });
  const optionLabel = createElement(document, "label", { htmlFor: "lp-registration-option", text: "Year and group" });
  const select = createElement(document, "select", { id: "lp-registration-option", name: "registrationOption", required: true });
  optionWrapper.append(optionLabel, select);
  const status = createElement(document, "p", { role: "status", "aria-live": "polite", tabIndex: -1 });
  const submit = createElement(document, "button", { className: "lp-button", type: "submit", text: "Complete setup" });
  const actions = createElement(document, "div", { className: "lp-form__actions" }, submit);
  form.append(firstName.wrapper, surname.wrapper, studentNumber.wrapper, optionWrapper, status, actions);
  element.append(heading, intro, form);

  const pending = onboardingService.getPending();
  if (pending) {
    firstName.input.value = pending.firstName || "";
    surname.input.value = pending.surname || "";
    studentNumber.input.value = pending.studentNumber || "";
  }

  async function load() {
    submit.disabled = true;
    optionWrapper.replaceChildren(createLoadingState({ document, message: "Loading available groups…" }));
    try {
      const options = await onboardingService.getRegistrationOptions();
      optionWrapper.replaceChildren(optionLabel, select);
      select.replaceChildren(createElement(document, "option", { value: "", text: "Choose a year and group" }));
      options.forEach((option) => {
        const label = [option.yearGroup, option.groupName || option.groupCode, option.courseTitle].filter(Boolean).join(" — ");
        select.append(createElement(document, "option", { value: option.registrationKey, text: label }));
      });
      select.value = pending?.registrationKey || "";
      submit.disabled = options.length === 0;
      if (options.length === 0) status.textContent = "No registration options are available. Contact your tutor.";
    } catch (error) {
      optionWrapper.replaceChildren(optionLabel, select);
      status.setAttribute("role", "alert");
      status.textContent = error?.learnerMessage || "Registration options could not be loaded. Try again.";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    status.setAttribute("role", "status");
    status.textContent = "Completing setup…";
    submit.disabled = true;
    const details = {
      firstName: firstName.input.value,
      surname: surname.input.value,
      studentNumber: studentNumber.input.value
    };
    try {
      await onboardingService.complete(details, select.value);
      status.textContent = "Your learner account is ready.";
      await onComplete();
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = error?.learnerMessage || "Learner setup could not be completed. Try again.";
      submit.disabled = false;
      status.focus?.();
    }
  }

  form.addEventListener("submit", handleSubmit);
  load();
  return Object.freeze({ element, load, destroy() { form.removeEventListener("submit", handleSubmit); element.remove(); } });
}
