import { expect, test, type Page } from '@playwright/test';
import CryptoJS from 'crypto-js';

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error('A browser-test base URL is required.');
  await context.addCookies([
    ['fire-tools-tour-completed', { completed: true }],
    ['fire-tools-questionnaire-prompt-dismissed', { dismissed: true }],
    ['fire-tools-security-banner-dismissed', { dismissed: true }],
  ].map(([name, payload]) => ({
    name: String(name),
    value: encodeURIComponent(CryptoJS.AES.encrypt(
      JSON.stringify(payload), 'fire-calculator-secret-key-v1-2024',
    ).toString()),
    url: baseURL,
    sameSite: 'Strict' as const,
  })));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL).origin || url.protocol === 'data:'
      ? route.continue()
      : route.abort();
  });
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
