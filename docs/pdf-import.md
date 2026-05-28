# PDF Expense / Income Import (Experimental)

The Expense Tracker can read **receipts**, **invoices**, **bank / credit-card statements**, and **payslips** straight from PDF files and turn them into transactions.

This feature is **experimental** and **off by default**. Enable it under **Settings → Experimental Features → PDF expense/income import**.

## How it works

1. You pick one or more PDF files in the *Import PDF* dialog.
2. The PDF is parsed **in your browser** using [`pdfjs-dist`](https://github.com/mozilla/pdf.js). Nothing is uploaded anywhere.
3. Heuristic parsers extract transactions:
   - **Receipt** — single expense with the line marked *Total / Totale / Importo totale / …*
   - **Invoice** — single expense with the *Grand total / Importo totale*
   - **Payslip** — single income with the *Net pay / Importo netto / Stipendio netto / …*
   - **Bank statement** — every line that starts with a date and has an amount becomes a transaction. Negative amounts (or "debit"-style keywords) become expenses; positive amounts (or "credit / stipendio / bonifico in entrata" keywords) become income.
4. Detected transactions land in an **editable review table**. You can:
   - Toggle each row on/off.
   - Change the kind (income ↔ expense).
   - Edit the date, description, amount, category, expense type (need/want) or income source.
5. Confirm to push the included rows into the current Expense Tracker.

The doc-type dropdown lets you override the auto-detected parser if it picks the wrong one.

## Optional AI categorization

If a heuristic category is wrong (e.g. an obscure merchant), an **optional** LLM step can re-categorize the rows.

- You provide an **OpenAI-compatible** `/chat/completions` endpoint, an API key, and a model name in *Settings → Experimental Features*.
- Works with **OpenAI**, **Azure OpenAI**, hosted aggregators (**OpenRouter**, **Together**, …), and — most importantly for privacy — **self-hosted open-source models** running locally via **Ollama** (`http://localhost:11434/v1`), **LM Studio** (`http://localhost:1234/v1`), **llama.cpp**, **vLLM**, etc. For local servers, any non-empty API-key value works.
- It only runs when you tick **Use AI categorization** inside the import dialog for that import.
- Only the parsed transaction descriptions, kinds, amounts, and currencies are sent — never the raw PDF bytes.
- If the request fails, times out, or returns invalid JSON, the heuristic results are used unchanged.

### Example endpoints

| Provider     | Base URL                                  | Model example     |
| ------------ | ----------------------------------------- | ----------------- |
| OpenAI       | `https://api.openai.com/v1`               | `gpt-4o-mini`     |
| Azure OpenAI | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` (append `?api-version=…` as needed) | your deployment id |
| Ollama       | `http://localhost:11434/v1`               | `llama3.1:8b`     |
| LM Studio    | `http://localhost:1234/v1`                | local model id    |
| OpenRouter   | `https://openrouter.ai/api/v1`            | `openai/gpt-4o-mini` |

## Privacy

- **No PDF bytes ever leave your device.** Parsing happens fully in the browser.
- **No network calls at all** unless you (a) configure the LLM endpoint **and** (b) tick *Use AI categorization* for an import.
- The API key is stored encrypted with the rest of your settings (AES-256 in a cookie scoped to your browser).
- You can clear everything via *Settings → Data Management → Reset All Data*.

## Limitations

Heuristic parsing is intentionally conservative and will never be 100% accurate. Expect to:

- Hand-fix rows highlighted as **low confidence** (light-orange background).
- Override the doc-type dropdown for unusual layouts.
- Edit categories for niche merchants, or use the optional LLM step.

Scanned PDFs (image-only, no text layer) are **not supported**. Run them through an OCR tool first to get a text-bearing PDF.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "No transactions detected" | Wrong doc-type or unusual layout | Pick the correct doc type from the dropdown. |
| All rows have wrong dates | Locale mismatch (DD/MM vs MM/DD) | Edit each row's date manually before confirming. |
| LLM categorization does nothing | Endpoint/key not set, or model name wrong | Re-check the three fields in Settings. |
| Build error about `?url` import | Vite version too old | This feature needs Vite 5+ (already pinned in the project). |
