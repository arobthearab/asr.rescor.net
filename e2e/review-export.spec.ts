// ════════════════════════════════════════════════════════════════════
// E2E Export Tests — verify DOCX/XLSX downloads trigger
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe('exports', () => {
  test('download questionnaire DOCX from dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Application Security Review')).toBeVisible();

    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download');

    // Click the Word download icon
    await page.getByRole('button', { name: 'Download Questionnaire (Word)' }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.docx$/i);
  });

  test('download questionnaire XLSX from dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Application Security Review')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Questionnaire (Excel)' }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.xlsx$/i);
  });

  test('download Word report from review page', async ({ page, uniqueName, apiClient }) => {
    const reviewName = uniqueName('Export-Docx');
    const review = await apiClient.createReview(reviewName);
    const reviewId = review.reviewId || review.review?.reviewId;

    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Report (Word)' }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.docx$/i);

    // Cleanup
    await apiClient.deleteReview(reviewId);
  });

  test('download Excel export from review page', async ({ page, uniqueName, apiClient }) => {
    const reviewName = uniqueName('Export-Xlsx');
    const review = await apiClient.createReview(reviewName);
    const reviewId = review.reviewId || review.review?.reviewId;

    await page.goto(`/review/${reviewId}`);
    await expect(page.getByText(reviewName)).toBeVisible();

    // The Excel export is a "Download Excel" button in ReviewActions
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download excel/i }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.xlsx$/i);

    // Cleanup
    await apiClient.deleteReview(reviewId);
  });
});
