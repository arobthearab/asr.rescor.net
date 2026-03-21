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
  questionnaireId?: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ applicationName, notes, questionnaireId }),
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
import type { AuthEvent } from './types';

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

export async function deleteRemediationItem(
  reviewId: string,
  remediationId: string,
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/remediation/${remediationId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return handleResponse(response);
}

// ════════════════════════════════════════════════════════════════════
// Questionnaire Admin — Draft CRUD, Import, Export
// ════════════════════════════════════════════════════════════════════

import type { DraftSummary, DraftDetail, QuestionnaireTemplate } from './types';

const ADMIN_Q = `${BASE_URL}/admin/questionnaire`;

export async function createQuestionnaire(name: string, description?: string): Promise<{ questionnaireId: string; name: string; active: boolean }> {
  const response = await fetch(`${ADMIN_Q}/questionnaires`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name, description }),
  });
  return (await handleResponse(response)) as { questionnaireId: string; name: string; active: boolean };
}

export async function fetchQuestionnaires(): Promise<QuestionnaireTemplate[]> {
  const headers = await authHeaders();
  const response = await fetch(`${ADMIN_Q}/questionnaires`, { headers });
  return (await handleResponse(response)) as QuestionnaireTemplate[];
}

export async function fetchDrafts(): Promise<DraftSummary[]> {
  const headers = await authHeaders();
  const response = await fetch(`${ADMIN_Q}/drafts`, { headers });
  return (await handleResponse(response)) as DraftSummary[];
}

export async function createDraft(label?: string, questionnaireId?: string): Promise<DraftDetail> {
  const response = await fetch(`${ADMIN_Q}/drafts`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ label, questionnaireId }),
  });
  return (await handleResponse(response)) as DraftDetail;
}

export async function fetchDraft(draftId: string): Promise<DraftDetail> {
  const headers = await authHeaders();
  const response = await fetch(`${ADMIN_Q}/drafts/${encodeURIComponent(draftId)}`, { headers });
  return (await handleResponse(response)) as DraftDetail;
}

