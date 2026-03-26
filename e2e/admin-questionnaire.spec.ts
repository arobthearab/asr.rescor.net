// ════════════════════════════════════════════════════════════════════
// E2E Admin Questionnaire Editor Tests
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe('admin: questionnaire editor', () => {
  test('page loads and shows editor', async ({ page }) => {
    await page.goto('/admin/questionnaire');
    await expect(page.getByText('Questionnaire Editor')).toBeVisible();
  });

  test('create a new draft', async ({ page, uniqueName }) => {
    const draftLabel = uniqueName('Draft');

    await page.goto('/admin/questionnaire');
    await expect(page.getByText('Questionnaire Editor')).toBeVisible();

    // Click New Draft button
    const newDraftButton = page.getByRole('button', { name: /new draft/i });
    await newDraftButton.click();

    // Wait for create draft dialog
    await expect(page.getByText('Create Draft')).toBeVisible();

    // Fill in label
    const labelField = page.getByLabel(/label|name/i);
    await labelField.fill(draftLabel);

    // Click create button
    const createButton = page.locator('[role="dialog"] button').filter({ hasText: /create|save/i });
    await createButton.click();

    // Wait for dialog to close
    await page.waitForTimeout(1000);
  });

  test('navigate back to dashboard', async ({ page }) => {
    await page.goto('/admin/questionnaire');
    await expect(page.getByText('Questionnaire Editor')).toBeVisible();

    // Click back
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await expect(page).toHaveURL('/');
  });
});
