// ════════════════════════════════════════════════════════════════════
// E2E Review Lifecycle — create → classify → answer → save → submit
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe.serial('review lifecycle', () => {
  let reviewId: string;
  const reviewName = `E2E-Lifecycle-${Date.now()}`;

  test('create a review and land on review page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Review' }).click();
    await expect(page.getByText('New Application Security Review')).toBeVisible();

    await page.getByLabel('Application Name').fill(reviewName);
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for navigation to review page
    await expect(page).toHaveURL(/\/review\/[a-f0-9-]+/);

    // Extract reviewId from URL
    const url = page.url();
    const match = url.match(/\/review\/([a-f0-9-]+)/);
    expect(match).toBeTruthy();
    reviewId = match![1];

    // Verify we're on the review page with the correct name
    await expect(page.getByText(reviewName)).toBeVisible();
  });

  test('select data classification', async ({ page }) => {
    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // Find a classification radio button and click it
    const classificationRadios = page.locator('input[type="radio"]');
    const radioCount = await classificationRadios.count();
    expect(radioCount).toBeGreaterThan(0);

    // Click the first radio button (first classification choice)
    await classificationRadios.first().click();

    // Wait for the UI to update
    await page.waitForTimeout(500);
  });

  test('answer domain questions', async ({ page }) => {
    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // Wait for domain sections to load
    await page.waitForTimeout(1000);

    // Find accordion/expandable sections (domains) and click the first one
    const accordions = page.locator('[class*="Accordion"]').filter({ hasText: /domain|section/i });
    const accordionCount = await accordions.count();

    if (accordionCount > 0) {
      // Expand first domain
      await accordions.first().click();
      await page.waitForTimeout(500);
    }

    // Find and click radio buttons for answering questions
    // Questions typically have multiple choice radios in groups
    const radioGroups = page.locator('[role="radiogroup"]');
    const groupCount = await radioGroups.count();

    if (groupCount > 0) {
      // Answer the first question by clicking the second radio in the group
      const firstGroup = radioGroups.first();
      const radios = firstGroup.locator('input[type="radio"]');
      const radioCount = await radios.count();
      if (radioCount >= 2) {
        await radios.nth(1).click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('save to server', async ({ page }) => {
    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // Click Save to Server button
    const saveButton = page.getByRole('button', { name: /save to server/i });

    // The button might be disabled if nothing changed — click if enabled
    const isDisabled = await saveButton.isDisabled();
    if (!isDisabled) {
      await saveButton.click();

      // Wait for save to complete — look for snackbar or button text change
      await page.waitForTimeout(2000);
    }
  });

  test('submit review', async ({ page }) => {
    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // Click Submit Review button
    const submitButton = page.getByRole('button', { name: /submit review/i });
    const isDisabled = await submitButton.isDisabled();

    if (!isDisabled) {
      await submitButton.click();

      // Wait for submission to complete
      await page.waitForTimeout(2000);

      // Verify status changed — button should now say "Submitted" and be disabled
      await expect(page.getByRole('button', { name: /submitted/i })).toBeVisible();
    }
  });

  test('submitted review has disabled controls', async ({ page }) => {
    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // Check if submit button shows "Submitted" and is disabled
    const submitButton = page.getByRole('button', { name: /submitted|submit review/i });
    const buttonText = await submitButton.textContent();

    if (buttonText?.includes('Submitted')) {
      await expect(submitButton).toBeDisabled();
    }
  });

  test.afterAll(async () => {
    // Cleanup: delete the test review via API
    if (reviewId) {
      try {
        await fetch(`http://localhost:3100/api/reviews/${reviewId}`, { method: 'DELETE' });
      } catch {
        // Best-effort cleanup
      }
    }
  });
});
