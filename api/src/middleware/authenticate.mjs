// ════════════════════════════════════════════════════════════════════
// Authentication Middleware — Entra ID JWT + Service Account API keys
// ════════════════════════════════════════════════════════════════════
// Production: validates bearer token via Entra ID JWKS.  Rejects
// unauthenticated requests with 401.
//
// Service accounts: tokens prefixed with `sa_` are validated against
// ServiceAccountStore (SHA-256 hash lookup) instead of Entra ID JWKS.
// This enables machine-to-machine calls from external services (e.g.
// cc-api) without requiring an Entra ID client credential flow.
//
// Development (isDevelopment=true): auth-optional.  If a bearer token
// is present it is validated through the real JWKS path; if absent,
// a synthetic dev user is attached instead.  Real auth is always
// preferred over the synthetic user.
// ════════════════════════════════════════════════════════════════════

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { AuthenticationError as CoreAuthenticationError } from '@rescor-llc/core-utils/errors';

const SERVICE_ACCOUNT_KEY_PREFIX = 'sa_';

// ────────────────────────────────────────────────────────────────────
// AuthenticationError — extends core-utils AuthenticationError with
// HTTP statusCode for middleware response mapping
// ────────────────────────────────────────────────────────────────────

class AuthenticationError extends CoreAuthenticationError {
  constructor(statusCode, message, reason) {
    super(message, reason);
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

// ────────────────────────────────────────────────────────────────────
// Localhost detection — dev bypass only when accessed directly
// ────────────────────────────────────────────────────────────────────

function isLocalhostRequest(request) {
  const host = (request.headers['x-forwarded-host'] || request.headers.host || '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// ────────────────────────────────────────────────────────────────────
// Extract request metadata for auth event logging
// ────────────────────────────────────────────────────────────────────

function extractRequestMetadata(request) {
  return {
    ipAddress: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || 'unknown',
    userAgent: request.headers['user-agent'] || 'unknown',
    host: request.headers['x-forwarded-host'] || request.headers.host || 'unknown',
  };
}

// ────────────────────────────────────────────────────────────────────
// handleDastBypass — DAST scanner identity (CI only)
// ────────────────────────────────────────────────────────────────────

function handleDastBypass() {
  let result = null;
  if (process.env.DAST_MODE === 'true' && process.env.NODE_ENV === 'test') {
    result = {
      user: { sub: 'dast-scanner', roles: ['reader'], tenantId: 'demo', iss: 'dast', aud: 'asr-api' },
      action: 'login',
      reason: 'dast-bypass',
    };
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────
// buildDevUser — create a copy of the synthetic dev user
// ────────────────────────────────────────────────────────────────────

async function buildDevUser(developmentUser, userStore, reason) {
  const user = { ...developmentUser };
  if (userStore) {
    await userStore.ensureUser(user);
  }
  return { user, action: 'login', reason };
}

// ────────────────────────────────────────────────────────────────────
// handleNoToken — dev bypass or reject unauthenticated request
// ────────────────────────────────────────────────────────────────────

async function handleNoToken(allowDevBypass, developmentUser, userStore) {
  if (!allowDevBypass) {
    throw new AuthenticationError(401, 'Authentication required', 'no-token');
  }
  const result = await buildDevUser(developmentUser, userStore, 'dev-bypass');
  return result;
}

// ────────────────────────────────────────────────────────────────────
// verifyServiceAccountKey — SHA-256 hash lookup against store
// ────────────────────────────────────────────────────────────────────

async function verifyServiceAccountKey(token, serviceAccountStore) {
  const apiKeyHash = createHash('sha256').update(token).digest('hex');
  const account = await serviceAccountStore.findByApiKeyHash(apiKeyHash);

  if (!account) {
    throw new AuthenticationError(401, 'Invalid API key', 'invalid-service-account-key');
  }

  const user = {
    sub: `sa:${account.serviceAccountId}`,
    preferred_username: account.label,
    email: null,
    displayName: account.label,
    roles: account.roles || [],
    tenantId: account.tenantId,
    iss: 'service-account',
    aud: 'asr-api',
  };

  return { user, action: 'login', reason: 'service-account-key' };
}

// ────────────────────────────────────────────────────────────────────
// verifyJwtToken — validate via Entra ID JWKS, check denylist + tenant
// ────────────────────────────────────────────────────────────────────

async function verifyJwtToken(token, jwks, configuredIssuer, clientId, allowedTenants, tokenDenylist) {
  const verifyOptions = {};
  if (configuredIssuer) {
    verifyOptions.issuer = configuredIssuer;
  }
  if (clientId) {
    verifyOptions.audience = clientId;
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);

  if (tokenDenylist?.isDenied(payload.jti, payload.sub)) {
    throw new AuthenticationError(401, 'Session revoked', 'token-revoked');
  }

  if (!configuredIssuer && payload.iss) {
    validateMultiTenantIssuer(payload, allowedTenants);
  }

  const user = {
    sub: payload.sub,
    preferred_username: payload.preferred_username || payload.upn || payload.email || payload.sub,
    email: payload.email || payload.upn || null,
    displayName: payload.name || null,
    roles: payload.roles || [],
    tenantId: payload.tid || null,
    iss: payload.iss,
    aud: payload.aud,
  };

  return { user, action: 'login', reason: null };
}

// ────────────────────────────────────────────────────────────────────
// validateMultiTenantIssuer — check issuer format + tenant whitelist
// ────────────────────────────────────────────────────────────────────

function validateMultiTenantIssuer(payload, allowedTenants) {
  const issuerPattern = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]+)\/v2\.0$/;
  const issuerMatch = issuerPattern.exec(payload.iss);

  if (!issuerMatch) {
    throw new AuthenticationError(401, 'Untrusted issuer', 'untrusted-issuer');
  }
  if (allowedTenants.length > 0 && !allowedTenants.includes(issuerMatch[1])) {
    throw new AuthenticationError(403, 'Tenant not authorized', 'tenant-not-authorized');
  }
}

// ────────────────────────────────────────────────────────────────────
// hydrateUserFromStore — merge persisted roles from UserStore
// ────────────────────────────────────────────────────────────────────

async function hydrateUserFromStore(user, userStore) {
  if (userStore) {
    const persisted = await userStore.ensureUser(user);
    if (persisted?.roles?.length > 0) {
      user.roles = persisted.roles;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// resolveAuthentication — orchestrator that delegates to auth paths
// ────────────────────────────────────────────────────────────────────

async function resolveAuthentication(request, context) {
  const { isDevelopment, developmentUser, userStore, serviceAccountStore, jwks, issuer, clientId, allowedTenants, tokenDenylist, recorder } = context;
  const authorizationHeader = request.headers.authorization || '';
  const hasToken = authorizationHeader.toLowerCase().startsWith('bearer ');
  const allowDevBypass = isDevelopment && isLocalhostRequest(request);

  let result = handleDastBypass();

  if (!result && !hasToken) {
    result = await handleNoToken(allowDevBypass, developmentUser, userStore);
  } else if (!result) {
    const token = authorizationHeader.split(' ')[1];
    result = await resolveTokenAuthentication(token, allowDevBypass, context);
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// resolveTokenAuthentication — handle sa_ keys and JWT tokens
// ────────────────────────────────────────────────────────────────────

async function resolveTokenAuthentication(token, allowDevBypass, context) {
  const { developmentUser, userStore, serviceAccountStore, jwks, issuer, clientId, allowedTenants, tokenDenylist, recorder } = context;
  let result = null;

  if (serviceAccountStore && token.startsWith(SERVICE_ACCOUNT_KEY_PREFIX)) {
    result = await verifyServiceAccountKey(token, serviceAccountStore);
  } else if (!jwks && allowDevBypass) {
    result = await buildDevUser(developmentUser, userStore, 'dev-bypass-no-jwks');
  } else if (!jwks) {
    throw new AuthenticationError(401, 'Authentication not configured', 'jwks-not-configured');
  } else {
    result = await resolveJwtAuthentication(token, allowDevBypass, context);
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// resolveJwtAuthentication — verify JWT with dev fallback on failure
// ────────────────────────────────────────────────────────────────────

async function resolveJwtAuthentication(token, allowDevBypass, context) {
  const { developmentUser, userStore, jwks, issuer, clientId, allowedTenants, tokenDenylist, recorder } = context;
  let result = null;

  try {
    result = await verifyJwtToken(token, jwks, issuer, clientId, allowedTenants, tokenDenylist);
    await hydrateUserFromStore(result.user, userStore);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (allowDevBypass) {
      recorder?.emit(9017, 'd', 'Token validation failed in dev mode, using synthetic user', { error: error.message });
      result = await buildDevUser(developmentUser, userStore, 'dev-bypass-token-invalid');
    } else {
      throw new AuthenticationError(401, 'Invalid or expired token', error.message);
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// createAuthenticationMiddleware
// ────────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {boolean}    options.isDevelopment   — when true, token is optional
 * @param {string}     options.tenantId        — Entra ID tenant ID (GUID), null for multi-tenant
 * @param {string}     options.clientId        — Entra ID app registration client ID
 * @param {UserStore}  [options.userStore]     — optional UserStore for auto-registration
 * @param {string[]}   [options.allowedTenants] — whitelist of allowed tenant IDs (empty = all)
 * @param {AuthEventStore} [options.authEventStore] — optional AuthEventStore for activity logging
 * @param {ServiceAccountStore} [options.serviceAccountStore] — optional store for API key auth
 * @param {TokenDenylist} [options.tokenDenylist] — optional denylist for session revocation
 * @param {Recorder} [options.recorder] — optional Recorder for structured logging
 */
export function createAuthenticationMiddleware({ isDevelopment = false, tenantId, clientId, userStore = null, allowedTenants = [], authEventStore = null, serviceAccountStore = null, tokenDenylist = null, recorder = null }) {
  const developmentUser = Object.freeze({
    sub: 'dev-user-0000',
    preferred_username: 'developer',
    email: 'dev@rescor.local',
    displayName: 'Dev User',
    roles: ['admin'],
    tenantId: 'demo',
    iss: 'asr-dev',
    aud: 'asr-api',
  });

  // Fire-and-forget auth event logging (non-blocking)
  function logAuthEvent(sub, action, outcome, request, reason) {
    if (authEventStore) {
      const metadata = extractRequestMetadata(request);
      const eventTenantId = request.user?.tenantId || null;
      authEventStore.logEvent({ sub, tenantId: eventTenantId, action, ...metadata, outcome, reason }).catch((error) => {
        recorder?.emit(9016, 'w', 'Failed to log auth event', { error: error.message });
      });
    }
  }

  let jwks = null;
  let issuer = null;

  if (tenantId) {
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    jwks = createRemoteJWKSet(new URL(jwksUri));
    issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  } else if (clientId) {
    const jwksUri = 'https://login.microsoftonline.com/organizations/discovery/v2.0/keys';
    jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  const context = { isDevelopment, developmentUser, userStore, serviceAccountStore, jwks, issuer, clientId, allowedTenants, tokenDenylist, recorder };

  return async function authenticate(request, response, next) {
    try {
      const result = await resolveAuthentication(request, context);
      request.user = result.user;
      logAuthEvent(result.user.sub, result.action, 'success', request, result.reason);
      next();
    } catch (error) {
      const statusCode = error instanceof AuthenticationError ? error.statusCode : 500;
      const message = error instanceof AuthenticationError ? error.message : 'Authentication failed';
      const reason = error instanceof AuthenticationError ? error.reason : error.message;
      const sub = request.user?.sub || 'anonymous';
      logAuthEvent(sub, 'login_failed', 'failure', request, reason);
      response.status(statusCode).json({ error: message });
    }
  };
}
