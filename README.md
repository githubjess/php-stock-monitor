# Share Monitor

Share Monitor is a stock dashboard with:
- Live quote snapshot per ticker
- Historical chart panel (`Stock Price Chart`)
- Rule-based `Invest / Risk Signal` panel
- Optional EUR conversion for panel values

## Run Locally

### 1) Backend

On Windows (PowerShell), use the launcher to enable HTTPS extensions bundled with PHP when no `php.ini` is loaded:

```powershell
cd php-api
./start.ps1
```

On other platforms, with cURL or OpenSSL enabled in PHP:

```bash
cd php-api
php -S localhost:8080 router.php
```

### 2) Frontend (new terminal)
```bash
cd web
npm install
npm run dev
```

### Requirements
- PHP 8.1+ for the backend API
- PHP must support HTTPS requests (either `ext-curl` or OpenSSL-enabled stream wrapper)
- Node.js 18+ for the React frontend

## Deploy To one.com (Step-by-step)

This section is for deploying THIS repo to one.com.

### 1) Build frontend

```bash
cd web
npm install
npm run build
```

Build output:
- `web/dist/index.html`
- `web/dist/assets/`

### 2) Log in to one.com and open File Manager

Use this flow when starting from the normal one.com website:

1. Go to `https://www.one.com`.
2. Click `Einloggen` / `Log in`.
3. Select `File Manager` from the login menu.
4. When one.com asks for credentials, use your one.com Control Panel login:
   - email/contact address for the hosting account
   - Control Panel password
5. After File Manager opens, select the domain/webspace for this site if one.com asks.
6. Open the website root folder: `public_html`.

Alternative flow:

1. Go directly to `https://login.one.com`.
2. Log in to the one.com Control Panel.
3. Open `Files & Security`.
4. Click `File Manager`.
5. Open `public_html`.

Official one.com help pages:
- Control Panel login: https://help.one.com/hc/en-us/articles/115005592505-Logging-in-to-the-one-com-Control-Panel
- File Manager: https://help.one.com/hc/en-us/articles/115005585809-Using-One-com-File-Manager

### 3) Prepare `public_html`

In one.com File Manager, go to `public_html`.

If this is a new site:
- Upload the files listed in the next step directly into `public_html`.

If `public_html` already contains an existing website:
- Make a backup before replacing anything.
- Be careful with an existing `index.html` and `.htaccess`; replacing them changes the live homepage and routing.

Create these folders if they do not already exist:

```text
public_html/
  assets/
  php-api/
    public/
    src/
```

### 4) Copy exact files from local repo to one.com

Copy these files/folders:
- `web/dist/index.html` -> `public_html/index.html`
- `web/dist/assets/` -> `public_html/assets/`
- `web/public/favicon.ico` -> `public_html/favicon.ico`
- `php-api/public/index.php` -> `public_html/php-api/public/index.php`
- `php-api/src/MarketData.php` -> `public_html/php-api/src/MarketData.php`
- create `public_html/.htaccess` with the content below

What each upload does:
- `index.html` loads the React frontend.
- `assets/` contains the built JavaScript and CSS from `web/src/App.jsx` and `web/src/styles.css`.
- `favicon.ico` is the browser tab icon.
- `php-api/public/index.php` is the PHP API entry point.
- `php-api/src/MarketData.php` is the PHP backend logic.
- `.htaccess` connects `/api/...` and `/health` to the PHP backend and sends frontend routes to `index.html`.

Tip after frontend changes:
- If you change anything in `web/src/App.jsx` or `web/src/styles.css`, run `npm run build` again.
- Then replace `public_html/index.html` and the whole `public_html/assets/` folder with the new files from `web/dist/`.
- Do not upload `web/src/`, `node_modules/`, or `package.json` to one.com.

### 5) Configure `.htaccess`

In one.com File Manager, create or edit this file:

```text
public_html/.htaccess
```

Paste this content:

```apache
RewriteEngine On

# Enforce SSL
# Handle non-www URLs
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP_HOST} ^jegprofil\.info [NC]
RewriteRule ^(.*) https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Handle www URLs
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP_HOST} ^www\.jegprofil\.info [NC]
RewriteRule ^(.*) https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Hub shortcut
RewriteRule ^stocks/?$ STOCK-MARKET/ [L]

# API routes to PHP backend (only if you deploy php-api from this repo)
RewriteRule ^api(/.*)?$ /php-api/public/index.php [QSA,L]
RewriteRule ^health$ /php-api/public/index.php [QSA,L]

# Serve real files/folders directly
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# SPA fallback (only if root is this frontend app)
RewriteRule ^ /index.html [L]
```

### 6) Final target on one.com

```text
public_html/
  .htaccess
  index.html
  favicon.ico
  assets/
  STOCK-MARKET/                 # only if you use /stocks shortcut
    index.html
  php-api/
    public/
      index.php
    src/
      MarketData.php
```

### 7) Verify

Open these URLs in your browser:

- `https://jegprofil.info/health`
- `https://jegprofil.info/api/history/AAPL?range=1m`
- `https://jegprofil.info/`

Expected result:
- `/health` should show a backend health response.
- `/api/history/AAPL?range=1m` should return JSON data.
- `/` should load the Share Monitor app.

If you still see old colors or old layout:
- Hard-refresh the browser.
- Replace `public_html/index.html` again.
- Delete the old `public_html/assets/` files and upload the new `web/dist/assets/` files again.

