# Plan: Configurable Clickable Chips, SharePoint Links & Entra ID Auth

Four phases: configurable compliance source resolution, NIST/regulatory
descriptions, ISP/IISP policy links, and MS365/Entra ID authentication.

Status: **Planned** — 2026-03-13

---

## Core Design: Compliance Source Configuration

A new Neo4j node type `ComplianceTagConfig` defines per-tag click behavior.
Client overlays (or in future, the YAML pipeline) seed these alongside their
policy/CSF data.  The API loads them at startup and uses the config to resolve
each ComplianceRef's action, URL, and description.

```
(:ComplianceTagConfig {tag: 'ISP',   action: 'link',   baseUrl: 'https://...'})
(:ComplianceTagConfig {tag: 'IISP',  action: 'link',   baseUrl: 'https://...'})
(:ComplianceTagConfig {tag: 'NIST',  action: 'dialog'})
(:ComplianceTagConfig {tag: 'FERPA', action: 'dialog'})
(:ComplianceTagConfig {tag: 'SOX',   action: 'dialog'})
```

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tag` | string | yes | Compliance tag this configures (unique key) |
| `action` | `'link'` \| `'dialog'` | yes | What clicking the chip does |
| `baseUrl` | string | no | For `action='link'`: derive URL as `{baseUrl}/{encoded reference}` |

Policy nodes can also carry an explicit `url` property that overrides baseUrl
derivation.

### Resolution Cascade

In `buildComplianceReferences()`, for each compliance chip:

1. **Explicit URL** — data node has `url` → `action='link'`, use that URL
2. **Base URL** — `ComplianceTagConfig` has `baseUrl` → `action='link'`, derive
   URL from `baseUrl + '/' + encodeURIComponent(reference)`
3. **Dialog** — `ComplianceTagConfig.action = 'dialog'` → use `description`
   from the data node
4. **No config** — tooltip only (current behavior, no click handler)

This is fully configurable per client: a different client could set ISP to
`'dialog'` instead of `'link'`, point baseUrl to a different document library,
or add entirely new tag types — all in their overlay, zero code changes.

> **Future**: move compliance source definitions into the YAML configuration
> (`compliance_sources:` section) so the pipeline generates ComplianceTagConfig
> and Policy nodes directly, making overlay Cypher unnecessary.

---

## Phase 1 — RskChip + ComplianceRef Foundation

1. Add `onClick?: () => void` to `RskChipProps` in `RskChip.tsx`; when
   provided, set `cursor: 'pointer'` on the outer Box and attach the handler.
2. Extend `ComplianceRef` in `types.ts`:
   - `action?: 'link' | 'dialog'` — what click does (undefined = no click)
   - `url?: string` — target for `action='link'`
   - `description?: string` — body text for `action='dialog'`

### Files

- `frontend/src/components/RskChip.tsx`
- `frontend/src/lib/types.ts`

---

## Phase 2 — Configurable Compliance Sources (Neo4j + API)

### 2A — Neo4j Schema

3. Add `ComplianceTagConfig.tag` uniqueness constraint in
   `api/cypher/001-constraints.cypher`.
4. Add `description` property to all 12 `CsfSubcategory` MERGE statements in
   `api/cypher/003-seed-policies-csf.cypher` (official NIST CSF 2.0 text).
5. In client overlay `asr.k12.com/cypher/010-stride-policies.cypher`:
   - Add `url` property to each of the 21 Policy nodes (derived from
     SharePoint base URL + `{reference} - {title}.pdf`; marked TODO for user
     to verify actual filenames).
   - Seed 5 `ComplianceTagConfig` nodes:
     - ISP: `action='link'`, `baseUrl` = SharePoint policy library
     - IISP: `action='link'`, `baseUrl` = same
     - NIST: `action='dialog'`
     - FERPA: `action='dialog'`
     - SOX: `action='dialog'`

### 2B — API Resolution

6. Create `loadComplianceTagConfigs(database)` in `config.mjs` — returns
   `Map<tag, {action, baseUrl?}>`.
7. Rename `loadCsfTooltips()` → `loadCsfLookup()` — also return
   `csf.description` from Cypher.  Returns `Map<code, {tooltip, description}>`.
8. Update `loadPolicyLookup()` — also return `policy.url` from Cypher.
9. Refactor `buildComplianceReferences()` to accept `tagConfigMap` and apply
   the resolution cascade:
   - NIST refs: set action from tagConfig, include description from csfLookup
   - Note refs (FERPA/SOX): set action from tagConfig, include note text as
     description
   - Policy refs: set action from tagConfig; url = explicit `policy.url` OR
     derived from `tagConfig.baseUrl + encodeURIComponent(reference)`
10. Include `action`, `url`, `description` in ComplianceRef JSON response.

### Files

- `api/cypher/001-constraints.cypher`
- `api/cypher/003-seed-policies-csf.cypher`
- `asr.k12.com/cypher/010-stride-policies.cypher` (client overlay)
- `api/src/routes/config.mjs`

---

## Phase 3 — Frontend Chip Interactions

11. Create `ComplianceDetailDialog.tsx` — MUI Dialog showing `"{tag} {code}"`
    title, description body, and close button.
12. In `DomainSection.tsx`:
    - Add `selectedChip` state (`ComplianceRef | null`)
    - For each compliance chip, set `onClick` based on `chip.action`:
      - `'dialog'` → set selectedChip (opens ComplianceDetailDialog)
      - `'link'` → `window.open(chip.url, '_blank', 'noopener')`
      - `undefined` → no onClick (current tooltip-only behavior)
    - Render ComplianceDetailDialog when selectedChip is set.
13. Frontend fallback `buildComplianceRefs()` in DomainSection remains
    functional for tooltip-only fallback (won't have action/url/description;
    API is authoritative).

### Files

- `frontend/src/components/ComplianceDetailDialog.tsx` (NEW)
- `frontend/src/components/DomainSection.tsx`

---

## Phase 4 — MS365/Entra ID Authentication

### 4A — API JWT Validation

14. Add `@rescor/core-auth` dependency to `api/package.json` (file: link to
    `../../core.rescor.net/packages/core-auth`).
15. Create `api/src/middleware/authenticate.mjs` (modeled on STORM, refined):
    - Factory: `createAuthenticationMiddleware({ phaseManager, entraId })`
    - **Production**: jose JWKS against Entra ID; verify issuer + audience;
      attach `request.user`.  Reject if no/invalid token.
    - **Dev mode**: if Bearer token present → validate it and use real
      identity (same JWKS path); if no token → fall back to synthetic user.
      Real auth is always preferred over the fake user.
16. Mount `authenticate` middleware on all `/api/*` routes except `/api/health`
    in `server.mjs`.
17. Replace `request.body.assessor` with `request.user.preferred_username` in
    `reviews.mjs`.

### 4B — Frontend MSAL

18. Install `@azure/msal-browser` + `@azure/msal-react` in
    `frontend/package.json`.
19. Create `frontend/src/lib/authConfig.ts` — MSAL PublicClientApplication
    config with clientId, authority, redirectUri, scopes.
20. Wrap app in `MsalProvider` in `main.tsx`.  Create `AuthGuard.tsx` using
    `useIsAuthenticated()` / `useMsal()` — triggers `loginRedirect()` if not
    authenticated.
21. Wrap routes in `AuthGuard` in `App.tsx`.
22. Update `apiClient.ts` — add `getAccessToken()` via `acquireTokenSilent()`,
    include `Authorization: Bearer {token}` in all fetch calls.  Remove
    `assessor` parameter from all API functions.
23. Update `ReviewPage.tsx` and `DashboardPage.tsx` — remove manual assessor
    input/handling.

### 4C — Configuration & Docs

24. Add `MSAL_CLIENT_ID` + `MSAL_TENANT_ID` to Infisical (ASR project).
25. Frontend reads via `import.meta.env.VITE_MSAL_CLIENT_ID` and
    `import.meta.env.VITE_MSAL_TENANT_ID`.
26. API reads via `@rescor/core-config` at startup.
27. Create `docs/AUTHENTICATION.md` — Entra ID app registration steps,
    required API permissions, redirect URIs.

### Files

- `api/package.json`
- `api/src/middleware/authenticate.mjs` (NEW)
- `api/src/server.mjs`
- `api/src/routes/reviews.mjs`
- `frontend/package.json`
- `frontend/src/lib/authConfig.ts` (NEW)
- `frontend/src/components/AuthGuard.tsx` (NEW)
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/lib/apiClient.ts`
- `frontend/src/pages/ReviewPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `docs/AUTHENTICATION.md` (NEW)

---

## Dependency Graph

```
Phase 1 (RskChip + types)
  ├─→ Phase 2 (Neo4j + API configurable sources)
  │     └─→ Phase 3 (frontend chip interactions)
  └─→ Phase 4 (Entra ID auth) — independent, goes last
```

**Recommended order: 1 → 2 → 3 → 4**

---

## Verification

1. **Phase 1**: RskChip shows pointer cursor when `onClick` provided; no
   visual change without it.
2. **Phase 2**: Reseed Neo4j; `GET /api/config` returns ComplianceRef objects
   with `action`/`url`/`description`; ComplianceTagConfig nodes visible in
   Neo4j browser.
3. **Phase 3**: Click NIST chip → dialog shows CSF 2.0 description; click
   FERPA/SOX → dialog shows note text; click ISP/IISP → new browser tab
   opens SharePoint URL.
4. **Phase 4**: Dev mode API works without token (synthetic user); with real
   token in dev → uses real identity; production requires MS login; API calls
   include Bearer; reviews show JWT `preferred_username` as assessor.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `ComplianceTagConfig` in Neo4j | Per-tag behavior, not hardcoded in code |
| Resolution cascade: url > baseUrl > dialog > tooltip | Flexible per-client |
| NIST descriptions statically seeded | Stable CSF 2.0 text, no runtime fetch |
| SharePoint URLs explicit per-policy | baseUrl as configurable fallback |
| Auth: MSAL.js + Entra ID direct | Not Keycloak federation (user preference) |
| Dev auth: auth-optional | Real token validated if present; synthetic user only fallback |
| Assessor from JWT `preferred_username` | Replaces `request.body.assessor` |
| Future: YAML-driven compliance sources | Move ComplianceTagConfig + Policy defs into YAML pipeline |
| Scope excludes | RBAC/roles, user management UI, MFA config |
