# Document and receipt import (experimental)

The Cashflow Tracker imports receipts, invoices, bank statements and payslips
from **PDFs and JPEG/PNG/WebP photos**. Enable **Settings > Experimental
Features > PDF Import**, then select **Import documents** in the tracker.
The public web demo remains read-only: camera, uploads, pairing and confirmation
are disabled there.

## Choose a local parser

| Engine | Where it runs | Supported input |
| --- | --- | --- |
| **PDF.js** (default) | Your renderer, with bundled worker/fonts/decoders | Text-layer PDFs |
| **LiteParse + OCR** | Your configured local backend, including Electron's embedded server | Text PDFs, scans and receipt photos |

LiteParse is an alternative, not a replacement for PDF.js. Select it in the
dialog's **Parsing engine** menu. Photos always use LiteParse's bundled local
Tesseract OCR; an AI model, API key, cloud OCR account or external service is
not required. A custom backend receives document bytes explicitly; use your
own trusted server. Browser-only debugging without a backend can still read
text PDFs with PDF.js.

The build bundles English Tesseract language data, its license and provenance
from the pinned `@tesseract.js-data/eng` package (about 23.5 MB uncompressed).
The worker requires that local file before parsing, rather than allowing
LiteParse's automatic first-use download. Docker and desktop OCR therefore
work without internet access; the data does not enter the web bundle.

LiteParse documents are limited to **10 MB** and **100 pages**. Native parsing runs in
a disposable process with a 60-second deadline and at most two concurrent
jobs. Its private temporary input is deleted after completion, failure or
cancellation. The temporary file is not encrypted by the SQLite passphrase.
No native Node access is exposed to the renderer.

## Review before importing

1. Select PDFs/photos, use **Take a receipt photo**, or open a stored receipt
   from the **Receipt inbox**.
2. Choose **Auto-detect**, **Receipt**, **Invoice**, **Bank statement** or
   **Payslip**. The existing conservative heuristics extract totals, dates,
   transaction types and categories from the selected engine's text.
3. Review the editable rows. Fix dates, amounts, kind, category, need/want or
   income source; exclude unwanted rows. Adding files retains existing edits.
4. Confirm the complete batch. Every included date must exist in the calendar
   and every included amount must be finite and greater than zero.

Confirmation saves one complete renderer-ledger update before marking receipt
originals reviewed. It does not migrate the financial ledger to the backend.
Failed writes keep drafts and originals available. Receipt rows have stable
content-derived IDs, so retries do not duplicate already imported entries.
If saving succeeded but updating receipt status failed, **Finish receipt
review** retries the status update without changing or re-saving entries.
The tracker navigates to the earliest imported transaction's month.

## Offline categorization rules

