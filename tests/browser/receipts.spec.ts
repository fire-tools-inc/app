import { expect, test } from '@playwright/test';
import CryptoJS from 'crypto-js';
import { LiteParse } from '@llamaindex/liteparse';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import type { EmbeddedServer } from '../../server/src/embed';
import type { ReceiptPairing } from '../../src/types/receiptImport';

let server: EmbeddedServer;
let directory: string;
let receiptImage: Buffer;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fire-tools-receipt-browser-'));
  const { startEmbeddedServer } = await import('../../server/dist/embed.js');
  server = await startEmbeddedServer({
    dbPath: join(directory, 'synthetic.db'),
    migrationsPath: fileURLToPath(new URL('../../server/migrations/', import.meta.url)),
  });
  const parser = new LiteParse({ quiet: true, ocrEnabled: false, dpi: 180 });
  try {
    const screenshots = await parser.screenshot(await readFile(new URL('../pages/expense-tracker/fixtures/sample-invoice.pdf', import.meta.url)), [1]);
    receiptImage = Buffer.from(screenshots[0].imageBuffer);
  } finally {
    parser.close();
  }
});

test.afterAll(async () => {
  if (server) await server.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error('Browser tests require a base URL.');
  await fetch(`${server.url}/api/v1/receipts`, { method: 'DELETE' });
  const settings = {
    experimentalFeatures: { pdfImport: true, portfolioBreakdown: false },
    backend: { mode: 'custom', customUrl: server.url },
  };
  const payloads = [
    { name: 'fire-calculator-settings', payload: settings },
    { name: 'fire-tools-tour-completed', payload: { completed: true } },
    { name: 'fire-tools-questionnaire-prompt-dismissed', payload: { dismissed: true } },
    { name: 'fire-tools-security-banner-dismissed', payload: { dismissed: true } },
  ];
  await context.addCookies(payloads.map(({ name, payload }) => ({
    name,
    value: encodeURIComponent(CryptoJS.AES.encrypt(JSON.stringify(payload), 'fire-calculator-secret-key-v1-2024').toString()),
    url: new URL(baseURL).origin, sameSite: 'Strict' as const,
  })));
  await context.addCookies([{
    name: 'fire-tools-cookie-consent',
    value: encodeURIComponent(JSON.stringify({ version: '1', acknowledgedAt: new Date().toISOString(), cookieType: 'strictly-necessary' })),
    url: new URL(baseURL).origin, sameSite: 'Strict',
  }]);
});

