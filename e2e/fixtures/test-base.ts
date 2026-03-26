// ════════════════════════════════════════════════════════════════════
// E2E Test Base Fixture — shared helpers for all E2E tests
// ════════════════════════════════════════════════════════════════════

import { test as base, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:3100/api';

interface AsrFixtures {
  uniqueName: (prefix?: string) => string;
  apiClient: {
    createReview: (name: string, questionnaireId?: string) => Promise<Record<string, unknown>>;
    deleteReview: (reviewId: string) => Promise<void>;
    getReviews: () => Promise<Array<Record<string, unknown>>>;
    healthCheck: () => Promise<{ status: string }>;
  };
}

export const test = base.extend<AsrFixtures>({
  uniqueName: async ({}, use) => {
    const generator = (prefix = 'E2E') =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await use(generator);
  },

  apiClient: async ({}, use) => {
    const client = {
      async createReview(name: string, questionnaireId?: string) {
        const body: Record<string, unknown> = { applicationName: name };
        if (questionnaireId) {
          body.questionnaireId = questionnaireId;
        }
        const response = await fetch(`${API_BASE_URL}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        return data.review ?? data;
      },

      async deleteReview(reviewId: string) {
        await fetch(`${API_BASE_URL}/reviews/${reviewId}`, {
          method: 'DELETE',
        });
      },

      async getReviews() {
        const response = await fetch(`${API_BASE_URL}/reviews`);
        return response.json();
      },

      async healthCheck() {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.json();
      },
    };

    await use(client);
  },
});

export { expect };
