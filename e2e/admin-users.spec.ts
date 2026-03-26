// ════════════════════════════════════════════════════════════════════
// E2E Admin User Management Tests
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe('admin: user management', () => {
  test('displays user table', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByText('User Management')).toBeVisible();

    // Verify table has at least one row (the dev user)
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible();
  });

  test('provision a new user', async ({ page, uniqueName }) => {
    const email = `${uniqueName('user').toLowerCase()}@test.local`;

    await page.goto('/admin/users');
    await expect(page.getByText('User Management')).toBeVisible();

    // Click Provision User button
    await page.getByRole('button', { name: /provision user/i }).click();

    // Wait for dialog
    await expect(page.getByRole('heading', { name: 'Provision User' })).toBeVisible();

    // Fill in email
    await page.getByLabel('Email address').fill(email);

    // Click Provision/Create button in dialog
    const dialogButtons = page.locator('[role="dialog"] button');
    const provisionButton = dialogButtons.filter({ hasText: /provision|create|save/i });
    await provisionButton.click();

    // Wait for dialog to close and table to update
    await page.waitForTimeout(1000);

    // Verify new user appears in table
    await expect(page.getByRole('cell', { name: email })).toBeVisible();
  });

  test('navigate back to dashboard', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByText('User Management')).toBeVisible();

    // Click the back arrow
    await page.getByRole('button', { name: 'Back to dashboard' }).click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/');
  });
});
