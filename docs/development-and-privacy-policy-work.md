# Share Monitor development environment and JM Authenticator privacy page

Documented on 29 October 2026. This records the work completed on 28–29 October 2026 in `D:\DEV\WORKSPACE\VisualCode\php-stock-monitor`.

## Work completed

1. Diagnosed missing market data and repaired the local PHP/React development launch flow.
2. Implemented the standalone JM Authenticator Privacy Policy using the supplied privacy-audit findings.
3. Made a copy available through the existing Vite development server.
4. Replaced the privacy email placeholders in both HTML files with clickable links to `privacy@jegprofil.info`.

No one.com deployment, Flutter project changes, commits or pushes were performed as part of this work. The privacy page was implemented independently of Share Monitor’s React and PHP application.

## Development environment repairs

### Problems found

- PHP had no loaded `php.ini`, and neither cURL nor OpenSSL was enabled. Market-data HTTPS requests could not run.
- The PHP stream-request implementation lacked a response-header fallback for older PHP versions and needed to use the final HTTP status after redirects.
- The UI concealed useful request-error details.
- VS Code start-button sequences passed workspace paths without enabling the installed multi-command extension’s variable substitution.
- Both stop buttons sent Ctrl+C to whichever terminal was active, rather than targeting their respective services.
- Frontend startup sent dependency installation and server startup as separate terminal commands without checking installation success.
- Two Node/npm directories were on PATH. PowerShell executable discovery could return multiple `npm.cmd` paths.
- Workspace `tasks.json` and `launch.json` files were absent. Debugger configuration was not needed for the launch-button repair.

### Resulting configuration

| File | Purpose |
| --- | --- |
| [VS Code settings](../.vscode/settings.json) | Preserves the four status-bar buttons and maps their multi-command sequences to named tasks. |
| [VS Code tasks](../.vscode/tasks.json) | Starts services in dedicated terminals with explicit PowerShell commands, working directories and local tool paths; limits each task to one instance. |
| [Extension recommendations](../.vscode/extensions.json) | Lists `anweber.statusbar-commands` and `ryuta46.multi-command`. Both were already installed. |
| [PHP launcher](../php-api/start.ps1) | Selects one PHP executable, enables bundled HTTPS extensions when necessary, checks support and starts PHP on port 8080. |
| [Frontend launcher](../web/start.ps1) | Selects one `npm.cmd`, checks dependencies, installs them if needed, and starts Vite on port 5173 with strict port selection. |
| [Market-data implementation](../php-api/src/MarketData.php) | Includes the HTTP response-header compatibility and redirect-status fixes. |
| [Frontend API helper](../web/src/api.js) | Includes backend error details when supplied. |
| [Share Monitor UI](../web/src/App.jsx) | Displays a shared failure reason when failed quote requests have the same cause. |

The HTTP and error-display fixes belong to the initial market-data repair. Subsequent environment and privacy-page work preserved Share Monitor’s application behavior.

The task environment prioritizes `D:\DEV\TOOLS\php` and `C:\WORK\TOOLS\nodejs`. These are machine-specific development paths; review them if moving the checkout to another computer. The repair did not remove the other Node installation or alter the global PATH.

| Existing button | Result |
| --- | --- |
| 🟢 Backend | Runs the `Share Monitor: Backend` task on port 8080. |
| 🛑 Stop Backend | Terminates only the backend task. |
| 🔵 Frontend | Runs the `Share Monitor: Frontend` task on port 5173. |
| 🛑 Stop Frontend | Terminates only the frontend task. |

### Development verification

The installed tools were PHP 8.5.12, Node.js 20.18.0 and npm 10.8.2. Project dependencies and both button extensions were present; no additional tool installation was needed.

An isolated VS Code extension host exercised the configured button commands. Both services started, React JSX was transformed and served, and Vite’s API proxy reached PHP. A live AAPL quote and 288 history points were returned. Each stop button left the other service running, and backend restart passed. The frontend production build and PHP syntax checks also passed.

The retained [development verification report](../.vscode/development-verification.json) records the integration-test results. These are historical checks, not a guarantee that services or remote market-data endpoints are currently available.

## JM Authenticator Privacy Policy

### Files and addresses

| Item | Location |
| --- | --- |
| Original deployment page | [deploy/jm-authenticator/privacy/index.html](../deploy/jm-authenticator/privacy/index.html) |
| Vite public copy | [web/public/jm-authenticator/privacy/index.html](../web/public/jm-authenticator/privacy/index.html) |
| Standalone upload guide | [deploy/jm-authenticator/README.md](../deploy/jm-authenticator/README.md) |
| Local preview | `http://localhost:5173/jm-authenticator/privacy/` |
| Intended publication address | `https://jegprofil.info/jm-authenticator/privacy/` |

