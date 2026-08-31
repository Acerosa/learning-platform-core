/**
 * Approved authored-HTML rendering for trusted teaching markup.
 *
 * This is a refuse-list, not a general HTML sanitiser. Unsafe constructs are
 * rejected as a whole. Safe markup is assigned through this helper only.
 */

const SCRIPT = /<\s*script\b/i;
const IFRAME = /<\s*iframe\b/i;
const OBJECT = /<\s*object\b/i;
const EMBED = /<\s*embed\b/i;
const SRCDOC = /\bsrcdoc\s*=/i;
const JS_URL = /javascript\s*:/i;
const DATA_HTML = /data\s*:\s*text\s*\/\s*html/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;

export function isUnsafeAuthoredHtml(html) {
  const value = String(html || "");
  return (
    SCRIPT.test(value)
    || IFRAME.test(value)
    || OBJECT.test(value)
    || EMBED.test(value)
    || SRCDOC.test(value)
    || JS_URL.test(value)
    || DATA_HTML.test(value)
    || EVENT_ATTR.test(value)
  );
}

function clearElement(element) {
  if (typeof element.replaceChildren === "function") {
    element.replaceChildren();
    return;
  }
  element.textContent = "";
}

export function setAuthoredHtml(element, html) {
  if (!element) return false;
  const value = html == null ? "" : String(html);
  if (element.dataset) delete element.dataset.lpHtmlRejected;
  if (isUnsafeAuthoredHtml(value)) {
    clearElement(element);
    if (element.dataset) element.dataset.lpHtmlRejected = "true";
    return false;
  }
  element.innerHTML = value;
  return true;
}
