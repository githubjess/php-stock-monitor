import { resolveLegalPage } from "./legal-pages.js";

export function initTranslations(catalogs, { titleKey = "page.title", queryLanguage = false } = {}) {
  const preferenceKey = "jm-authenticator:website-language";
  const selector = document.getElementById("jm-language");

  function supported(language) {
    return Object.hasOwn(catalogs, language) ? language : "en";
  }

  function applyLanguage(requested) {
    const language = supported(requested);
    const messages = catalogs[language];
    const message = (key) => messages[key] ?? catalogs.en[key];
    document.documentElement.lang = language;
    document.title = message(titleKey);
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = message(element.dataset.i18n);
    });
    // Update only the direct text node, keeping icons, line breaks and accents.
    document.querySelectorAll("[data-i18n-text]").forEach((element) => {
      const node = [...element.childNodes].find((child) =>
        child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (node) node.textContent = `${message(element.dataset.i18nText)} `;
    });
    for (const attribute of ["aria-label", "alt", "content"]) {
      document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
        element.setAttribute(attribute, message(element.getAttribute(`data-i18n-${attribute}`)));
      });
    }
    document.querySelectorAll("a[data-legal-page]").forEach((link) => {
      const target = resolveLegalPage(link.dataset.legalPage, language);
      if (target) {
        link.setAttribute("href", target.href);
        link.setAttribute("hreflang", target.language);
      }
    });
    selector.value = language;
  }

  let initialLanguage = "en";
  try { initialLanguage = supported(localStorage.getItem(preferenceKey)); }
  catch { /* Storage may be disabled; the selector still works for this visit. */ }
  if (queryLanguage) {
    const requested = new URL(window.location.href).searchParams.get("lang");
    if (Object.hasOwn(catalogs, requested)) initialLanguage = requested;
  }
  applyLanguage(initialLanguage);

  selector.addEventListener("change", () => {
    const language = supported(selector.value);
    applyLanguage(language);
    if (queryLanguage) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", language);
      window.history.replaceState(null, "", url);
    }
    try { localStorage.setItem(preferenceKey, language); }
    catch { /* Do not block language selection when persistence is unavailable. */ }
  });

  // A hidden selector cannot leave unusable controls when JavaScript is disabled.
  selector.closest(".jm-language").hidden = false;
}
