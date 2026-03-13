# Authentication — Entra ID / MS365

ASR uses Microsoft Entra ID (formerly Azure AD) for authentication.
The frontend acquires tokens via MSAL.js; the API validates them against
Entra ID's JWKS endpoint using `jose`.

---

## Architecture

```
Browser ──MSAL.js──→ Entra ID ──→ ID token + access token
                                       │
Browser ──Bearer token──→ ASR API ──JWKS verify──→ request.user
```

- **Frontend**: `@azure/msal-browser` + `@azure/msal-react`
- **API**: `jose` (via `@rescor/core-auth`) — `createRemoteJWKSet` + `jwtVerify`
- **Identity claims**: `preferred_username` (or fallback: `upn` → `email` → `sub`)

---

## Entra ID App Registration

### 1. Create app registration

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com)
   → **Identity** → **Applications** → **App registrations** → **New registration**
2. Name: `ASR - Automated Security Review`
3. Supported account types: **Single tenant** (this organization only)
4. Redirect URI: **Single-page application (SPA)**
   - Development: `http://localhost:5174`
   - Production: `https://asr.rescor.net`

### 2. Configure API permissions

Under **API permissions**, add:
- `Microsoft Graph` → `User.Read` (delegated) — sign-in and read user profile

No admin consent required for `User.Read`.

### 3. Expose an API (optional)

If you want the API to validate audience claims:

1. **Expose an API** → Set Application ID URI (e.g., `api://{clientId}`)
2. Add a scope: `api://{clientId}/access_as_user`
3. Update frontend `apiScopes` to include the custom scope

The default configuration uses `{clientId}/.default` which works without
a custom scope when the API and frontend share the same app registration.

### 4. Token configuration

Under **Token configuration**, add optional claims to the **ID token**:
- `email`
- `preferred_username`
- `upn` (if using on-premises AD)

### 5. Record IDs

Note these values for configuration:
- **Application (client) ID** — the GUID on the app registration overview
- **Directory (tenant) ID** — from the overview page or Entra admin center

---

## Configuration

### Frontend (Vite environment variables)

Set in `.env.local` or deployment environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_MSAL_CLIENT_ID` | Yes* | Entra ID app registration client ID |
| `VITE_MSAL_TENANT_ID` | Yes* | Entra ID directory (tenant) ID |
| `VITE_MSAL_REDIRECT_URI` | No | Override redirect URI (default: `window.location.origin`) |

*When omitted, MSAL is disabled and the app runs without authentication
(development mode).

### API (Infisical)

Store in Infisical under the ASR project:

| Secret | Path | Description |
|--------|------|-------------|
| `entra/tenantId` | `/asr/` | Entra ID directory (tenant) ID |
| `entra/clientId` | `/asr/` | Entra ID app registration client ID |

The API reads these at startup via `@rescor/core-config`. When neither is
set, the middleware operates in auth-optional dev mode.

---

## Dev Mode Behavior

When authentication is not configured:

| Layer | Behavior |
|-------|----------|
| Frontend | `isMsalConfigured = false` → `AuthGuard` renders children immediately, no login |
| API | `isDevelopment = true` + no token → synthetic user: `{ sub: 'dev-user-0000', preferred_username: 'developer' }` |
| API | `isDevelopment = true` + valid token → real identity from JWT |
| API | `isDevelopment = true` + invalid token → warning logged, falls back to synthetic user |

This enables local development without an Entra ID app registration while
still allowing real authentication when configured.

---

## Token Flow

1. User visits ASR → `AuthGuard` checks `useIsAuthenticated()`
2. Not authenticated → `loginRedirect()` sends user to Entra ID
3. User signs in → redirect back with auth code
4. MSAL exchanges code for tokens, caches in `sessionStorage`
5. `apiClient.ts` calls `acquireTokenSilent()` before each API request
6. API extracts Bearer token → validates via Entra ID JWKS endpoint
7. `request.user` populated with JWT claims → `preferred_username` used as assessor

### JWKS Endpoint

```
https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
```

### Issuer

```
https://login.microsoftonline.com/{tenantId}/v2.0
```

---

## Files

| File | Purpose |
|------|---------|
| `api/src/middleware/authenticate.mjs` | JWT validation middleware (jose) |
| `api/src/server.mjs` | Mounts middleware on `/api/*` (except health) |
| `api/src/routes/reviews.mjs` | Uses `request.user.preferred_username` as assessor |
| `api/src/routes/answers.mjs` | Uses `request.user.preferred_username` as assessor |
| `frontend/src/lib/authConfig.ts` | MSAL configuration + `PublicClientApplication` |
| `frontend/src/components/AuthGuard.tsx` | Conditional auth gate |
| `frontend/src/main.tsx` | `MsalProvider` wrapper |
| `frontend/src/lib/apiClient.ts` | `getAccessToken()` + Bearer headers |

---

## Scope Exclusions

The current implementation does **not** include:

- Role-based access control (RBAC) — all authenticated users have equal access
- User management UI
- MFA configuration (handled by Entra ID conditional access policies)
- Token refresh UI (MSAL handles silent refresh automatically)
- Logout functionality (can be added via `msalInstance.logoutRedirect()`)