The intended publication address is a target, not confirmation of a live deployment.

The page uses inline CSS, system fonts, responsive layouts, section navigation, a keyboard skip link and print styling. It requires no JavaScript, third-party resources, analytics, trackers, additional dependencies, React or PHP.

### Policy content

The supplied audit findings were used to describe:

- Local code generation, no required JM registration, and no identified developer-operated analytics, advertising, tracking, telemetry or remote crash reporting.
- Apple Keychain protection for vault secrets, account information and processed icons, with Keychain synchronization disabled; local preferences and backup history.
- Selected images and camera-created account icons, inclusion of processed icons in encrypted backups, retention of selected original photos, and best-effort cleanup of temporary camera files.
- Apple device authentication, no app access to biometric templates, optional app locking, fresh authentication for Google-compatible QR export, and no additional prompt on the separate single-account setup QR screen.
- Password-encrypted JM backups, passwords not saved by the app, local internal backups, user-selected external destinations, cloud-provider policies and the sensitivity of exported QR secrets.
- System clipboard use, iOS local-only copies with an expiry of at most 30 seconds, and possible retention by apps receiving pasted codes.
- Removal from the active account list, possible retention in previous encrypted snapshots and backups, no automatic expiry for internal backups or backup history in the audited version, and no promise of comprehensive secure erasure.

### Confirmed contact and pending publication details

On 29 October 2026, both email placeholders in each HTML file were replaced with:

```html
<a href="mailto:privacy@jegprofil.info">privacy@jegprofil.info</a>
```

The link appears in the publisher/contact details and in the contact section. Both HTML copies were verified to match after the update. The publication notice now identifies only the publisher’s legal identity and effective date as pending.

Before publication, confirm and replace these remaining placeholders in both files:

- `[PUBLISHER LEGAL IDENTITY — TO BE CONFIRMED]`
- `[EFFECTIVE DATE — TO BE CONFIRMED]`

Once those details are complete, remove the visible pending-publication notice and the `noindex` meta tag/comment as described in the upload guide. That guide’s earlier references to an unconfirmed email and three pending publication details predate the confirmed-email update; only legal identity and effective date remain pending.

### Local Vite access

The deployment HTML was copied byte-for-byte into Vite’s public directory. The original deployment file was left unchanged during that copy operation.

Vite served the explicit `/jm-authenticator/privacy/index.html` path, but the trailing-slash path initially fell back to Share Monitor’s homepage. A narrowly scoped plugin in [web/vite.config.js](../web/vite.config.js), named `jm-authenticator-privacy-local-preview`, rewrites that exact directory URL to its public `index.html` before Vite’s normal middleware runs.

The plugin uses `apply: "serve"` and `configureServer`; it does not change production build configuration or one.com routing. The existing server on port 5173 was reused, and the requested URL was opened and verified in Edge. Share Monitor’s root homepage remained available.

There is no automatic synchronization between the two HTML copies. For future policy edits, update both and compare them so local review matches the intended deployment page. The email update intentionally changed both copies; the earlier instruction to preserve the original applied to the local-access copy operation.

### Page verification

- Rendered in installed Microsoft Edge through local HTTP and directly from disk.
- Checked at widths of 320, 390, 768 and 1440 CSS pixels without horizontal overflow; mobile and desktop screenshots were visually inspected.
- Passed 200% text resizing, keyboard skip-link focus, section-link targets and HTML structure checks.
- Checked text/background combinations exceeded 4.5:1 contrast; the lowest checked ratio was 6.04:1.
- No external page requests or resource dependencies were required.
- Hash checks confirmed 20 protected Share Monitor files were unchanged during the standalone policy implementation.
- The exact Vite preview URL displayed the Privacy Policy rather than Share Monitor, while the Share Monitor homepage still displayed correctly.
- After the email update, both copies contained two correct `mailto:` links each and retained the legal-identity and effective-date placeholders.

These checks do not verify live one.com hosting, email delivery, a physical iPhone or Apple’s submission review.

## Repository and publication boundaries

This document is stored under `docs/` so the work record can be versioned with the project. Git tracks files rather than empty directories; tracking this Markdown file includes the directory without a `.gitkeep` file.

No hosting credentials were used, no `.htaccess` files or Flutter files were changed, and no one.com upload was performed. Publication remains a separate action after the outstanding identity and date are confirmed.
