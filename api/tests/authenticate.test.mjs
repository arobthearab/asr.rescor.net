// ════════════════════════════════════════════════════════════════════
// Unit Tests — Authentication middleware (Entra ID JWT + service accounts)
// ════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

// Mock jose before importing the module under test
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

import { createAuthenticationMiddleware } from '../src/middleware/authenticate.mjs';
import { jwtVerify } from 'jose';

// ── Helpers ───────────────────────────────────────────────────────

function createMockRequest(authorizationHeader = null, host = 'localhost:3100') {
  return {
    headers: {
      authorization: authorizationHeader,
      host,
    },
    ip: '127.0.0.1',
    user: null,
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

function createMockUserStore() {
  return {
    ensureUser: vi.fn(async (user) => user),
  };
}

function createMockAuthEventStore() {
  return {
    logEvent: vi.fn(async () => {}),
  };
}

function createMockServiceAccountStore(accounts = {}) {
  return {
    findByApiKeyHash: vi.fn(async (hash) => accounts[hash] || null),
  };
}

// ── Test suites ──────────────────────────────────────────────────

describe('authenticate middleware', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ── No token, no dev bypass (production) ───────────────────────

  describe('production mode (isDevelopment=false)', () => {
    it('rejects with 401 when no token is provided', async () => {
      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest(null, 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('rejects with 401 for invalid JWT', async () => {
      jwtVerify.mockRejectedValueOnce(new Error('Invalid token'));

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest('Bearer invalid-jwt-token', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('attaches user from valid JWT and calls next', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          preferred_username: 'testuser@example.com',
          email: 'testuser@example.com',
          name: 'Test User',
          roles: ['reader'],
          tid: 'test-tenant',
          iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
          aud: 'test-client',
        },
      });

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest('Bearer valid-jwt', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.sub).toBe('user-123');
      expect(request.user.email).toBe('testuser@example.com');
      expect(request.user.roles).toEqual(['reader']);
      expect(request.user.tenantId).toBe('test-tenant');
    });

    it('merges persisted roles from UserStore', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-456',
          preferred_username: 'admin@example.com',
          email: 'admin@example.com',
          name: 'Admin',
          roles: [],
          tid: 'test-tenant',
          iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
          aud: 'test-client',
        },
      });

      const userStore = createMockUserStore();
      userStore.ensureUser.mockResolvedValueOnce({ roles: ['admin'] });

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        userStore,
      });

      const request = createMockRequest('Bearer valid-jwt', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.roles).toEqual(['admin']);
    });
  });

  // ── Development mode ───────────────────────────────────────────

  describe('development mode (isDevelopment=true)', () => {
    it('attaches dev user when no token and request is from localhost', async () => {
      const middleware = createAuthenticationMiddleware({
        isDevelopment: true,
        tenantId: null,
        clientId: null,
      });

      const request = createMockRequest(null, 'localhost:3100');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.sub).toBe('dev-user-0000');
      expect(request.user.roles).toContain('admin');
    });

    it('rejects when no token and request is from non-localhost (proxied)', async () => {
      const middleware = createAuthenticationMiddleware({
        isDevelopment: true,
        tenantId: null,
        clientId: null,
      });

      const request = createMockRequest(null, 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
    });

    it('falls back to dev user when JWT validation fails on localhost', async () => {
      jwtVerify.mockRejectedValueOnce(new Error('Token expired'));

      const middleware = createAuthenticationMiddleware({
        isDevelopment: true,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest('Bearer expired-jwt', 'localhost:3100');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.sub).toBe('dev-user-0000');
    });
  });

  // ── Service account keys ───────────────────────────────────────

  describe('service account authentication', () => {
    it('authenticates valid service account key', async () => {
      const apiKey = 'sa_test-key-12345';
      const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

      const serviceAccountStore = createMockServiceAccountStore({
        [apiKeyHash]: {
          serviceAccountId: 'sa-uuid-1',
          label: 'CC API',
          roles: ['admin'],
          tenantId: 'tenant-1',
        },
      });

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        serviceAccountStore,
      });

      const request = createMockRequest(`Bearer ${apiKey}`, 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.sub).toBe('sa:sa-uuid-1');
      expect(request.user.roles).toEqual(['admin']);
      expect(request.user.iss).toBe('service-account');
    });

    it('rejects invalid service account key with 401', async () => {
      const serviceAccountStore = createMockServiceAccountStore({});

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        serviceAccountStore,
      });

      const request = createMockRequest('Bearer sa_bad-key', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBe('Invalid API key');
    });
  });

  // ── Token denylist ─────────────────────────────────────────────

  describe('token denylist integration', () => {
    it('rejects revoked token with 401', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-revoked',
          jti: 'revoked-jti',
          preferred_username: 'revoked@example.com',
          tid: 'test-tenant',
          iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
          aud: 'test-client',
        },
      });

      const tokenDenylist = {
        isDenied: vi.fn((jti) => jti === 'revoked-jti'),
      };

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        tokenDenylist,
      });

      const request = createMockRequest('Bearer valid-but-revoked', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBe('Session revoked');
    });
  });

  // ── DAST mode ──────────────────────────────────────────────────

  describe('DAST scanner bypass', () => {
    it('attaches dast-scanner user when DAST_MODE=true and NODE_ENV=test', async () => {
      process.env.DAST_MODE = 'true';
      process.env.NODE_ENV = 'test';

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest(null, 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(request.user.sub).toBe('dast-scanner');
      expect(request.user.roles).toEqual(['reader']);
    });

    it('does not bypass when DAST_MODE is absent', async () => {
      delete process.env.DAST_MODE;
      process.env.NODE_ENV = 'test';

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
      });

      const request = createMockRequest(null, 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
    });
  });

  // ── Multi-tenant issuer validation ─────────────────────────────

  describe('multi-tenant issuer validation', () => {
    it('rejects untrusted issuer format', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-bad-iss',
          iss: 'https://evil.example.com/v2.0',
          aud: 'test-client',
          tid: 'evil-tenant',
        },
      });

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: null,
        clientId: 'test-client',
      });

      const request = createMockRequest('Bearer token-bad-issuer', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBe('Untrusted issuer');
    });

    it('rejects tenant not in allowedTenants list', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-wrong-tenant',
          iss: 'https://login.microsoftonline.com/aabbccdd-1122-3344-5566-778899aabbcc/v2.0',
          aud: 'test-client',
          tid: 'aabbccdd-1122-3344-5566-778899aabbcc',
        },
      });

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: null,
        clientId: 'test-client',
        allowedTenants: ['allowed-tenant-1', 'allowed-tenant-2'],
      });

      const request = createMockRequest('Bearer token-wrong-tenant', 'api.example.com');
      const response = createMockResponse();
      let nextCalled = false;

      await middleware(request, response, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.body.error).toBe('Tenant not authorized');
    });
  });

  // ── Auth event logging ─────────────────────────────────────────

  describe('auth event logging', () => {
    it('logs successful authentication', async () => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-logged',
          preferred_username: 'logged@example.com',
          tid: 'test-tenant',
          iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
          aud: 'test-client',
        },
      });

      const authEventStore = createMockAuthEventStore();

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        authEventStore,
      });

      const request = createMockRequest('Bearer valid-jwt', 'api.example.com');
      const response = createMockResponse();

      await middleware(request, response, () => {});

      expect(authEventStore.logEvent).toHaveBeenCalledOnce();
      const eventArgs = authEventStore.logEvent.mock.calls[0][0];
      expect(eventArgs.sub).toBe('user-logged');
      expect(eventArgs.outcome).toBe('success');
    });

    it('logs failed authentication', async () => {
      const authEventStore = createMockAuthEventStore();

      const middleware = createAuthenticationMiddleware({
        isDevelopment: false,
        tenantId: 'test-tenant',
        clientId: 'test-client',
        authEventStore,
      });

      const request = createMockRequest(null, 'api.example.com');
      const response = createMockResponse();

      await middleware(request, response, () => {});

      expect(authEventStore.logEvent).toHaveBeenCalledOnce();
      const eventArgs = authEventStore.logEvent.mock.calls[0][0];
      expect(eventArgs.outcome).toBe('failure');
    });
  });
});
