(function (root) {
  "use strict";
  function setAuthoredHtml(element, html) {
    var value = String(html || "");
    if (/<\s*script\b/i.test(value) || /javascript\s*:/i.test(value) || /<\s*iframe\b/i.test(value)) {
      element.textContent = "";
      return false;
    }
    element.innerHTML = value;
    return true;
  }
  root.setAuthoredHtml = setAuthoredHtml;
})(typeof window !== "undefined" ? window : globalThis);
