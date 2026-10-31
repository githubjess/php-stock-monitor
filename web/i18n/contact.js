import { catalogs as websiteCatalogs } from "./catalogs.js";
import { initTranslations } from "./translate-page.js";

const contactCatalogs = import.meta.glob("../locales/contact/*.json", { eager: true, import: "default" });
const catalogs = Object.fromEntries(Object.entries(websiteCatalogs).map(([code, common]) => [
  code, { ...common, ...contactCatalogs[`../locales/contact/${code}.json`] },
]));
initTranslations(catalogs, { titleKey: "contact.pageTitle", queryLanguage: true });

const form = document.getElementById("jm-contact-form");
const button = form.querySelector("button[type=submit]");
const status = document.getElementById("contact-status");
const fields = ["name", "email", "subject", "message"].map((name) => form.elements.namedItem(name));
const formSelector = document.getElementById("jm-form-language");
let formLanguage = document.documentElement.lang;
let pending = false;
let result = null;
const text = (key) => (catalogs[formLanguage] ?? catalogs.en)[`contact.${key}`];

function renderFormLanguage() {
  const messages = catalogs[formLanguage] ?? catalogs.en;
  form.lang = formLanguage;
  form.querySelectorAll("[data-form-i18n]").forEach((element) => {
    element.textContent = messages[element.getAttribute("data-form-i18n")];
  });
  for (const attribute of ["placeholder", "aria-label"]) {
    form.querySelectorAll(`[data-form-i18n-${attribute}]`).forEach((element) => {
      element.setAttribute(attribute, messages[element.getAttribute(`data-form-i18n-${attribute}`)]);
    });
  }
  renderState();
}

function renderState() {
  formSelector.value = formLanguage;
  button.textContent = text(pending ? "sending" : "send");
  button.disabled = pending;
  fields.forEach((field) => { field.disabled = pending; });
  form.setAttribute("aria-busy", String(pending));
  status.hidden = result === null;
  status.textContent = result ? text(result) : "";
  status.dataset.state = result === "accepted" ? "success" : "error";
}

function validateField(field) {
    field.setCustomValidity("");
    const value = field.value.trim();
    const limit = Number(field.maxLength);
    const controls = field.name === "message" ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
    if (!value) field.setCustomValidity(text("requiredError"));
    else if ([...value].length > limit || controls.test(value)) field.setCustomValidity(text("fieldError"));
    else if (field.name === "email" && (field.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[^\x21-\x7e]/.test(value))) {
      field.setCustomValidity(text("emailError"));
    }
}

function validate() {
  fields.forEach(validateField);
  return form.checkValidity();
}

fields.forEach((field) => field.addEventListener("input", () => field.setCustomValidity("")));
formSelector.addEventListener("change", () => {
  formLanguage = Object.hasOwn(catalogs, formSelector.value) ? formSelector.value : "en";
  // Change only form copy and existing validation errors, never visitor values or site preferences.
  fields.filter((field) => field.validity.customError).forEach(validateField);
  renderFormLanguage();
});
form.noValidate = true;
renderFormLanguage();
form.querySelector(".jm-contact-toolbar").hidden = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) return;
  if (!validate()) {
    result = "invalid";
    renderState();
    form.reportValidity();
    return;
  }
  const payload = Object.fromEntries(new FormData(form));
  pending = true;
  result = null;
  renderState();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: "omit",
    });
    const data = await response.json();
    if (response.ok && data.code === "accepted") {
      result = "accepted";
      form.reset();
    } else {
      result = response.status === 429 ? "rate" : data.code === "invalid" ? "invalid" : "unavailable";
    }
  } catch {
    // A lost response cannot establish whether mail was accepted. Never retry automatically.
    result = "unavailable";
  } finally {
    clearTimeout(timer);
    pending = false;
    renderState();
    status.focus();
  }
});