## Where `php-api` Comes From

`php-api` is part of this repo (local path: `php-stock-monitor/php-api`).

- Backend entry point: `php-api/public/index.php`
- Backend logic: `php-api/src/MarketData.php`
- Local dev router: `php-api/router.php`

On one.com, API requests work only if you upload `php-api/public/index.php` and `php-api/src/MarketData.php` to `public_html/php-api/...`.

## one.com Troubleshooting

- `404` on `/api/...`
  - Verify `public_html/php-api/public/index.php` exists.
  - Verify root `.htaccess` has `RewriteRule ^api(/.*)?$ /php-api/public/index.php [QSA,L]`.

- Blank page or missing JS/CSS
  - Verify `public_html/assets/` was uploaded from `web/dist/assets/`.
  - Hard-refresh browser cache.

- Homepage shows rewrite text (`RewriteEngine On ...`)
  - You pasted `.htaccess` rules into `index.html` by mistake.
  - Move those rules into `public_html/.htaccess`.
  - Restore `public_html/index.html` to real HTML (`<!doctype html>...`).

- Redirect loop on HTTP -> HTTPS
  - Keep only one HTTPS rule in root `.htaccess`.
  - Avoid duplicate HTTPS redirects in nested `.htaccess` files.

## Dev Logging (Silent Mode)

If you want development without visible logs in terminal and without creating log files, run backend and frontend like this.

### Backend (PHP) with no logs in terminal

```powershell
cd php-api
php -d display_errors=0 -d log_errors=0 -S localhost:8080 router.php *> $null
```

Notes:
- This suppresses the built-in PHP server lines (`Accepted`, `Closing`) in your terminal.
- Those lines are normal in development and are not a memory leak.
- They only fill disk if you redirect output to a file.

### Frontend (Vite) with minimal logs

```powershell
cd web
npm run dev -- --logLevel silent
```

## Production Logging Note (one.com)

On one.com, your app does not run with `php -S`, so you will not see `Accepted/Closing` dev-server lines.

- Hosting keeps server access/error logs internally (Apache/PHP platform logs).
- You generally cannot fully disable hosting platform logs.
- You can disable PHP app-level error logging with a `.user.ini` in `public_html`:

```ini
log_errors=Off
display_errors=Off
error_reporting=0
```

## Signal Model (Invest / Risk)

The signal combines:
- Trend structure (two SMAs)
- Momentum state (RSI)

### Logic used in the app

For each data point:
- Trend Invest condition: `close > smaShort && smaShort > smaLong`
- Trend Risk condition: `close < smaShort || smaShort < smaLong`
- Momentum Invest condition: `RSI between investRsiMin and investRsiMax`
- Momentum Risk condition: `RSI <= riskRsiLow || RSI >= riskRsiHigh`

Signal output:
- `invest` when Trend Invest and Momentum Invest are both true
- `risk` when Trend Risk is true OR Momentum Risk is true
- otherwise `neutral`

## Optimized Defaults (Market-Practice Baseline)

These defaults were updated to match common technical-analysis conventions:
- RSI period defaults to `14`
- RSI boundaries use `30/70` as risk extremes
- Moving-average pairs use commonly used trend windows:
  - short/medium context: `20/50`
  - long trend context: `50/200`
  - intraday/short horizon: `9/21` or `10/30`

### Default settings by selected range

| Range | SMA Short | SMA Long | RSI Period | Invest RSI Min | Invest RSI Max | Risk RSI Low | Risk RSI High |
|---|---:|---:|---:|---:|---:|---:|---:|
| `1d` | 9 | 21 | 14 | 50 | 70 | 30 | 70 |
| `1w` | 10 | 30 | 14 | 50 | 70 | 30 | 70 |
| `1m` | 20 | 50 | 14 | 50 | 70 | 30 | 70 |
| `2m` | 20 | 50 | 14 | 50 | 70 | 30 | 70 |
| `3m` | 20 | 50 | 14 | 50 | 70 | 30 | 70 |
| `6m` | 50 | 200 | 14 | 50 | 70 | 30 | 70 |
| `1y` | 50 | 200 | 14 | 50 | 70 | 30 | 70 |
| `5y` | 50 | 200 | 14 | 50 | 70 | 30 | 70 |
| `max` | 50 | 200 | 14 | 50 | 70 | 30 | 70 |

## Practical Notes

- This is a rules-based helper, not a prediction engine.
- The model intentionally favors trend alignment and momentum confirmation.
- Signals can lag during fast reversals (normal for MA/RSI systems).
- Different symbols can require tuning because volatility regimes vary.
- The app stores signal settings in browser local storage.
  - If you changed settings manually, use the button `Use {range} defaults` in the Signal panel to re-apply the updated defaults.

## Data Notes

- Quote and history are sourced from Yahoo chart endpoints through the PHP backend.
- History is sampled/capped (current cap: up to 300 points), so point count depends on data availability for the selected ticker/range.
- EUR mode converts quote and panel values using fetched FX rates.

## Technical References

- RSI thresholds and interpretation:
  - https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/
  - https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI
- Moving average behavior and trend context:
  - https://www.tradingview.com/support/solutions/43000502589-moving-averages/
  - https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/moving-average

## Disclaimer

Educational use only. Not financial advice.
