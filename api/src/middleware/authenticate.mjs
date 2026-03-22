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

const SERVICE_ACCOUNT_KEY_PREFIX = 'sa_';

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
    if (!authEventStore) return;
    const metadata = extractRequestMetadata(request);
    const tenantId = request.user?.tenantId || null;
    authEventStore.logEvent({ sub, tenantId, action, ...metadata, outcome, reason }).catch((error) => {
      recorder?.emit(9016, 'w', 'Failed to log auth event', { error: error.message });
    });
  }

  let jwks = null;
  let issuer = null;

  if (tenantId) {
    // Single-tenant — validate against one specific issuer
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    jwks = createRemoteJWKSet(new URL(jwksUri));
    issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  } else if (clientId) {
    // Multi-tenant — use the common JWKS endpoint, validate issuer per-request
    const jwksUri = 'https://login.microsoftonline.com/organizations/discovery/v2.0/keys';
    jwks = createRemoteJWKSet(new URL(jwksUri));
    // issuer stays null — validated manually after verify
  }

  return async function authenticate(request, response, next) {
    const authorizationHeader = request.headers.authorization || '';
    const hasToken = authorizationHeader.toLowerCase().startsWith('bearer ');

    // Dev bypass is only allowed from localhost — proxied requests
    // (e.g. ngrok) must authenticate even in development mode.
    const allowDevBypass = isDevelopment && isLocalhostRequest(request);

    // ── DAST scanner bypass (CI only — requires DAST_MODE + NODE_ENV=test) ──
    if (process.env.DAST_MODE === 'true' && process.env.NODE_ENV === 'test') {
      request.user = { sub: 'dast-scanner', roles: ['reader'], tenantId: 'demo', iss: 'dast', aud: 'asr-api' };
      next();
      return;
    }

    // ── No token present ──────────────────────────────────────────
    if (!hasToken) {
      if (allowDevBypass) {
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        logAuthEvent(developmentUser.sub, 'login', 'success', request, 'dev-bypass');
        next();
        return;
      }
      logAuthEvent('anonymous', 'login_failed', 'failure', request, 'no-token');
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

    // ── Service account API key (sa_ prefix) ────────────────────────
    const token = authorizationHeader.split(' ')[1];

    if (serviceAccountStore && token.startsWith(SERVICE_ACCOUNT_KEY_PREFIX)) {
      try {
        const apiKeyHash = createHash('sha256').update(token).digest('hex');
        const account = await serviceAccountStore.findByApiKeyHash(apiKeyHash);

        if (!account) {
          logAuthEvent('anonymous', 'login_failed', 'failure', request, 'invalid-service-account-key');
          response.status(401).json({ error: 'Invalid API key' });
          return;
        }

        request.user = {
          sub: `sa:${account.serviceAccountId}`,
          preferred_username: account.label,
          email: null,
          displayName: account.label,
          roles: account.roles || [],
          tenantId: account.tenantId,
          iss: 'service-account',
          aud: 'asr-api',
        };

        logAuthEvent(request.user.sub, 'login', 'success', request, 'service-account-key');
        next();
        return;
      } catch (error) {
        logAuthEvent('anonymous', 'login_failed', 'failure', request, `service-account-error: ${error.message}`);
        response.status(500).json({ error: 'Authentication failed' });
        return;
      }
    }

    // ── JWT token — validate via Entra ID JWKS ──────────────────────
    if (!jwks) {
      if (allowDevBypass) {
        // JWKS not configured but token was sent — use dev user
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        logAuthEvent(developmentUser.sub, 'login', 'success', request, 'dev-bypass-no-jwks');
        next();
        return;
      }
      logAuthEvent('anonymous', 'login_failed', 'failure', request, 'jwks-not-configured');
      response.status(401).json({ error: 'Authentication not configured' });
      return;
    }

    try {
      const verifyOptions = {};
      if (issuer) {
        verifyOptions.issuer = issuer;
      }
      if (clientId) {
        verifyOptions.audience = clientId;
      }

      const { payload } = await jwtVerify(token, jwks, verifyOptions);

      // Server-side session revocation check
      if (tokenDenylist?.isDenied(payload.jti, payload.sub)) {
        logAuthEvent(payload.sub || 'unknown', 'login_failed', 'failure', request, 'token-revoked');
        response.status(401).json({ error: 'Session revoked' });
        return;
      }

      // Multi-tenant: validate issuer format + tenant whitelist
      if (!issuer && payload.iss) {
        const issuerPattern = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]+)\/v2\.0$/;
        const issuerMatch = issuerPattern.exec(payload.iss);
        if (!issuerMatch) {
          logAuthEvent(payload.sub || 'unknown', 'login_failed', 'failure', request, 'untrusted-issuer');
          response.status(401).json({ error: 'Untrusted issuer' });
          return;
        }
        if (allowedTenants.length > 0 && !allowedTenants.includes(issuerMatch[1])) {
          logAuthEvent(payload.sub || 'unknown', 'login_failed', 'failure', request, 'tenant-not-authorized');
          response.status(403).json({ error: 'Tenant not authorized' });
          return;
        }
      }

      request.user = {
        sub: payload.sub,
        preferred_username: payload.preferred_username || payload.upn || payload.email || payload.sub,
        email: payload.email || payload.upn || null,
        displayName: payload.name || null,
        roles: payload.roles || [],
        tenantId: payload.tid || null,
        iss: payload.iss,
        aud: payload.aud,
      };

      if (userStore) {
        const persisted = await userStore.ensureUser(request.user);
        if (persisted && persisted.roles && persisted.roles.length > 0) {
          request.user.roles = persisted.roles;
        }
      }

      logAuthEvent(request.user.sub, 'login', 'success', request, null);
      next();
    } catch (error) {
      if (allowDevBypass) {
        // Token invalid in dev — fall back to synthetic user
        recorder?.emit(9017, 'd', 'Token validation failed in dev mode, using synthetic user', { error: error.message });
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        logAuthEvent(developmentUser.sub, 'login', 'success', request, 'dev-bypass-token-invalid');
        next();
        return;
      }
      logAuthEvent('anonymous', 'login_failed', 'failure', request, error.message);
      response.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
