// ════════════════════════════════════════════════════════════════════
// Authentication Middleware — Entra ID JWT validation
// ════════════════════════════════════════════════════════════════════
// Production: validates bearer token via Entra ID JWKS.  Rejects
// unauthenticated requests with 401.
//
// Development (isDevelopment=true): auth-optional.  If a bearer token
// is present it is validated through the real JWKS path; if absent,
// a synthetic dev user is attached instead.  Real auth is always
// preferred over the synthetic user.
// ════════════════════════════════════════════════════════════════════

import { createRemoteJWKSet, jwtVerify } from 'jose';

// ────────────────────────────────────────────────────────────────────
// createAuthenticationMiddleware
// ────────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {boolean}    options.isDevelopment — when true, token is optional
 * @param {string}     options.tenantId     — Entra ID tenant ID (GUID)
 * @param {string}     options.clientId     — Entra ID app registration client ID
 * @param {UserStore}  [options.userStore]  — optional UserStore for auto-registration
 */
export function createAuthenticationMiddleware({ isDevelopment = false, tenantId, clientId, userStore = null }) {
  const developmentUser = Object.freeze({
    sub: 'dev-user-0000',
    preferred_username: 'developer',
    email: 'dev@rescor.local',
    roles: ['admin'],
    tenantId: tenantId || 'dev',
    iss: 'asr-dev',
    aud: 'asr-api',
  });

  let jwks = null;
  let issuer = null;

  if (tenantId) {
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    jwks = createRemoteJWKSet(new URL(jwksUri));
    issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  }

  return async function authenticate(request, response, next) {
    const authorizationHeader = request.headers.authorization || '';
    const hasToken = authorizationHeader.toLowerCase().startsWith('bearer ');

    // ── No token present ──────────────────────────────────────────
    if (!hasToken) {
      if (isDevelopment) {
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        next();
        return;
      }
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

    // ── Token present — validate via Entra ID JWKS ────────────────
    if (!jwks) {
      if (isDevelopment) {
        // JWKS not configured but token was sent — use dev user
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        next();
        return;
      }
      response.status(401).json({ error: 'Authentication not configured' });
      return;
    }

    try {
      const token = authorizationHeader.split(' ')[1];
      const verifyOptions = { issuer };
      if (clientId) {
        verifyOptions.audience = clientId;
      }

      const { payload } = await jwtVerify(token, jwks, verifyOptions);

      request.user = {
        sub: payload.sub,
        preferred_username: payload.preferred_username || payload.upn || payload.email || payload.sub,
        email: payload.email || payload.upn || null,
        roles: payload.roles || [],
        tenantId: payload.tid || null,
        iss: payload.iss,
        aud: payload.aud,
      };

      if (userStore) {
        await userStore.ensureUser(request.user);
      }

      next();
    } catch (error) {
      if (isDevelopment) {
        // Token invalid in dev — fall back to synthetic user
        console.warn('[asr] Token validation failed in dev mode, using synthetic user:', error.message);
        request.user = { ...developmentUser };
        if (userStore) { await userStore.ensureUser(request.user); }
        next();
        return;
      }
      response.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
