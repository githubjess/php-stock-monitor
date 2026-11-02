import { catalogs } from "./catalogs.js";
import { initTranslations } from "./translate-page.js";

initTranslations(catalogs);

// Home and Features share this page: highlight Features only while the URL addresses it.
const homeLink = document.querySelector('.jm-header .jm-nav a[href="/"]');
const featuresLink = document.querySelector('.jm-header .jm-nav a[href="#features"]');

function markCurrentSection() {
  const features = window.location.hash === "#features";
  if (features) {
    homeLink.removeAttribute("aria-current");
    featuresLink.setAttribute("aria-current", "location");
  } else {
    homeLink.setAttribute("aria-current", "page");
    featuresLink.removeAttribute("aria-current");
  }
}

markCurrentSection();
window.addEventListener("hashchange", markCurrentSection);
