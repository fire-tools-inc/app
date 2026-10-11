import { expect, test, type Page } from '@playwright/test';
import CryptoJS from 'crypto-js';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ context, baseURL, page }) => {
  if (!baseURL) throw new Error('A browser-test base URL is required.');
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  const preferences = [
    { name: 'fire-tools-tour-completed', payload: { completed: true } },
    { name: 'fire-tools-questionnaire-prompt-dismissed', payload: { dismissed: true } },
    { name: 'fire-tools-security-banner-dismissed', payload: { dismissed: true } },
  ];
  await context.addCookies(preferences.map(({ name, payload }) => ({
    name,
    value: encodeURIComponent(CryptoJS.AES.encrypt(
      JSON.stringify(payload), 'fire-calculator-secret-key-v1-2024',
    ).toString()),
    url: baseURL,
    sameSite: 'Strict' as const,
  })));
  await context.addCookies([{
    name: 'fire-tools-cookie-consent',
    value: encodeURIComponent(JSON.stringify({
      version: '1', acknowledgedAt: new Date().toISOString(), cookieType: 'strictly-necessary',
    })),
    url: baseURL,
    sameSite: 'Strict',
  }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/\/(?:api\/yahoo|v8\/finance\/chart|v10\/finance\/quoteSummary)/.test(url.pathname)) {
      const timestamps = Array.from({ length: (new Date().getUTCFullYear() - 1990 + 1) * 12 },
        (_, month) => Date.UTC(1990, month, 1) / 1000);
      const prices = timestamps.map((_, index) => 100 + index / 10);
      return route.fulfill({
        json: {
          chart: {
            result: [{
              meta: { currency: 'EUR', shortName: 'Synthetic asset', regularMarketPrice: 100 },
              timestamp: timestamps,
              indicators: { quote: [{ close: prices, open: prices, high: prices, low: prices }], adjclose: [{ adjclose: prices }] },
            }],
            error: null,
          },
          quoteSummary: {
            result: [{ price: { currency: 'EUR', longName: 'Synthetic fund' }, fundProfile: {} }],
            error: null,
          },
        },
      });
    }
    return url.origin === new URL(baseURL).origin || url.protocol === 'data:'
      ? route.continue()
      : route.abort();
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function navigate(page: Page, route: string) {
  const nav = page.locator('.app-navigation');
  if (!await nav.isVisible()) {
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  }
  await nav.locator(`a[href$="/${route}"]`).click();
  await page.waitForLoadState('networkidle');
}

async function expectHealthyPlots(page: Page) {
  await expect.poll(() => page.locator('.recharts-wrapper > .recharts-surface').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.recharts-wrapper > .recharts-surface').evaluateAll(surfaces => {
    const failures: string[] = [];
    for (const svg of surfaces) {
      const frame = svg.getBoundingClientRect();
      if (frame.width < 180 || frame.height < 180) failures.push(`Small plot: ${frame.width} x ${frame.height}`);
      const grid = svg.querySelector('.recharts-cartesian-grid')?.getBoundingClientRect();
      if (grid && grid.height < 120) failures.push(`Legend squeezed the plot to ${grid.height}px`);
      for (const element of svg.querySelectorAll('.recharts-sector, .recharts-line-curve, .recharts-bar-rectangle path, text')) {
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        if (bounds.left < frame.left - 3 || bounds.right > frame.right + 3 ||
          bounds.top < frame.top - 3 || bounds.bottom > frame.bottom + 3) {
          failures.push(`Cropped ${element.textContent || element.getAttribute('class')}`);
        }
      }
    }
    return failures;
  })).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('the branded icon rail expands, persists and keeps every destination named', async ({ page }) => {
  await page.goto('./asset-allocation');
  const brand = page.locator('.app-navigation-brand img');
  await expect(brand).toBeVisible();
  await expect.poll(() => brand.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const expandedWidth = await page.locator('.app-workspace').evaluate(element => element.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.app-navigation')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.app-navigation-label').first()).toBeHidden();
  await expect(page.locator('.app-navigation').getByRole('link', { name: 'Asset Allocation', exact: true })).toHaveAttribute('aria-current', 'page');
  const collapsedWidth = await page.locator('.app-workspace').evaluate(element => element.getBoundingClientRect().width);
  expect(collapsedWidth - expandedWidth).toBeGreaterThanOrEqual(100);
  await expectHealthyPlots(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).press('Enter');
  await expect(page.locator('.app-navigation')).not.toHaveClass(/is-collapsed/);
  await expectHealthyPlots(page);
});

test('mobile keeps full labels and returns keyboard focus to its trigger', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  const toggle = page.getByRole('button', { name: 'Toggle navigation menu' });
  await toggle.click();
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  await expect(page.locator('.app-navigation-label').first()).toBeVisible();
  expect(await page.locator('.app-workspace').evaluate(element => element.hasAttribute('inert'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  expect(await page.locator('.app-workspace').evaluate(element => element.hasAttribute('inert'))).toBe(false);
});

for (const width of [1440, 1024, 390, 320]) {
  test(`plot geometry stays complete across routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./asset-allocation');
    await expectHealthyPlots(page);
    for (const route of ['portfolio-breakdown', 'fire-calculator', 'investment-growth', 'net-worth-tracker', 'asset-allocation']) {
      await navigate(page, route);
      await expectHealthyPlots(page);
    }
  });
}

for (const width of [1440, 320]) {
  test(`cashflow, withdrawal, debt and backtest plots remain readable at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./expense-tracker');
    await page.waitForURL(url => url.searchParams.has('year') && url.searchParams.has('month'));
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Analytics' }).click();
    await page.locator('#analytics-view').selectOption('yearly');
    await expect.poll(() => page.locator('.recharts-wrapper > .recharts-surface').count()).toBe(3);
    await expectHealthyPlots(page);
    for (const route of ['withdrawal-rate', 'debt-payoff']) {
      await navigate(page, route);
      await expectHealthyPlots(page);
    }
    await navigate(page, 'portfolio-backtest');
    await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
    await expect.poll(() => page.locator('.backtest-charts-row .recharts-wrapper').count(), { timeout: 15000 }).toBe(2);
    await expectHealthyPlots(page);
  });

  test(`all currency comparisons keep a useful plot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./net-worth-tracker');
    const currencies = page.locator('.chart-currency-selector .currency-btn');
    await expect(currencies).toHaveCount(6);
    for (const button of await currencies.all()) await button.click();
    await expectHealthyPlots(page);
  });

  test(`Monte Carlo histogram remains readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./monte-carlo');
    await page.getByRole('button', { name: 'Run Monte Carlo simulations', exact: true }).click();
    await expect(page.locator('.histogram-bar').first()).toBeVisible({ timeout: 15000 });
    expect(await page.locator('.histogram-scroll').evaluate(region => {
      const columns = region.querySelector('.histogram-columns');
      const bins = Array.from(region.querySelectorAll('.histogram-bin'));
      const heights = Array.from(region.querySelectorAll('.histogram-bar')).map(bar => bar.getBoundingClientRect().height);
      return region.getAttribute('tabindex') === '0' && columns && bins.length > 0 &&
        bins.every(bin => bin.getBoundingClientRect().width >= 40) && Math.max(...heights) >= 170;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
