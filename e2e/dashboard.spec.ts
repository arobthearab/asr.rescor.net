// ════════════════════════════════════════════════════════════════════
// E2E Dashboard Tests — review CRUD and filtering
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe('dashboard', () => {
  test('displays review table with headers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Application Security Review')).toBeVisible();

    // Verify table headers exist
    await expect(page.getByRole('columnheader', { name: /Application/i })).toBeVisible();
  });

  test('create a new review via dialog', async ({ page, uniqueName }) => {
    const reviewName = uniqueName('Review');

    await page.goto('/');
    await page.getByRole('button', { name: 'New Review' }).click();

    // Wait for dialog
    await expect(page.getByText('New Application Security Review')).toBeVisible();

    // Fill in the application name
    await page.getByLabel('Application Name').fill(reviewName);
    await page.getByRole('button', { name: 'Create' }).click();

    // Should navigate to the review page
    await expect(page).toHaveURL(/\/review\/[a-f0-9-]+/);

    // Navigate back and verify the review appears
    await page.goto('/');
    await expect(page.getByRole('cell', { name: reviewName })).toBeVisible();
  });

  test('rename a review', async ({ page, uniqueName, apiClient }) => {
    const originalName = uniqueName('Rename-Original');
    const newName = uniqueName('Rename-New');

    // Create via API
    await apiClient.createReview(originalName);

    await page.goto('/');
    await expect(page.getByRole('cell', { name: originalName })).toBeVisible();

    // Click rename icon on the row
    const row = page.getByRole('row').filter({ hasText: originalName });
    await row.locator('[title="Rename"]').click();

    // Wait for rename dialog
    await expect(page.getByText('Rename Assessment')).toBeVisible();

    // Clear and type new name
    const nameField = page.getByLabel('Application Name');
    await nameField.clear();
    await nameField.fill(newName);
    await page.getByRole('button', { name: 'Rename' }).click();

    // Verify the new name appears
    await expect(page.getByRole('cell', { name: newName })).toBeVisible();
  });

  test('delete a review', async ({ page, uniqueName, apiClient }) => {
    const reviewName = uniqueName('Delete-Me');

    // Create via API
    await apiClient.createReview(reviewName);

    await page.goto('/');
    await expect(page.getByRole('cell', { name: reviewName })).toBeVisible();

    // Click delete icon on the row
    const row = page.getByRole('row').filter({ hasText: reviewName });
    await row.locator('[title="Delete"]').click();

    // Confirm deletion dialog
    await expect(page.getByText('Delete Assessment')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify the review disappears
    await expect(page.getByRole('cell', { name: reviewName })).not.toBeVisible();
  });

  test('filter reviews by search text', async ({ page, uniqueName, apiClient }) => {
    const searchTarget = uniqueName('Searchable');
    await apiClient.createReview(searchTarget);

    await page.goto('/');
    await expect(page.getByRole('cell', { name: searchTarget })).toBeVisible();

    // Type in the search field
    const searchField = page.getByPlaceholder(/search/i);
    await searchField.fill(searchTarget);

    // The target should still be visible
    await expect(page.getByRole('cell', { name: searchTarget })).toBeVisible();

    // Clear search
    await searchField.clear();
  });
});
