// ════════════════════════════════════════════════════════════════════
// ASR API Client
// ════════════════════════════════════════════════════════════════════

import { msalInstance, apiScopes, isMsalConfigured } from './authConfig';

const BASE_URL = '/api';

// ────────────────────────────────────────────────────────────────────
// getAccessToken — acquire token silently from MSAL cache
// ────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  let result: string | null = null;

  if (isMsalConfigured && apiScopes.length > 0) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          scopes: apiScopes,
          account: accounts[0],
        });
        result = tokenResponse.accessToken;
      } catch {
        // Silent acquisition failed — token will be null
      }
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// authHeaders — build Authorization header if token available
// ────────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

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
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/config`, { headers });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchConfigurationVersion — load a historical questionnaire snapshot
// ────────────────────────────────────────────────────────────────────

export async function fetchConfigurationVersion(version: string): Promise<unknown> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/config?version=${encodeURIComponent(version)}`, { headers });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchVersions — list available questionnaire versions
// ────────────────────────────────────────────────────────────────────

export async function fetchVersions(): Promise<unknown> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/config/versions`, { headers });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchReviews — list all active reviews
// ────────────────────────────────────────────────────────────────────

export async function fetchReviews(): Promise<unknown[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/reviews`, { headers });
  return (await handleResponse(response)) as unknown[];
}

// ────────────────────────────────────────────────────────────────────
// fetchReview — get single review with answers
// ────────────────────────────────────────────────────────────────────

export async function fetchReview(reviewId: string): Promise<unknown> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}`, { headers });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// renameReview — update application name
// ────────────────────────────────────────────────────────────────────

export async function renameReview(
  reviewId: string,
  applicationName: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/rename`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ applicationName }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// createReview
// ────────────────────────────────────────────────────────────────────

export async function createReview(
  applicationName: string,
  notes: string = '',
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ applicationName, notes }),
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
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/answers`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ classificationFactor, answers }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// submitReview
// ────────────────────────────────────────────────────────────────────

export async function submitReview(reviewId: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/submit`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
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
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/classification`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ choiceText, factor }),
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
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/deployment`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ sourceChoice, environmentChoice }),
  });
  return handleResponse(response);
}

// ────────────────────────────────────────────────────────────────────
// fetchCurrentUser — /api/auth/me
// ────────────────────────────────────────────────────────────────────

export interface CurrentUser {
  sub: string;
  preferred_username: string;
  email: string | null;
  roles: string[];
  tenantId: string | null;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/auth/me`, { headers });
  return (await handleResponse(response)) as CurrentUser;
}

// ════════════════════════════════════════════════════════════════════
// Admin — user management + review reassignment
// ════════════════════════════════════════════════════════════════════

export interface AdminUser {
  sub: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  roles: string[];
  firstSeen: string | null;
  lastSeen: string | null;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/admin/users`, { headers });
  return (await handleResponse(response)) as AdminUser[];
}

export async function provisionUser(
  email: string,
  roles: string[],
): Promise<AdminUser> {
  const response = await fetch(`${BASE_URL}/admin/users`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, roles }),
  });
  return (await handleResponse(response)) as AdminUser;
}

export async function updateUserRoles(
  sub: string,
  roles: string[],
): Promise<AdminUser> {
  const response = await fetch(`${BASE_URL}/admin/users/${encodeURIComponent(sub)}/roles`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ roles }),
  });
  return (await handleResponse(response)) as AdminUser;
}

export async function deleteReview(reviewId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body && typeof body === 'object' && 'error' in body
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${response.status}`,
    );
  }
}

export async function reassignReview(
  reviewId: string,
  assessor: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/admin/reviews/${reviewId}/reassign`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ assessor }),
  });
  return handleResponse(response);
}

// ════════════════════════════════════════════════════════════════════
// Remediation / POAM
// ════════════════════════════════════════════════════════════════════

import type { RemediationItem, RemediationStatus, FunctionCode, ResponseType } from './types';

export async function fetchRemediation(reviewId: string): Promise<RemediationItem[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation`, { headers });
  return (await handleResponse(response)) as RemediationItem[];
}

export async function generateRemediation(reviewId: string): Promise<{ created: number }> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/generate`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  return (await handleResponse(response)) as { created: number };
}

export async function addRemediationItem(
  reviewId: string,
  params: {
    domainIndex: number;
    questionIndex: number;
    proposedAction?: string;
    assignedFunction?: FunctionCode;
    responseType?: ResponseType;
    mitigationPercent?: number;
  },
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/add`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse(response);
}

export async function updateRemediationItem(
  reviewId: string,
  remediationId: string,
  updates: {
    proposedAction?: string;
    assignedFunction?: FunctionCode;
    assignedTo?: string;
    notes?: string;
    responseType?: ResponseType;
    mitigationPercent?: number;
  },
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/${remediationId}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(response);
}

export async function updateRemediationStatus(
  reviewId: string,
  remediationId: string,
  status: RemediationStatus,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/${remediationId}/status`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ status }),
  });
  return handleResponse(response);
}

export async function acceptRisk(
  reviewId: string,
  remediationId: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/${remediationId}/accept-risk`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  return handleResponse(response);
}
