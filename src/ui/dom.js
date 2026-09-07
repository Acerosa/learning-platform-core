export function createElement(document, tag, options = {}, children = []) {
  const element = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "dataset") Object.assign(element.dataset, value);
    else if (key === "hidden") element.hidden = Boolean(value);
    else if (key in element && key !== "role") element[key] = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  });
  const list = Array.isArray(children) ? children : [children];
  list.filter(Boolean).forEach((child) => element.append(child));
  return element;
}

export function labelledValue(document, label, value) {
  const wrapper = createElement(document, "div");
  wrapper.append(
    createElement(document, "dt", { text: label }),
    createElement(document, "dd", { text: value })
  );
  return wrapper;
}

export function formField(document, { id, label, type = "text", name = id, autocomplete, required = true, hint } = {}) {
  const wrapper = createElement(document, "div", { className: "lp-form__field" });
  const labelElement = createElement(document, "label", { htmlFor: id, text: label });
  const input = createElement(document, "input", { id, name, type, autocomplete, required });
  wrapper.append(labelElement);
  let hintElement = null;
  if (hint) {
    const hintId = `${id}-hint`;
    hintElement = createElement(document, "p", { id: hintId, className: "lp-form__hint", text: hint });
    input.setAttribute("aria-describedby", hintId);
    wrapper.append(hintElement);
  }
  wrapper.append(input);
  return { wrapper, input, hintElement };
}
