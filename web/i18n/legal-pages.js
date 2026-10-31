// Only reviewed routes are linked. Each language opens the same page in that language.
const impressumLanguages = ["en", "de", "es", "fr", "vi", "zh-Hans", "zh-Hant"];

export const legalPages = {
  privacy: {
    authoritativeLanguage: "en",
    canonicalPath: "/jm-authenticator/privacy/",
    reviewedRoutes: { en: "/jm-authenticator/privacy/" },
  },
  impressum: {
    authoritativeLanguage: "de",
    canonicalPath: "/impressum/",
    reviewedRoutes: Object.fromEntries(impressumLanguages.map((code) => [code, `/impressum/?lang=${code}`])),
  },
};

export function resolveLegalPage(page, language) {
  const entry = legalPages[page];
  if (!entry) return null;
  const resolvedLanguage = entry.reviewedRoutes[language]
    ? language : entry.authoritativeLanguage;
  const href = entry.reviewedRoutes[resolvedLanguage];
  return href ? { href, language: resolvedLanguage } : null;
}
