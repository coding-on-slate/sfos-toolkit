const vscode = acquireVsCodeApi();

const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const formEl = document.getElementById("form");

let lastValues = {};

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message && message.type === "setForm") {
    renderForm(message.form);
  }
});

vscode.postMessage({ type: "ready" });

function renderForm(form) {
  lastValues = {};
  titleEl.textContent = form.title || "";
  statusEl.textContent = form.status || "";
  formEl.replaceChildren();

  const readonly = Boolean(form.readonly);
  const fields = Array.isArray(form.fields) ? form.fields : [];

  for (const field of fields) {
    lastValues[field.key] = field.value ?? "";
    const label = document.createElement("label");
    label.textContent = field.label || field.key;
    label.appendChild(createControl(field, readonly, form.commit));
    formEl.appendChild(label);
  }

  if (form.commit === "all") {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "save-button";
    save.textContent = "Save";
    save.disabled = readonly;
    save.addEventListener("click", () => {
      vscode.postMessage({ type: "commitAll", values: collectValues() });
    });
    formEl.appendChild(save);
  }
}

function createControl(field, readonly, commit) {
  if (field.type === "select") {
    const select = document.createElement("select");
    select.dataset.key = field.key;
    const options = Array.isArray(field.options) ? field.options : [];
    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
    if (field.value && !options.some((option) => option.value === field.value)) {
      const fallback = document.createElement("option");
      fallback.value = field.value;
      fallback.textContent = field.value;
      select.appendChild(fallback);
    }
    select.value = field.value ?? "";
    select.disabled = readonly;
    if (commit === "field") {
      select.addEventListener("change", () => commitField(select));
    }
    return select;
  }

  const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
  input.dataset.key = field.key;
  if (field.type !== "textarea") {
    input.type = field.type === "number" ? "number" : "text";
  }
  input.value = field.value ?? "";
  input.disabled = readonly;
  if (commit === "field") {
    input.addEventListener("blur", () => commitField(input));
  }
  return input;
}

function commitField(control) {
  const key = control.dataset.key;
  const value = control.value;
  if (!key || value === lastValues[key]) {
    return;
  }
  vscode.postMessage({ type: "commit", key, value });
}

function collectValues() {
  const values = {};
  formEl.querySelectorAll("[data-key]").forEach((control) => {
    values[control.dataset.key] = control.value;
  });
  return values;
}
