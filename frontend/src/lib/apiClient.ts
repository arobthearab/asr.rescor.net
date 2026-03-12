// ════════════════════════════════════════════════════════════════════
// ASR API Client
// ════════════════════════════════════════════════════════════════════

const BASE_URL = '/api';

// ────────────────────────────────────────────────────────────────────
// Shared response handler — throws on non-2xx status
// ────────────────────────────────────────────────────────────────────

async function handleResponse(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const serverMessage =
      body && typeof body === 'object' && 'error' in body
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
    throw new Error(serverMessage);
  }
  return body;
}

// ────────────────────────────────────────────────────────────────────
// fetchConfiguration — load questionnaire + scoring config
// ────────────────────────────────────────────────────────────────────

export async function fetchConfiguration(): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/config`);
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchConfigurationVersion — load a historical questionnaire snapshot
// ────────────────────────────────────────────────────────────────────

export async function fetchConfigurationVersion(version: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/config?version=${encodeURIComponent(version)}`);
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchVersions — list available questionnaire versions
// ────────────────────────────────────────────────────────────────────

export async function fetchVersions(): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/config/versions`);
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchReviews — list all active reviews
// ────────────────────────────────────────────────────────────────────

export async function fetchReviews(): Promise<unknown[]> {
  const response = await fetch(`${BASE_URL}/reviews`);
  return (await handleResponse(response)) as unknown[];
}

// ────────────────────────────────────────────────────────────────────
// fetchReview — get single review with answers
// ────────────────────────────────────────────────────────────────────

export async function fetchReview(reviewId: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}`);
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// renameReview — update application name
// ────────────────────────────────────────────────────────────────────

export async function renameReview(
  reviewId: string,
  applicationName: string,
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationName, assessor }),
  });
  return handleResponse(response);
}
// ────────────────────────────────────────────────────────────────────

export async function createReview(
  applicationName: string,
  assessor: string,
  notes: string = '',
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationName, assessor, notes }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// saveAnswers — bulk upsert answers for a review
// ────────────────────────────────────────────────────────────────────

export async function saveAnswers(
  reviewId: string,
  classificationFactor: number,
  answers: unknown[],
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/answers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classificationFactor, answers, assessor }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// submitReview
// ────────────────────────────────────────────────────────────────────

export async function submitReview(
  reviewId: string,
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessor }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// updateClassification — set risk classification on a review
// ────────────────────────────────────────────────────────────────────

export async function updateClassification(
  reviewId: string,
  choiceText: string,
  factor: number,
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/classification`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choiceText, factor, assessor }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// updateDeployment — set source × environment on a review
// ────────────────────────────────────────────────────────────────────

export async function updateDeployment(
  reviewId: string,
  sourceChoice: string,
  environmentChoice: string,
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/deployment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceChoice, environmentChoice, assessor }),
  });
  return handleResponse(response);
}