async function pairing(port = 0): Promise<ReceiptPairing> {
  const response = await fetch(`${server.url}/api/v1/receipt-pairings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port, language: 'en' }),
  });
  if (!response.ok) throw new Error(`Synthetic pairing failed: ${response.status}`);
  return response.json();
}

test('bulk AI controls remain visible, keyboard-operable and persistent at desktop and mobile widths', async ({ page, context, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Browser tests require a base URL.');
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.goto('./settings?demo=0');
  const section = page.getByRole('region', { name: 'AI features' });
  const disable = section.getByRole('button', { name: 'Disable all AI features' });
  const enable = section.getByRole('button', { name: 'Enable all AI features' });
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 620 });
    await expect(disable).toBeVisible();
    await disable.focus();
    await page.keyboard.press('Space');
    await expect(disable).toHaveAttribute('aria-pressed', 'true');
    await enable.focus();
    await page.keyboard.press('Enter');
    await expect(enable).toHaveAttribute('aria-pressed', 'true');
    expect(await enable.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
    for (const control of [enable, disable]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: testInfo.outputPath(`ai-settings-${width}.png`) });
  }
  await disable.click();
  await page.reload();
  await expect(disable).toHaveAttribute('aria-pressed', 'true');
});

test('disabling AI in another Settings tab aborts model calls but retains drafts and requires fresh consent on enable', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Browser tests require a base URL.');
  let requestCount = 0;
  let requested: (() => void) | undefined;
  let cancelled: (() => void) | undefined;
  const firstRequest = new Promise<void>(resolve => { requested = resolve; });
  const firstCancellation = new Promise<void>(resolve => { cancelled = resolve; });
  const modelServer = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', new URL(baseURL).origin);
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    let body = '';
    request.on('data', chunk => { body += chunk.toString(); });
    request.on('end', () => {
      requestCount++;
      if (requestCount === 1) {
        response.once('close', () => cancelled?.());
        requested?.();
        return;
      }
      const input = JSON.parse(body);
      const transactions: { id: string }[] = JSON.parse(input.messages.find((message: { role: string }) => message.role === 'user').content);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          results: transactions.map(transaction => ({ id: transaction.id, category: 'GROCERIES', expenseType: 'NEED' })),
        }) } }],
      }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    modelServer.once('error', reject);
    modelServer.listen(0, '127.0.0.1', resolve);
  });
  const address = modelServer.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic model requires a TCP address.');
  const modelOrigin = `http://127.0.0.1:${address.port}`;
  const importer = await context.newPage();
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return [new URL(baseURL).origin, server.url, modelOrigin].includes(url.origin)
        || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    await page.goto('./settings?demo=0');
    await page.getByText('Model configuration', { exact: true }).click();
    await page.getByLabel('Base URL', { exact: true }).fill(`${modelOrigin}/v1`);
    await page.getByLabel('Model', { exact: true }).fill('synthetic-local-model');
    await importer.goto('./expense-tracker?demo=0');
    await importer.getByRole('button', { name: 'Import documents and receipt photos' }).click();
    const dialog = importer.getByRole('dialog');
    const consent = dialog.getByRole('checkbox', { name: /Use AI categorization/ });
    await consent.check();
    await dialog.getByLabel('Document type', { exact: true }).selectOption('invoice');
    await dialog.locator('#pdf-files').setInputFiles('tests/pages/expense-tracker/fixtures/sample-invoice.pdf');
    await firstRequest;
    await page.getByRole('button', { name: 'Disable all AI features' }).click();
    await firstCancellation;
    await expect(dialog.getByRole('spinbutton', { name: 'Amount 1' })).toHaveValue('2158.8');
    await expect(consent).toBeDisabled();
    await expect(consent).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Import (1)' })).toBeEnabled();
    await page.getByRole('button', { name: 'Enable all AI features' }).click();
    await expect(consent).toBeEnabled();
    await expect(consent).not.toBeChecked();
    expect(requestCount).toBe(1);
    await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue(`${modelOrigin}/v1`);
    await expect(page.getByLabel('Model', { exact: true })).toHaveValue('synthetic-local-model');
    await consent.check();
    await dialog.locator('#pdf-files').setInputFiles('tests/pages/expense-tracker/fixtures/sample-invoice.pdf');
    await expect(dialog.getByRole('spinbutton', { name: 'Amount 2' })).toHaveValue('2158.8');
    expect(requestCount).toBe(2);
  } finally {
    await importer.close();
    modelServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => modelServer.close(error => error ? reject(error) : resolve()));
  }
});

test('phone queues original photos, survives a lost acknowledgement and re-pair, then sends without duplicates', async ({ browser }, testInfo) => {
  const errors: string[] = [];
  const paired = await pairing();
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 740 }, isMobile: true });
  const phone = await phoneContext.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phoneContext.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(paired.urls[0]).origin ? route.continue() : route.abort();
  });
  try {
    await phone.goto(paired.urls[0]);
    await expect(phone.getByRole('heading', { name: 'Send receipts to Fire Tools' })).toBeVisible();
    expect(new URL(phone.url()).hash).toBe('');
    await expect(phone.locator('#receipt-camera')).toHaveAttribute('capture', 'environment');
    await phone.locator('#receipt-camera').setInputFiles({ name: 'synthetic-receipt.png', mimeType: 'image/png', buffer: receiptImage });
    await expect(phone.getByRole('status')).toHaveText('1 photos queued on this phone.');
    await phone.route('**/receipts?*', async route => {
      await route.fetch();
      await route.abort('failed');
    });
    await phone.getByRole('button', { name: 'Send queued receipts' }).click();
    await expect(phone.getByRole('alert')).toContainText('Photos are retained');
    const beforeRetry = await (await fetch(`${server.url}/api/v1/receipts`)).json();
    expect(beforeRetry.items).toHaveLength(1);
    const original = await fetch(`${server.url}/api/v1/receipts/${beforeRetry.items[0].id}/content`);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(receiptImage);
    await phone.unroute('**/receipts?*');
    await fetch(`${server.url}/api/v1/receipt-pairings/${paired.id}`, { method: 'DELETE' });
    const fresh = await pairing(paired.port);
    await phone.goto(fresh.urls[0]);
    await expect(phone.getByRole('status')).toHaveText('1 photos queued on this phone.');
    await phone.getByRole('button', { name: 'Send queued receipts' }).click();
    await expect(phone.getByRole('status')).toContainText('Receipts stored by your app');
    await expect(phone.locator('#queue > li')).toHaveCount(0);
    const afterRetry = await (await fetch(`${server.url}/api/v1/receipts`)).json();
    expect(afterRetry.items).toHaveLength(1);
    expect(afterRetry.items[0].id).toBe(beforeRetry.items[0].id);
    expect((await fetch(`${new URL(fresh.urls[0]).origin}/api/v1/settings`)).status).toBe(404);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.screenshot({ path: testInfo.outputPath('paired-phone.png'), fullPage: true });
    await fetch(`${server.url}/api/v1/receipt-pairings/${fresh.id}`, { method: 'DELETE' });
    expect(errors).toEqual([]);
  } finally {
    await phoneContext.close();
  }
});

