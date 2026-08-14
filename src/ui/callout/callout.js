import { createElement } from "../dom.js";

const TONES = Object.freeze(["info", "success", "warning", "error"]);

export function createCallout({
  document = globalThis.document,
  tone = "info",
  title,
  message
} = {}) {
  const resolved = TONES.includes(tone) ? tone : "info";
  const element = createElement(document, "aside", {
    className: `lp-callout lp-callout--${resolved}`,
    role: resolved === "error" ? "alert" : null
  });
  if (title) element.append(createElement(document, "strong", { text: title }));
  if (message) element.append(createElement(document, "p", { text: message }));
  return element;
}
