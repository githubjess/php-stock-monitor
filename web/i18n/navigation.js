import { catalogs } from "./catalogs.js";
import { initTranslations } from "./translate-page.js";

initTranslations(catalogs, {
  root: document.querySelector(".jm-policy-navigation"),
  updateDocument: false,
});
