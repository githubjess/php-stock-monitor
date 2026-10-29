# JM Authenticator Privacy Policy

`privacy/index.html` is the complete standalone page for:

`https://jegprofil.info/jm-authenticator/privacy/`

It contains inline CSS and system fonts, with no JavaScript, external assets, analytics, trackers, dependencies or connection to Share Monitor. Open the HTML directly in a browser; no build is required. The policy follows the verified privacy-audit findings supplied for this implementation.

## Complete publication details

Replace these clearly marked placeholders with confirmed information:

- `[PUBLISHER LEGAL IDENTITY — TO BE CONFIRMED]`
- `[PRIVACY CONTACT EMAIL — TO BE CONFIRMED]` (two occurrences; use a working privacy contact email)
- `[EFFECTIVE DATE — TO BE CONFIRMED]`

Do not publish or submit this URL to App Store Connect with placeholders remaining. Once the details are complete, remove the visible “Publication details pending” paragraph (`class="status"`) and the `<meta name="robots" content="noindex">` tag and its preceding comment. The noindex tag is a search-engine preference, not access protection.

## Upload to one.com

1. Open the one.com File Manager for `jegprofil.info` and locate its actual document root (called `public_html` in this repository’s main guide).
2. Create `jm-authenticator/privacy/` inside that document root. If a page already exists at the destination, download a backup before replacing it.
3. Upload **only** `privacy/index.html` as `<document-root>/jm-authenticator/privacy/index.html`. Do not upload this README. Do not replace Share Monitor’s root `index.html`, assets, PHP files or any `.htaccess` file.
4. Open `https://jegprofil.info/jm-authenticator/privacy/` and confirm it returns the policy over HTTPS without login. Check the same URL on mobile and desktop, including the contents links and privacy contact. Check that `/jm-authenticator/privacy` redirects to or serves the intended page.
5. Confirm the live page contains no placeholders or draft notice before using its public URL for the App Store submission.

No Share Monitor build or deployment is needed. Existing hosting rules must serve this real directory and its `index.html`. If the URL instead shows Share Monitor or returns an error, inspect the live routing separately; this implementation does not change deployment configuration or `.htaccess` files.

The HTML adds no cookies or tracking. Hosting may still process request information such as IP addresses and server logs; check the actual hosting settings and any site-wide content injection before publication.

No upload, deployment, commit or push was performed.

## Local verification

Verified on 28 October 2026 in the installed Microsoft Edge browser:

- The policy rendered through a local HTTP server at `/jm-authenticator/privacy/` and directly from the HTML file.
- Layout checks passed at 320, 390, 768 and 1440 CSS-pixel widths, with no horizontal overflow; mobile and desktop screenshots were visually inspected.
- Text resized to 200% without horizontal overflow. Keyboard Tab exposed the skip link, and Enter moved focus to the policy. All contents links resolved to existing sections.
- Checked text/background combinations exceeded 4.5:1 contrast (lowest checked ratio: 6.04:1).
- No external page requests occurred. The document contains no scripts, external stylesheets, embedded media or other resource dependencies.
- Hash comparison confirmed all 20 protected Share Monitor source, dependency, development-button and deployment configuration files remained unchanged during this work.

This verifies the local page, not the live one.com routing or a physical iPhone. The three publication placeholders intentionally remain pending confirmation.
