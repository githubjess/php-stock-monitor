# Website languages

The homepage uses flat, stable translation keys in seven UTF-8 JSON catalogs
under `web/locales/`. Keep every catalog's keys synchronized with `en.json`.
Brand names and the native language names in the selector remain unchanged.
The existing English HTML is the fallback when JavaScript is unavailable.

The shared `translate-page.js` updates text nodes, document language/title, description metadata,
image alternative text and accessibility labels without replacing icons or
screenshots. The native select supplies platform keyboard navigation, selection
highlighting and touch behavior. Flags are Unicode characters, not image files.

Only an explicit selection writes `jm-authenticator:website-language` to local
storage. New visitors default to English; browser language is not consulted.
Unsupported saved values fall back to English. If storage is unavailable, the
selection still works for the current page. Share Monitor preferences are separate.

## Legal content integration

`legal-pages.js` separates reviewed routes from local draft routes. A locale
falls back to a reviewed document's authoritative language when necessary. The
Privacy Policy keeps its existing English URL and publication placeholders.
The Impressum has local draft routes at `/impressum/?lang=<code>`; its reviewed
route map remains empty. Navigation retains a pending badge.

`impressum.js` combines shared navigation messages with the separate, manually
authored draft catalogs in `locales/impressum/`. No runtime translation service is
used. These legal translations are not claimed to be legally reviewed. The German
draft is authoritative and directly available at `/impressum/?lang=de`, even when
another website language is saved. An explicit legal-page query controls that
visit without overwriting the saved preference; using the selector saves it and
updates the query so refresh preserves the selection.

All legal versions retain a draft notice, placeholders and `noindex, nofollow`.
See `impressum/README.md` for the publication blockers. Adding a local draft route
does not approve publication; move it to reviewed routes only after approval.
