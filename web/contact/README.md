# Website contact form

Local page: `/contact/`. Impressum links to it without removing its draft notice.
The page reuses the site's Light design and seven-language selector. No Dark/Navy
website appearance currently exists; this page adds no theme switcher. Form
controls inherit the site's CSS variables. No external services or dependencies
are loaded by the form.

The form has its own compact seven-language dropdown, initialized once from the
current website language. Its choice stays independent for the current page:
it changes labels, placeholders, validation and delivery messages only inside
the form. It does not write localStorage, change the global selector or document
language, or modify any entered field value. Later global language changes leave
the form's choice intact. The form retains its language after a successful reset.

## Delivery

The fixed recipient and sender are `business@jegprofil.info`; only Reply-To uses
the validated visitor email. The subject supports UTF-8; the body is plain text.
The endpoint returns `accepted` only when PHP `mail()` returns true. This means
the transport accepted the message, not that inbox delivery has been confirmed.
No automatic retries or visitor auto-replies are sent.

one.com recommends [PHP mail()](https://help.one.com/hc/en-us/articles/115005594345-Can-I-send-emails-from-my-website).
`business@jegprofil.info` must be an active mailbox on the domain at one.com,
even if mail is otherwise forwarded or hosted elsewhere. No SMTP password is
needed for this delivery method. Actual provider acceptance and inbox delivery
must be checked by the Captain after an authorized deployment; no messages were
sent during implementation. Local PHP may lack a configured mail transport and
will then return a localized service-unavailable response.

## Validation and anti-spam

Client/server limits: name 100 characters, email 254, subject 160, message 5000.
The server accepts JSON POST only, caps request size at 32 KiB, validates UTF-8,
rejects email/header control characters, and rejects a filled honeypot without
claiming delivery. Submitted values never determine recipients, sender, or extra
headers. Browser cross-origin submissions receive no CORS permission.

Five valid submission attempts per client and 30 site-wide attempts are permitted
per rolling 15 minutes. Attempts include failed transport calls. Rate limiting
uses `REMOTE_ADDR`, not untrusted forwarded headers. If a reverse proxy hides
client addresses, its trusted configuration needs review before changing this.

The limiter uses a private directory under PHP's system temporary directory,
outside the document root. The directory/file permissions are 0700/0600. It stores
only timestamps, a random hash key and keyed IP hashes; no names, emails, subjects
or messages. Timestamps expire logically after 15 minutes and are pruned on the
next valid attempt, so stale metadata can remain while the form is idle. No
submission database or message file is created. The recipient mailbox and normal
hosting/mail logs have their own retention. If limiter storage is unavailable or
corrupt, sending fails closed with a generic service-unavailable response.

## Build and one.com upload

Run the existing `npm run build` in `web`. Merge the contents of `web/dist/` into
the domain document root, retaining old hashed assets for cached pages. Include
the new `/contact/index.html`, the refreshed `/impressum/index.html`, and the
complete current `/assets/` folder: translation code is shared across pages.

Additionally upload these PHP files beside the built contact HTML:

| Repository file | Destination under domain document root |
| --- | --- |
| `php-api/contact/send.php` | `contact/send.php` |
| `php-api/contact/rate-limit.php` | `contact/rate-limit.php` |

These PHP files are **not** included automatically in `web/dist`. Do not upload
this README, source catalogs, development scripts or node_modules. The two PHP
files must remain in the same directory. Hosting must support PHP 8.1+, `mail()`,
and private writable system temporary storage with file locking.

Existing routing must serve real `/contact/` files normally. No new production
API rewrite is required. For local development only, Vite proxies the exact mail
endpoint to the existing PHP server, whose router dispatches that path to the
new handler. Share Monitor's `/api` and `/health` routes are unchanged.

No automated tests or email submissions were run. PHP/JavaScript syntax checks,
source review and the production build are the implementation checks.
