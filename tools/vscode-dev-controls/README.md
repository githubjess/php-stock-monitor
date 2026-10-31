# Share Monitor Development Controls

Private, dependency-free VS Code extension. It creates exactly four workspace
controls on macOS and Windows: Backend, Stop Backend, Frontend, Stop Frontend.
The extension host OS selects the platform automatically. Tooltips identify it.
Other operating systems and unrelated folders receive no status-bar controls.

## Install on either computer

From the repository root, run:

```text
node tools/vscode-dev-controls/package.cjs
```

This prints the generated VSIX path in the system temporary directory. In VS
Code, run **Extensions: Install from VSIX...**, select that file, then reload the
window if prompted. Alternatively use `code --install-extension "<printed path>"`.
The recommendation refers to this private extension; it is not published on the
Marketplace. Repeat packaging/installing after pulling extension source updates.
No npm installation or packaging dependencies are needed.

Open and trust the repository folder in VS Code. Activation is automatic when
`.vscode/tasks.json` is present. Backend needs PHP 8.1+ with cURL or an HTTPS
stream wrapper; frontend needs a Vite-compatible Node/npm installation and the
existing `web` dependencies. On a fresh Mac checkout, run `npm ci` inside `web`
before using Frontend. Tools must be discoverable by VS Code's task PATH.

The shared tasks use macOS PHP/npm commands and preserve the Windows PowerShell
launchers, including their tool-path fallbacks and frontend dependency check.
PHP uses localhost:8080; Vite uses port 5173 with strict port selection. The
existing Vite API proxy is unchanged. No Apache or PHP-FPM service is needed.

Stop controls terminate only the matching named task in the selected workspace.
They do not kill processes by executable name or port. Already-running services
started outside these tasks are not adopted or stopped. Repeated starts are
ignored while that service's task is running. Multiple matching workspace folders
prompt for a folder; selecting an OS is never necessary.

The former workspace status-bar/multi-command definitions are empty to prevent
duplicates. Those extensions can remain installed for other projects. Machine
user settings may still define additional application-wide buttons independently.

## Focused verification

Run `node --test tools/vscode-dev-controls/extension.test.cjs` from the repository
root for platform visibility, duplicate-start prevention, and workspace-specific
termination checks.

On 31 October 2026, an isolated real macOS VS Code extension host confirmed all
four visible controls, PHP/Vite startup and shutdown, transformed React modules,
a live AAPL quote through the Vite API proxy, and the existing Privacy Policy
route. Stopping either service preserved the other service and unrelated PHP and
Node processes. Both development ports were released after cleanup.

Windows execution remains pending on the Captain's Windows 11 computer. Its task
commands, arguments, working directories, PATH values and launchers were preserved;
the Windows visibility and task-targeting logic was checked with a mocked host.
