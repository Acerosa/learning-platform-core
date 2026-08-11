import { createElement, formField } from "../dom.js";
import { createModal } from "../modal/modal.js";
import { createOnboardingView } from "../onboarding/onboarding-view.js";

export function createAccountDialog({
  document = globalThis.document,
  authService,
  learnerContext,
  onboardingService
} = {}) {
  const modal = createModal({ document, id: "lp-account-dialog", title: "Learner account" });
  let mode = "sign-in";
  let onboardingView = null;

  function buildAuthView() {
    const container = createElement(document, "div");
    const tabs = createElement(document, "div", { className: "lp-auth-tabs", role: "tablist", "aria-label": "Account options" });
    const signInTab = createElement(document, "button", { type: "button", role: "tab", text: "Sign in", "aria-selected": "true" });
    const registerTab = createElement(document, "button", { type: "button", role: "tab", text: "Create account", "aria-selected": "false" });
    tabs.append(signInTab, registerTab);

    const form = createElement(document, "form", { className: "lp-form", noValidate: true });
    const firstName = formField(document, { id: "lp-register-first-name", label: "First name", autocomplete: "given-name" });
    const surname = formField(document, { id: "lp-register-surname", label: "Surname", autocomplete: "family-name" });
    const studentNumber = formField(document, { id: "lp-register-student-number", label: "Student ID", autocomplete: "off" });
    const email = formField(document, { id: "lp-account-email", label: "Email address", type: "email", autocomplete: "username" });
    const password = formField(document, { id: "lp-account-password", label: "Password", type: "password", autocomplete: "current-password" });
    password.input.minLength = 8;
    const confirmation = formField(document, { id: "lp-account-password-confirm", label: "Confirm password", type: "password", autocomplete: "new-password" });
    confirmation.input.minLength = 8;
    const status = createElement(document, "p", { className: "lp-form__status", role: "status", "aria-live": "polite", tabIndex: -1 });
    const submit = createElement(document, "button", { className: "lp-button", type: "submit", text: "Sign in" });
    form.append(
      firstName.wrapper,
      surname.wrapper,
      studentNumber.wrapper,
      email.wrapper,
      password.wrapper,
      confirmation.wrapper,
      status,
      createElement(document, "div", { className: "lp-form__actions" }, submit)
    );
    container.append(tabs, form);

    function setMode(next) {
      mode = next === "register" ? "register" : "sign-in";
      const registering = mode === "register";
      firstName.wrapper.hidden = !registering;
      surname.wrapper.hidden = !registering;
      studentNumber.wrapper.hidden = !registering;
      confirmation.wrapper.hidden = !registering;
      password.input.autocomplete = registering ? "new-password" : "current-password";
      submit.textContent = registering ? "Create account" : "Sign in";
      signInTab.setAttribute("aria-selected", String(!registering));
      registerTab.setAttribute("aria-selected", String(registering));
      status.textContent = "";
    }

    async function continueAfterAuthentication() {
      await learnerContext.refresh();
      if (learnerContext.getState().status === "onboarding-required") showOnboarding();
      else modal.close();
    }

    async function handleSubmit(event) {
      event.preventDefault();
      submit.disabled = true;
      status.setAttribute("role", "status");
      status.textContent = mode === "register" ? "Creating your account…" : "Signing in…";
      try {
        if (mode === "register") {
          const details = {
            firstName: firstName.input.value,
            surname: surname.input.value,
            studentNumber: studentNumber.input.value,
            email: email.input.value,
            password: password.input.value,
            confirmPassword: confirmation.input.value
          };
          const accountCheck = onboardingService.validateAccount(details);
          const profileCheck = onboardingService.validateProfile(details);
          if (!accountCheck.ok || !profileCheck.ok) {
            const failure = new Error("Registration details are invalid.");
            failure.code = accountCheck.code || profileCheck.code;
            throw failure;
          }
          onboardingService.savePending(details);
          const result = await authService.signUp(accountCheck.value.email, accountCheck.value.password);
          password.input.value = "";
          confirmation.input.value = "";
          if (result.needsConfirmation) {
            setMode("sign-in");
            email.input.value = accountCheck.value.email;
            status.textContent = "Check your email to confirm the account, then return here and sign in.";
            return;
          }
          await continueAfterAuthentication();
        } else {
          await authService.signIn(email.input.value, password.input.value);
          password.input.value = "";
          await continueAfterAuthentication();
        }
      } catch (error) {
        status.setAttribute("role", "alert");
        status.textContent = error?.learnerMessage || messageFor(error?.code);
        status.focus();
      } finally {
        submit.disabled = false;
      }
    }

    signInTab.addEventListener("click", () => setMode("sign-in"));
    registerTab.addEventListener("click", () => setMode("register"));
    form.addEventListener("submit", handleSubmit);
    setMode(mode);
    return container;
  }

  function messageFor(code) {
    const messages = {
      INVALID_EMAIL: "Enter a valid email address.",
      WEAK_PASSWORD: "Choose a password with at least 8 characters.",
      PASSWORD_MISMATCH: "Passwords do not match.",
      INVALID_FIRST_NAME: "Enter your first name.",
      INVALID_SURNAME: "Enter your surname.",
      INVALID_STUDENT_NUMBER: "Enter your Student ID."
    };
    return messages[code] || "The account request could not be completed. Check your details and try again.";
  }

  function showOnboarding() {
    onboardingView?.destroy();
    onboardingView = createOnboardingView({
      document,
      onboardingService,
      onComplete: () => modal.close()
    });
    modal.body.replaceChildren(onboardingView.element);
  }

  function open(trigger) {
    if (authService.isSignedIn() && learnerContext.getState().status === "onboarding-required") showOnboarding();
    else modal.body.replaceChildren(buildAuthView());
    modal.open(trigger);
  }

  return Object.freeze({
    element: modal.element,
    open,
    close: modal.close,
    showOnboarding,
    destroy() { onboardingView?.destroy(); modal.destroy(); }
  });
}
