import { catalogs as websiteCatalogs } from "./catalogs.js";
import { initTranslations } from "./translate-page.js";

// These are manually authored resources, not runtime machine translations.
// The German version is authoritative; the operator approved all seven versions.
const legalCatalogs = import.meta.glob("../locales/impressum/*.json", {
  eager: true, import: "default",
});
const catalogs = Object.fromEntries(Object.entries(websiteCatalogs).map(([code, common]) => [
  code, { ...common, ...legalCatalogs[`../locales/impressum/${code}.json`] },
]));
initTranslations(catalogs, { titleKey: "legal.pageTitle", queryLanguage: true });