for (const width of [1440, 390]) {
  test(`local OCR review persists once and retains original bytes at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    if (!baseURL) throw new Error('Browser tests require a base URL.');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return [new URL(baseURL).origin, server.url].includes(url.origin) || ['blob:', 'data:'].includes(url.protocol)
        ? route.continue() : route.abort();
    });
    await page.setViewportSize({ width, height: width === 1440 ? 620 : 740 });
    await page.goto('./settings?demo=0');
    await page.getByText('Model configuration', { exact: true }).click();
    await page.getByLabel('Base URL', { exact: true }).fill('http://localhost:11434/v1');
    await page.getByLabel('Model', { exact: true }).fill('synthetic-local-model');
    await page.getByRole('button', { name: 'Disable all AI features' }).click();
    await page.goto('./expense-tracker?demo=0');
    const trigger = page.getByRole('button', { name: 'Import documents and receipt photos' });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox', { name: /Use AI categorization/ })).toBeDisabled();
    await expect(dialog.getByRole('heading', { name: 'Receipt inbox' })).toBeVisible();
    await dialog.getByLabel('Document type', { exact: true }).selectOption('invoice');
    const parsedPhoto = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/document-text');
    await dialog.getByLabel('Take a receipt photo').setInputFiles({ name: 'synthetic-invoice.png', mimeType: 'image/png', buffer: receiptImage });
    expect((await parsedPhoto).ok()).toBe(true);
    const amount = dialog.getByRole('spinbutton', { name: 'Amount 1' });
    await expect(amount).toHaveValue('2158.8');
    await expect(dialog.getByAltText('Original receipt photo')).toBeVisible();
    expect(await dialog.locator('.receipt-panel').count()).toBe(2);
    expect(await dialog.locator('.pdf-import-table-wrapper').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(100);
    await dialog.getByRole('button', { name: 'Import (1)' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('.transactions-table tbody tr')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.transactions-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Import documents and receipt photos' }).click();
    await dialog.getByLabel('Include reviewed receipts').check();
    await expect(dialog.getByText('synthetic-invoice.png', { exact: false }).first()).toBeVisible();
    const parsedAgain = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/document-text');
    await dialog.getByRole('button', { name: 'Review receipt' }).click();
    expect((await parsedAgain).ok()).toBe(true);
    await expect(dialog.getByRole('spinbutton', { name: 'Amount 1' })).toHaveValue('2158.8');
    await dialog.getByRole('button', { name: 'Import (1)' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.transactions-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Import documents and receipt photos' }).click();
    await dialog.getByLabel('Parsing engine').selectOption('liteparse');
    const parsedPdf = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/document-text');
    await dialog.locator('#pdf-files').setInputFiles('tests/pages/expense-tracker/fixtures/sample-invoice.pdf');
    expect((await parsedPdf).ok()).toBe(true);
    await expect(dialog.getByRole('spinbutton', { name: 'Amount 1' })).toHaveValue('2158.8');
    await dialog.getByRole('spinbutton', { name: 'Amount 1' }).focus();
    expect(await dialog.locator('.pdf-import-table-wrapper').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(100);
    await dialog.screenshot({ path: testInfo.outputPath(`receipt-review-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import documents and receipt photos' })).toBeFocused();
    const originals = await (await fetch(`${server.url}/api/v1/receipts?status=reviewed`)).json();
    expect(originals.items).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test('the public demo disables receipt capture and pairing without document backend calls', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Browser tests require a base URL.');
  const backendRequests: string[] = [];
  await context.route(`${server.url}/**`, route => {
    if (/\/(?:receipts|receipt-pairings|document-text)(?:[/?]|$)/.test(new URL(route.request().url()).pathname)) backendRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('./expense-tracker');
  await page.getByRole('button', { name: 'Import documents and receipt photos' }).click();
  await expect(page.getByLabel('Take a receipt photo')).toBeDisabled();
  await expect(page.locator('#pdf-files')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start phone pairing' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.goto('./settings');
  await expect(page.getByRole('button', { name: 'Disable all AI features' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enable all AI features' })).toBeDisabled();
  expect(backendRequests).toEqual([]);
});