export async function updateDraft(draftId: string, updates: { label?: string; data?: unknown }): Promise<unknown> {
  const response = await fetch(`${ADMIN_Q}/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(response);
}

export async function publishDraft(draftId: string): Promise<unknown> {
  const response = await fetch(`${ADMIN_Q}/drafts/${encodeURIComponent(draftId)}/publish`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  return handleResponse(response);
}

export async function deleteDraft(draftId: string): Promise<unknown> {
  const response = await fetch(`${ADMIN_Q}/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return handleResponse(response);
}

export async function deleteQuestionnaireVersion(version: string): Promise<unknown> {
  const response = await fetch(`${ADMIN_Q}/versions/${encodeURIComponent(version)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return handleResponse(response);
}

export async function importYaml(yamlText: string): Promise<DraftDetail> {
  const response = await fetch(`${ADMIN_Q}/import`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ yamlContent: yamlText }),
  });
  return (await handleResponse(response)) as DraftDetail;
}

export async function exportQuestionnaire(format: 'yaml' | 'json' = 'yaml'): Promise<string> {
  const headers = await authHeaders();
  const response = await fetch(`${ADMIN_Q}/export?format=${format}`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body && typeof body === 'object' && 'error' in body
      ? String((body as Record<string, unknown>).error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return response.text();
}

// ════════════════════════════════════════════════════════════════════
// Gate Questions — attestation + pre-fill
// ════════════════════════════════════════════════════════════════════

import type { GateWithAnswer, GatePreFillResult } from './types';

export async function fetchGateConfig(): Promise<GateWithAnswer[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/gates`, { headers });
  return (await handleResponse(response)) as GateWithAnswer[];
}

export async function fetchGateAnswers(reviewId: string): Promise<GateWithAnswer[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/gates`, { headers });
  return (await handleResponse(response)) as GateWithAnswer[];
}

export async function answerGate(
  reviewId: string,
  gateId: string,
  choiceIndex: number,
  evidenceNotes?: string,
): Promise<GatePreFillResult> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/gates/${encodeURIComponent(gateId)}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ choiceIndex, evidenceNotes }),
  });
  return (await handleResponse(response)) as GatePreFillResult;
}

export async function clearGate(
  reviewId: string,
  gateId: string,
): Promise<{ gateId: string; clearedCount: number }> {
  const response = await fetch(`${BASE_URL}/reviews/${reviewId}/gates/${encodeURIComponent(gateId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return (await handleResponse(response)) as { gateId: string; clearedCount: number };
}

// ────────────────────────────────────────────────────────────────────
// Document Export — binary downloads
// ────────────────────────────────────────────────────────────────────

async function downloadFile(url: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export async function downloadQuestionnaireDocx(): Promise<void> {
  await downloadFile(`${BASE_URL}/export/questionnaire.docx`, 'ASR_Questionnaire.docx');
}

export async function downloadQuestionnaireXlsx(): Promise<void> {
  await downloadFile(`${BASE_URL}/export/questionnaire.xlsx`, 'ASR_Questionnaire.xlsx');
}

export async function downloadReviewReport(reviewId: string, applicationName?: string): Promise<void> {
  const safeName = (applicationName || 'Review').replace(/[^a-zA-Z0-9_-]/g, '_');
  await downloadFile(
    `${BASE_URL}/reviews/${reviewId}/export/report.docx`,
    `ASR_Report_${safeName}.docx`,
  );
}

// ════════════════════════════════════════════════════════════════════
// Admin — Auth Events (User Activity Log)
// ════════════════════════════════════════════════════════════════════

export async function fetchAuthEvents(params?: {
  limit?: number;
  offset?: number;
  sub?: string;
}): Promise<{ events: AuthEvent[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.sub) query.set('sub', params.sub);
  const queryString = query.toString();
  const url = `${BASE_URL}/admin/auth-events${queryString ? `?${queryString}` : ''}`;
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  return (await handleResponse(response)) as { events: AuthEvent[]; total: number };
}

export async function fetchActiveUserCount(): Promise<number> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/admin/auth-events/active-count`, { headers });
  const body = (await handleResponse(response)) as { activeCount: number };
  return body.activeCount;
}

// ════════════════════════════════════════════════════════════════════
// Admin — Auth Sessions (grouped activity log)
// ════════════════════════════════════════════════════════════════════

export async function fetchAuthSessions(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ sessions: import('./types').AuthSession[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const queryString = query.toString();
  const url = `${BASE_URL}/admin/auth-sessions${queryString ? `?${queryString}` : ''}`;
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  return (await handleResponse(response)) as { sessions: import('./types').AuthSession[]; total: number };
}

export async function fetchSessionEvents(params: {
  sub: string | null;
  from: string;
  to: string;
}): Promise<import('./types').AuthEvent[]> {
  const query = new URLSearchParams();
  if (params.sub) query.set('sub', params.sub);
  query.set('from', params.from);
  query.set('to', params.to);
  const url = `${BASE_URL}/admin/auth-sessions/events?${query.toString()}`;
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  return (await handleResponse(response)) as import('./types').AuthEvent[];
}

// ════════════════════════════════════════════════════════════════════
// Admin — Tenant Dataset Export / Import
// ════════════════════════════════════════════════════════════════════

export interface TenantExportManifest {
  formatVersion: number;
  exportedAt: string;
  exportedBy: string | null;
  sourceTenantId: string;
  sourceTenantName: string;
  counts: Record<string, number>;
}

export interface TenantExportData {
  manifest: TenantExportManifest;
  [key: string]: unknown;
}

export interface TenantImportResult {
  success: boolean;
  targetTenantId: string;
  counts: Record<string, number>;
  warnings: string[];
}

export interface TenantSummary {
  tenantId: string;
  name: string;
  domain: string | null;
  active: boolean;
  created: string;
  userCount: number;
}

export async function fetchTenants(): Promise<TenantSummary[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE_URL}/admin/tenants`, { headers });
  return (await handleResponse(response)) as TenantSummary[];
}

export async function downloadTenantExport(tenantId: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await downloadFile(
    `${BASE_URL}/admin/tenants/${encodeURIComponent(tenantId)}/export`,
    `asr_tenant_${tenantId}_${timestamp}.json`,
  );
}

export async function importTenantData(
  tenantId: string,
  exportData: TenantExportData,
  options?: { conflictStrategy?: string; regenerateIds?: boolean },
): Promise<TenantImportResult> {
  const query = new URLSearchParams();
  if (options?.conflictStrategy) query.set('conflictStrategy', options.conflictStrategy);
  if (options?.regenerateIds) query.set('regenerateIds', 'true');
  const queryString = query.toString();

  const response = await fetch(
    `${BASE_URL}/admin/tenants/${encodeURIComponent(tenantId)}/import${queryString ? `?${queryString}` : ''}`,
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(exportData),
    },
  );
  return (await handleResponse(response)) as TenantImportResult;
}
