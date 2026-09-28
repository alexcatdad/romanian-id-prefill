import { expect, test } from '@playwright/test';
import { createSyntheticMrz } from '../fixtures';

test('switching languages during offline review preserves accented names and makes no requests', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByText('Local reader ready', { exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Try a synthetic example', exact: true }).click();
  await page.getByRole('button', { name: 'Read selected MRZ', exact: true }).click();
  await expect(page.locator('#cnp')).toHaveValue(createSyntheticMrz().cnp);
  await page.locator('#full-name').fill('EXEMPLU ȘTEFĂNIȚĂ');
  await page.getByRole('button', { name: 'Română', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.locator('#full-name')).toHaveValue('EXEMPLU ȘTEFĂNIȚĂ');
  await expect(page.locator('#cnp')).toHaveValue(createSyntheticMrz().cnp);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.locator('#cnp').fill('2960526400010');
  await expect(page.locator('#cnp-issues')).toContainText('Cifra de control a CNP-ului nu corespunde.');
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#cnp-issues')).toContainText('The CNP checksum does not match.');
  await page.locator('#cnp').fill(createSyntheticMrz().cnp);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Use these details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready to prefill' })).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test.describe('Romanian browser preference', () => {
  test.use({ locale: 'ro-RO' });
  test('completes local OCR and mandatory review with Romanian controls', async ({ page, context }) => {
    await page.goto('./');
    const demo = page.getByRole('button', { name: 'Încearcă un exemplu fictiv', exact: true });
    await expect(demo).toBeEnabled();
    await context.setOffline(true);
    await demo.click();
    await page.getByRole('button', { name: 'Citește zona MRZ selectată', exact: true }).click();
    await expect(page.locator('#cnp')).toHaveValue(createSyntheticMrz().cnp);
    const confirm = page.getByRole('button', { name: 'Folosește aceste date', exact: true });
    await expect(confirm).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Am verificat numele și CNP-ul', exact: true }).check();
    await confirm.click();
    await expect(page.getByRole('button', { name: 'Șterge datele', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Șterge datele', exact: true }).click();
    await expect(page.locator('#cnp')).toHaveValue('');
    await expect(demo).toBeEnabled();
  });
  test('starts in Romanian and keeps language choice session-only', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await expect(page.getByRole('button', { name: 'Română', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Verifică datele tale', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add your identity card', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  });
});
