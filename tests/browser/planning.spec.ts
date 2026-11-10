import { expect, test } from '@playwright/test';
import CryptoJS from 'crypto-js';
import { cashflowFixture, expenseSchedule, planningFixture } from '../pages/expense-tracker/planningFixtures';

const key = 'fire-calculator-secret-key-v1-2024';
const storedKey = 'fire-tools-expense-tracker';

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error('Browser base URL is required.');
  await context.addCookies([
    ...[
      ['fire-tools-tour-completed', { completed: true }],
      ['fire-tools-questionnaire-prompt-dismissed', { dismissed: true }],
      ['fire-tools-security-banner-dismissed', { dismissed: true }],
    ].map(([name, value]) => ({
      name: String(name), value: encodeURIComponent(CryptoJS.AES.encrypt(JSON.stringify(value), key).toString()),
      url: baseURL, sameSite: 'Strict' as const,
    })),
    {
      name: 'fire-tools-cookie-consent', url: baseURL, sameSite: 'Strict',
      value: encodeURIComponent(JSON.stringify({ version: '1', acknowledgedAt: new Date().toISOString(), cookieType: 'strictly-necessary' })),
    },
  ]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL).origin || url.protocol === 'data:' ? route.continue() : route.abort();
  });
});

for (const width of [1440, 1280, 1024, 768, 390, 320]) {
  test(`planning and rules remain readable and keyboard reachable at ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width >= 1000 ? 620 : 740 });
    await page.goto('./expense-tracker?tab=planning');
    await expect(page.getByRole('tab', { name: 'Planning', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Cashflow forecast', exact: true })).toBeVisible();
    await expect(page.locator('.cashflow-planning .recharts-surface')).toHaveCount(1);
    const clippedLabels = await page.locator('.cashflow-planning .recharts-surface').evaluate(svg => {
      const bounds = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')].filter(text => {
        const box = text.getBoundingClientRect();
        return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1
          || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1);
      }).map(text => text.textContent);
    });
    expect(clippedLabels).toEqual([]);
    await expect(page.getByRole('button', { name: 'Add goal', exact: true })).toBeDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
    const tab = page.getByRole('tab', { name: 'Planning', exact: true });
    await tab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Rules', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Offline import categorization rules' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Planning', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Hide values', exact: true }).click();
    await expect(page.locator('.cashflow-planning .recharts-surface')).toHaveCount(0);
    await expect(page.getByLabel('Opening cash balance', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`planning-${width}.png`), fullPage: true });
  });
}

test('explicit scheduled confirmation and goal edits persist without background ledger writes', async ({ page }) => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const data = {
    ...cashflowFixture(), planning: planningFixture({
      schedules: [expenseSchedule({ startDate: date, recurrence: { unit: 'once', interval: 1 } })],
      goals: [], rules: [],
    }),
  };
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  await page.addInitScript(({ encrypted, storedKey }) => {
    if (!localStorage.getItem(storedKey)) localStorage.setItem(storedKey, encrypted);
  }, { encrypted, storedKey });
  await page.goto('./expense-tracker?demo=0&tab=planning');
  await expect(page.getByRole('button', { name: 'Add goal', exact: true })).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), storedKey)).toBe(encrypted);
  await page.getByRole('button', { name: 'Record or link', exact: true }).click();
  await page.getByLabel('Actual amount', { exact: true }).fill('125');
  await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record or link', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  await page.getByLabel('Goal name', { exact: true }).fill('Synthetic reserve');
  await page.getByLabel('Target amount', { exact: true }).fill('1000');
  await page.getByLabel('Earmarked balance', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  const saved = await page.evaluate(key => localStorage.getItem(key), storedKey);
  if (!saved) throw new Error('Saved snapshot missing.');
  const snapshot = JSON.parse(CryptoJS.AES.decrypt(saved, key).toString(CryptoJS.enc.Utf8));
  const expenses = snapshot.years.flatMap((year: { months: { expenses: { amount: number }[] }[] }) => year.months.flatMap(month => month.expenses));
  expect(expenses).toHaveLength(1);
  expect(expenses[0].amount).toBe(125);
  expect(snapshot.planning.goals[0].savedAmount).toBe(100);
  await page.reload();
  await expect(page.getByText('Synthetic reserve', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record or link', exact: true })).toHaveCount(0);
});
