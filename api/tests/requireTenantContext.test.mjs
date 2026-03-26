// ════════════════════════════════════════════════════════════════════
// Unit Tests — requireTenantContext middleware
// ════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { requireTenantContext, initializeTenantContext } from '../src/middleware/requireTenantContext.mjs';

function createMockRequest(tenantId, extra = {}) {
  return {
    user: { sub: 'test-user', tenantId, ...extra },
    path: '/api/test',
    method: 'GET',
  };
}

function createMockResponse() {
  const response = {
    statusCode: null,
    body: null,
    status(code) { response.statusCode = code; return response; },
    json(data) { response.body = data; return response; },
  };
  return response;
}

describe('requireTenantContext', () => {
  beforeEach(() => {
    initializeTenantContext({ recorder: null, tenantStore: null });
  });

  it('calls next when tenantId is present', async () => {
    const request = createMockRequest('tenant-1');
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(response.statusCode).toBeNull();
  });

  it('rejects with 403 when tenantId is null', async () => {
    const request = createMockRequest(null);
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe('MISSING_TENANT');
  });

  it('rejects with 403 when tenantId is undefined', async () => {
    const request = createMockRequest(undefined);
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(403);
  });

  it('rejects with 403 when user object is missing', async () => {
    const request = { user: null, path: '/test', method: 'GET' };
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(403);
  });

  it('blocks OFFBOARDING tenant when tenantStore is wired', async () => {
    const mockTenantStore = {
      getTenantStatus: async () => ({ status: 'OFFBOARDING' }),
    };
    initializeTenantContext({ recorder: null, tenantStore: mockTenantStore });

    const request = createMockRequest('tenant-offboarding');
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe('TENANT_OFFBOARDING');
  });

  it('allows active tenant when tenantStore is wired', async () => {
    const mockTenantStore = {
      getTenantStatus: async () => ({ status: 'ACTIVE' }),
    };
    initializeTenantContext({ recorder: null, tenantStore: mockTenantStore });

    const request = createMockRequest('tenant-active');
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(response.statusCode).toBeNull();
  });

  it('proceeds when tenantStore.getTenantStatus throws', async () => {
    const mockTenantStore = {
      getTenantStatus: async () => { throw new Error('DB down'); },
    };
    initializeTenantContext({ recorder: null, tenantStore: mockTenantStore });

    const request = createMockRequest('tenant-1');
    const response = createMockResponse();
    let nextCalled = false;

    await requireTenantContext(request, response, () => { nextCalled = true; });

    // Fail-open on store error (existing behavior — store error doesn't block)
    expect(nextCalled).toBe(true);
  });
});
