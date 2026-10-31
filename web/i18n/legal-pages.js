// Reviewed documents and local-only drafts are deliberately separate.
// A draft route is not approval to publish its legal text or translations.
export const legalPages = {
  privacy: {
    authoritativeLanguage: "en",
    canonicalPath: "/jm-authenticator/privacy/",
    reviewedRoutes: { en: "/jm-authenticator/privacy/" },
  },
  impressum: {
    authoritativeLanguage: "de",
    canonicalPath: "/impressum/",
    reviewedRoutes: {},
    draftLanguages: ["en", "de", "es", "fr", "vi", "zh-Hans", "zh-Hant"],
  },
};

export function resolveLegalPage(page, language) {
  const entry = legalPages[page];
  if (!entry) return null;
  const resolvedLanguage = entry.reviewedRoutes[language]
    ? language : entry.authoritativeLanguage;
  const href = entry.reviewedRoutes[resolvedLanguage];
  if (href) return { href, language: resolvedLanguage };
  if (entry.draftLanguages) {
    const draftLanguage = entry.draftLanguages.includes(language) ? language : entry.authoritativeLanguage;
    return { href: `${entry.canonicalPath}?lang=${draftLanguage}`, language: draftLanguage, draft: true };
  }
  return null;
}