Cashflow Tracker's **Rules** tab configures local, literal description/kind/
currency/amount matching. The first enabled match suggests category/type or
income source before optional AI processing. Matched rows show their rule and
are not sent to a model; unmatched rows keep the existing consent and
cancellation behavior. Manual review overrides suggestions. Rules work with
AI disabled and never change dates, amounts or saved history.
See [cashflow planning](user/cashflow-planning.md#offline-categorization-rules).

## Retained originals

Photos are stored **before OCR** in the backend SQLite `receipts` table,
separate from financial entries. Re-uploading identical bytes is idempotent.
The inbox can show pending or reviewed images, review them again, download the
original or explicitly delete it. Deleting an image does not delete its
transactions. Closing the dialog or a parser/model error does not delete it.

Originals are included in SQLite backups and in optional database passphrase
encryption. They are **not** included in the existing ledger CSV or all-data
renderer JSON export; download originals or keep a database backup.
**Settings > Data Management > Reset All Data** also deletes originals from
the configured backend, after confirmation. An unavailable configured backend
blocks reset rather than silently claiming success. Phone queues belong to
the phone and are not cleared by a desktop reset.

## Pair a phone over Wi-Fi

1. Open **Import documents > Phone receipt uploads** on the desktop.
2. Keep the default **8790** upload port, or choose a free port.
3. Select **Start phone pairing**. Share a **Phone pairing link** with your
   phone; the loopback link labelled *This computer only* will not reach it.
4. Open the link while connected to the same trusted Wi-Fi. Use **Take a
   receipt photo** (the phone/browser handles native camera permission) or
   select existing photos.
5. Select **Send queued receipts**, then refresh/review the desktop inbox.

The listener is opt-in, upload-only and separate from the desktop's
loopback-only financial API. It cannot read receipts, list data, change
settings or create financial entries. Links authorize uploads for 30 minutes;
**Stop phone pairing**, dialog closure or app shutdown stops the listener.
Never share a link publicly. Plain HTTP is not encrypted: use it only on a
trusted LAN. Firewalls must permit the selected upload port.

The phone saves **original bytes**, not recompressed copies, in its
origin-scoped IndexedDB queue before sending. It removes a queued photo only
after the server confirms storage. Offline/network failures and lost
acknowledgements retain the queue; identical retries are deduplicated.
Keep the already-loaded page open when away from the server to take photos.
It is not an installed offline PWA and cannot initially load without reaching
the listener.

If pairing expires, reopen a fresh link at the **same scheme, host and port**
to reach the existing queue. A different Wi-Fi hostname, tunnel origin or port
has a separate queue. Download pending originals before changing addresses or
clearing browser data. Private browsing or disabled/full storage can prevent
queuing; failures are shown instead of reporting a save.
HEIC photos are not accepted: choose a JPEG/PNG/WebP export. Photos larger than
10 MB stay queued; save the original and select a resized copy explicitly.

## Optional HTTPS tunnel

Fire Tools accepts an **existing user-configured HTTPS tunnel origin**. It
does not install a tunnel client, create a public hostname or call a tunnel
provider.

Forward the tunnel to the **receipt upload port only**, for example
`http://127.0.0.1:8790`, never to the ordinary financial API. Enter its HTTPS
origin (for example `https://receipts.example.net`, without a path, query or
credentials) before pairing. Open the generated HTTPS phone link.

If the tunnel already exists, the upload listener only remains active for
the pairing lease. The capability is carried in the link's fragment and then
sent in an Authorization header, not a query string. The phone page sends no
referrer and loads no third-party resources. The tunnel operator can still
access traffic; choose a trusted service or use Wi-Fi instead.

For Docker's explicit upload-only port publication and private host address,
see [deployment instructions](deployment/README.md#receipt-phone-uploads).

## Optional OpenAI-compatible categorization

Configure an **OpenAI-compatible chat/completions endpoint** and **model** in
**Settings > AI features > Model configuration**, then explicitly tick
**Use AI categorization** for an import.
Authentication is optional: leave the key blank for an unauthenticated local
server. A key is sent as a bearer token only when provided.

| Service | Base URL | Example model |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | A model already downloaded locally |
| LM Studio | `http://localhost:1234/v1` | Your loaded local model ID |
| llama.cpp / vLLM | Your local server's `/v1` URL | Its configured model ID |
| OpenAI or hosted compatible server | Its `/v1` URL | Your selected model ID |

Full `/chat/completions` URLs and query parameters are supported. The request
does not require the optional `response_format` parameter, which many local
servers lack. The model must return JSON as requested by the prompt.
Only parsed transaction fields are sent, never PDF/photo bytes. Dates,
amounts and currencies are never rewritten by categorization.
Timeouts, invalid JSON or network errors are reported while retaining editable
heuristic results. Browser CORS and mixed-content restrictions still apply;
prefer the Electron renderer for an HTTP local model.

**Disable all AI features** at the top of Settings blocks local and hosted
model calls and cancels pending categorization. Editable heuristic drafts and
stored originals remain available; OCR, parsing, pairing and imports are not
disabled. **Enable all AI features** restores availability without clearing
saved endpoints, keys or models, but you must opt in again for each import.

## Limitations and troubleshooting

Always compare detected totals and dates with the original. OCR can misread
digits, especially on blurry, handwritten or very long receipts. Improve the
photo or edit the draft; no parser can guarantee financial correctness.

| Symptom | Action |
| --- | --- |
| Text PDF parses incorrectly | Try the other engine or override document type. |
| Scan has no text | Select LiteParse + OCR on a running local backend. |
| Original saved but OCR failed | Retry from the inbox; the original is retained. |
| Phone cannot connect | Check the Wi-Fi link, firewall, upload port and lease; do not use the computer-only loopback link. |
| Container link uses an internal address | Supply the host's private Wi-Fi upload address before pairing. |
| Phone send fails | Keep the queue; reconnect or re-pair at the same origin, then retry. |
| Categorization unavailable | Enable AI in Settings and configure endpoint and model; a key is unnecessary for unauthenticated local models. |
| Imported entries appear in another month | The tracker navigates to the earliest imported date. |
