import { createElement } from "../dom.js";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function createModal({ document = globalThis.document, id = "lp-dialog", title = "Dialog" } = {}) {
  const dialog = createElement(document, "dialog", {
    id,
    className: "lp-dialog",
    "aria-labelledby": `${id}-title`
  });
  const header = createElement(document, "header", { className: "lp-dialog__header" });
  const heading = createElement(document, "h2", { id: `${id}-title`, text: title });
  const closeButton = createElement(document, "button", {
    className: "lp-dialog__close",
    type: "button",
    text: "Close",
    "aria-label": `Close ${title}`
  });
  const body = createElement(document, "div", { className: "lp-dialog__body" });
  header.append(heading, closeButton);
  dialog.append(header, body);
  let returnFocus = null;

  function close() {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    returnFocus?.focus?.();
  }

  function open(trigger = document.activeElement) {
    returnFocus = trigger;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    (dialog.querySelector(FOCUSABLE) || dialog).focus?.();
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll(FOCUSABLE));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  closeButton.addEventListener("click", close);
  dialog.addEventListener("keydown", handleKeydown);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });

  return Object.freeze({
    element: dialog,
    body,
    heading,
    open,
    close,
    setTitle(value) { heading.textContent = value; closeButton.setAttribute("aria-label", `Close ${value}`); },
    destroy() { dialog.removeEventListener("keydown", handleKeydown); dialog.remove(); }
  });
}
