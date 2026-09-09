import { createElement, formField } from "../dom.js";

export function createOnboardingView({
  document = globalThis.document,
  onboardingService,
  onComplete = () => {}
} = {}) {
  const element = createElement(document, "section", { "aria-labelledby": "lp-onboarding-title" });
  const heading = createElement(document, "h3", { id: "lp-onboarding-title", text: "Finish setting up your learner account" });
  const intro = createElement(document, "p", { text: "Enter your learner details to finish setting up your account." });
  const form = createElement(document, "form", { className: "lp-form" });
  const firstName = formField(document, { id: "lp-onboarding-first-name", label: "First name", autocomplete: "given-name" });
  const surname = formField(document, { id: "lp-onboarding-surname", label: "Surname", autocomplete: "family-name" });
  const studentNumber = formField(document, { id: "lp-onboarding-student-number", label: "Student ID", autocomplete: "off" });
  const status = createElement(document, "p", { role: "status", "aria-live": "polite", tabIndex: -1 });
  const submit = createElement(document, "button", { className: "lp-button", type: "submit", text: "Complete setup" });
  const actions = createElement(document, "div", { className: "lp-form__actions" }, submit);
  form.append(firstName.wrapper, surname.wrapper, studentNumber.wrapper, status, actions);
  element.append(heading, intro, form);

  const pending = onboardingService.getPending();
  if (pending) {
    firstName.input.value = pending.firstName || "";
    surname.input.value = pending.surname || "";
    studentNumber.input.value = pending.studentNumber || "";
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
      await onboardingService.complete(details);
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
  return Object.freeze({ element, destroy() { form.removeEventListener("submit", handleSubmit); element.remove(); } });
}
