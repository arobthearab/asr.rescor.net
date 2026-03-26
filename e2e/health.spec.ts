// ════════════════════════════════════════════════════════════════════
// E2E Smoke Tests — verify services are up and pages load
// ════════════════════════════════════════════════════════════════════

import { test, expect } from './fixtures/test-base';

test.describe('smoke tests', () => {
  test('API health check returns ok', async ({ apiClient }) => {
    // API may still be warming up — retry a few times
    let health = { status: '' };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        health = await apiClient.healthCheck();
        if (health.status === 'ok') break;
      } catch {
        // API not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    expect(health.status).toBe('ok');
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Application Security Review')).toBeVisible();
  });

  test('review page shows not found for invalid ID', async ({ page }) => {
    await page.goto('/review/nonexistent-id-12345');
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 15_000 });
  });

  test('admin users page loads', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByText('User Management')).toBeVisible();
  });

  test('admin questionnaire page loads', async ({ page }) => {
    await page.goto('/admin/questionnaire');
    await expect(page.getByText('Questionnaire Editor')).toBeVisible();
  });
});
