# OWASP Security Analysis — asr.rescor.net

**Date**: 2026-03-21
**Baseline**: OWASP Multi-Tenant Security Cheat Sheet + OWASP Top 10 (2021)
**Supersedes**: `MULTI-TENANT-GAP-ANALYSIS.md` (multi-tenant sections updated here)

## Scope

This document evaluates the application platform against:

1. **OWASP Multi-Tenant Security Cheat Sheet** — 8 best-practice areas, ~68 controls
2. **OWASP Top 10 (2021)** — 10 vulnerability categories (non-overlapping items added)

| Rating | Meaning |
|--------|---------|
| **MET** | Requirement fully satisfied |
| **PARTIAL** | Some aspects addressed, gaps remain |
| **GAP** | Not yet implemented |
| **N/A** | Not applicable to current architecture |

---

## Part 1 — OWASP Multi-Tenant Security Cheat Sheet

### MT-1. Tenant Identification & Context Management

| Control | Rating | Evidence |
|---------|--------|----------|
| 1.1 Tenant context from authenticated token | **MET** | `authenticate.mjs` extracts `tid` from Entra ID JWT; never from headers/query params |
| 1.2 Non-guessable tenant identifiers | **MET** | Tenant IDs are Entra ID directory GUIDs (UUIDv4) |
| 1.3 Client-supplied tenant ID rejected | **MET** | `tid` extracted server-side from JWT; no API accepts `tenantId` in request body for scoping |
| 1.4 Tenant context bound to session | **MET** | `request.user.tenantId` set in auth middleware, available to all handlers |
| 1.5 Tenant context propagated to all layers | **MET** | Reviews use `SCOPED_TO` relationship; ScoringConfig, QuestionnaireSnapshot, QuestionnaireDraft, GateQuestion, ComplianceTagConfig all tenant-scoped; per-tenant `Map` cache keyed by `tenantId` |
| 1.x Multi-tenant issuer validation | **MET** | `authenticate.mjs` validates issuer format regex + `allowedTenants` whitelist |

**Remaining gap**: No middleware that auto-injects `tenantId` into every Cypher query (defence-in-depth) — deferred, application-layer scoping is consistent.

---

### MT-2. Database Isolation Strategies

| Control | Rating | Evidence |
|---------|--------|----------|
| 2.1 Isolation model selected | **MET** | Shared-graph (multi-tenant) with designed database-per-tenant option |
| 2.2 Row-level tenant filtering | **MET** | All query MATCH/WHERE clauses include `tenantId` filter |
| 2.3 ORM/application-layer tenant enforcement | **MET** | `ReviewStore.verifyReviewTenant()` + tenant WHERE clauses in all stores |
| 2.4 Fail-closed on missing context | **PARTIAL** | Most routes fail closed; no global middleware enforces this universally |

**Remaining gaps**: Cypher query interception middleware (Group E); single-tenant deployment mode wiring (Group E).

---

### MT-3. Preventing Cross-Tenant Data Access (IDOR)

| Control | Rating | Evidence |
|---------|--------|----------|
| 3.1 Resource ownership validation | **MET** | `verifyReviewTenant()` on all review routes; 404 returned (not 403) to prevent enumeration |
| 3.2 Composite keys for lookups | **MET** | All queries filter by (`resourceId` + `tenantId`) |
| 3.3 Authorization at data access layer | **MET** | `ReviewStore`, `UserStore` enforce tenant scoping at persistence layer |
| 3.4 Non-guessable resource IDs | **MET** | All node IDs are `randomUUID()` |
| 3.5 Opaque error on missing resources | **MET** | 404 "not found" for both missing and wrong-tenant resources |

**Status**: Fully met.

---

### MT-4. Cache & Session Isolation

| Control | Rating | Evidence |
|---------|--------|----------|
| 4.1 Tenant-prefixed cache keys | **MET** | Scoring config cache keyed by `tenantId\|'global'` |
| 4.2 Separate namespaces for sensitive tenants | **N/A** | No Redis/Memcached — all reads go to Neo4j |
| 4.3 Cache key validation | **N/A** | No external cache |
| 4.4 Tenant verification on retrieval | **N/A** | No external cache |
| 4.5 Tenant cache invalidation | **N/A** | No external cache |
| Session isolation | **MET** | Stateless API — no server-side sessions; JWT per-request |

---

### MT-5. API Security & Rate Limiting

| Control | Rating | Evidence |
|---------|--------|----------|
| 5.1 Per-tenant rate limiting | **MET** | `apiLimiter`: 300 req/min keyed by `tenantId \|\| ip` |
| 5.2 Tenant-specific throttling | **MET** | Per-tenant throttle bucket via `apiLimiter` |
| 5.3 Tenant context validation per request | **MET** | Auth middleware runs on all `/api/*` except health |
| 5.4 Separate API keys per tenant | **MET** | Service accounts: `sa_` prefixed, SHA-256 hashed, per-tenant |
| 5.5 Tenant-aware request signing (B2B) | **N/A** | No B2B API signing currently needed |
| 5.6 Rate limit response headers | **MET** | `express-rate-limit` sends standard `RateLimit-*` headers |
| CORS configuration | **MET** | `server.corsAllowedOrigins` from Infisical; absent in dev = open |

---

### MT-6. File Storage & Blob Isolation

| Control | Rating | Evidence |
|---------|--------|----------|
| All controls | **N/A** | Application does not store tenant-uploaded files. Document exports generated on-the-fly |

---

### MT-7. Tenant Onboarding & Offboarding

| Control | Rating | Evidence |
|---------|--------|----------|
| 7.1 Secure provisioning | **MET** | `TenantStore.createTenant()` + `POST /api/admin/tenants` |
| 7.2 Unique keys per tenant | **N/A** | No per-tenant encryption keys (Neo4j Community, no TDE) |
| 7.3 Complete data deletion on offboarding | **GAP** | Soft-delete done; hard purge (`purgeTenant`) is a stub |
| 7.4 Audit trail of provisioning | **MET** | `tenant.create` / `tenant.delete` fired to `AuditEventStore` |
| 7.5 Data export for portability | **PARTIAL** | Review export (DOCX/XLSX) exists; tenant-wide export via `/export` route; no full cross-entity export |
| 7.6 Prevent operations during offboarding | **GAP** | No `OFFBOARDING` status blocking new operations |
| 7.7 Revoke access during offboarding | **GAP** | No session/key revocation workflow |
| 7.8 Data retention periods | **PARTIAL** | AuthEvent: 90-day APOC TTL; AuditEvent: no TTL yet |
| 7.9 Clean up failed provisioning | **GAP** | No rollback on partial provisioning failure |

---

### MT-8. Logging, Monitoring & Audit

| Control | Rating | Evidence |
|---------|--------|----------|
| 8.1 Tenant context in log entries | **MET** | `tenantId` on every AuthEvent and AuditEvent node |
| 8.2 Tenant-isolated audit trails | **MET** | `GET /admin/audit-events` scoped to requesting admin's tenant |
| 8.3 Cross-tenant access monitoring | **MET** | `verifyReviewTenant()` null hits logged as `review.cross_tenant_attempt` |
| 8.4 Alerts for isolation violations | **GAP** | No alerting system — events stored but no proactive notification |
| 8.5 Tenant-specific retention policies | **PARTIAL** | AuthEvent 90-day TTL; AuditEvent TTL outstanding |
| 8.6 Structured severity levels | **PARTIAL** | Auth events have `outcome` + `reason`; no formal severity classification |
| 8.7 Audit log access restricted | **MET** | Admin-only endpoints; tenant-scoped queries |

---

### Neo4j-Specific Controls

| Control | Rating | Evidence |
|---------|--------|----------|
| Encryption at rest | **GAP** | Neo4j Community — no TDE; host-level LUKS not confirmed |
| Encryption in transit | **MET** | Production: `bolt+s://`; dev: `bolt://` (intentional) |
| Authentication | **MET** | Neo4j auth enabled; Infisical-managed in prod |
| Authorization (RBAC) | **N/A** | Community Edition — single user |
| Port security | **MET** | Ports bound to `127.0.0.1` in UAT/prod |
| Parameterized queries | **MET** | All 100+ Cypher queries use `$param` syntax |
| APOC whitelisting | **MET** | Only `apoc.ttl.*` unrestricted |
| Backup isolation | **GAP** | No per-tenant backup strategy |

---

## Part 2 — OWASP Top 10 (2021) — Non-Overlapping Controls

### A01: Broken Access Control

*Largely covered by MT-1, MT-3, MT-5 above. Additional findings:*

| Control | Rating | Evidence |
|---------|--------|----------|
| Default-deny for resources | **MET** | Auth middleware on all `/api/*`; unauthenticated = 401 |
| Enforce record ownership | **MET** | `requireOwnershipOrAdmin()` middleware on all mutation routes |
| Role-based access control | **MET** | `authorize(...roles)` middleware; 4 roles: admin, reviewer, user, auditor |
| Separation of duties | **MET** | Assessor cannot accept own risk (`remediation.mjs:598-619`) |
| Defence-in-depth authorization | **MET** | 7 layers: authn → role → handler-role → ownership → tenant isolation → Cypher-level → audit trail |
| Session invalidation on logout | **PARTIAL** | MSAL clears local tokens; no server-side JWT revocation mechanism |

---

### A02: Cryptographic Failures

| Control | Rating | Evidence |
|---------|--------|----------|
| Sensitive data classification | **PARTIAL** | No formal data classification doc; PII (email, display name, IP) stored in Neo4j |
| Encryption at rest | **GAP** | Neo4j Community has no TDE; host-level encryption not confirmed |
| Encryption in transit / TLS | **MET** | bolt+s:// for Neo4j prod; HTTPS for Entra ID, Infisical, MSAL |
| HSTS header | **GAP** | Not set in nginx config or Express |
| Hashing algorithms | **MET** | All hashing uses SHA-256; zero MD5/SHA-1 |
| Hardcoded secrets | **PARTIAL** | Dev-only `asrdev123` fallback in `database.mjs:104`; production uses Infisical |
| API key storage | **MET** | `randomBytes(32)` + SHA-256 hash-only storage; plaintext returned once |
| Security headers (Express) | **GAP** | No `helmet` middleware; no `app.disable('x-powered-by')` |

---

### A03: Injection

| Control | Rating | Evidence |
|---------|--------|----------|
| Cypher injection | **MET** | All 100+ queries fully parameterized; template literals used only for hardcoded structural clauses |
| Command injection | **MET** | Zero `eval()`, `Function()`, `child_process.exec()` in app code |
| XSS (frontend) | **MET** | Zero `dangerouslySetInnerHTML`/`innerHTML`; React 19 auto-escaping |
| Input validation | **PARTIAL** | Parameterized queries prevent injection; some endpoints lack type/length validation on body fields (defence-in-depth gap, not injection vulnerability) |
| JSON.parse safety | **MET** | All instances either parse stored data or have try/catch error handling |

---

### A04: Insecure Design

| Control | Rating | Evidence |
|---------|--------|----------|
| Threat modeling | **PARTIAL** | Multi-tenant gap analysis + RBAC plan exist; no formal STRIDE/attack-tree |
| Business logic flaws | **MET** | Ownership checks, tenant isolation, SoD on risk acceptance, proposed-changes workflow |
| Defence-in-depth authz | **MET** | 7+ authorization layers |
| Security tests | **GAP** | Zero test files, no test framework, no CI/CD pipeline |

---

### A05: Security Misconfiguration

| Control | Rating | Evidence |
|---------|--------|----------|
| Nginx security headers | **PARTIAL** | Has `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. Missing: `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy` |
| Express security config | **GAP** | No `helmet`; `error.message` leaked in 60+ catch blocks; no global error handler |
| Docker port restrictions | **MET** | UAT/prod: all ports bound to `127.0.0.1` |
| Debug/test routes | **MET** | No debug routes. Minor: `/api/health` exposes STORM `baseUrl` |
| Technology fingerprinting | **PARTIAL** | Missing `app.disable('x-powered-by')` and nginx `server_tokens off` |

---

### A06: Vulnerable and Outdated Components

| Control | Rating | Evidence |
|---------|--------|----------|
| Dependency versions | **MET** | All packages appear current (Express 4.21, React 19.2, jose 6.2, neo4j-driver 5.28) |
| SCA tooling | **GAP** | No Dependabot, Snyk, Renovate, npm audit, or any automated supply chain scanning |

---

### A07: Identification and Authentication Failures

| Control | Rating | Evidence |
|---------|--------|----------|
| Authentication flow | **MET** | Entra ID JWKS validation + service account SHA-256 hash lookup |
| Brute-force protection | **MET** | `authLimiter`: 20 req/15 min per IP; `apiLimiter`: 300 req/min per tenant |
| Session management | **PARTIAL** | JWT expiry enforced; MSAL silent refresh; no server-side revocation |
| Default credentials | **PARTIAL** | Dev bypass guarded by `NODE_ENV !== 'production'` + localhost check |
| Service account key security | **MET** | `randomBytes(32)` + SHA-256 hash-only; admin-only CRUD; audit trail |
| MFA | **PARTIAL** | Delegated to Entra ID Conditional Access; app cannot enforce directly |

---

### A08: Software and Data Integrity Failures

| Control | Rating | Evidence |
|---------|--------|----------|
| Dependency verification | **MET** | `package-lock.json` exists for deterministic installs |
| Unsafe deserialization | **MET** | `js-yaml` v4.x safe default schema; `JSON.parse` is safe against code execution |
| CI/CD pipeline security | **GAP** | No CI/CD configuration; manual deployment via docker cp |

---

### A09: Security Logging and Monitoring Failures

| Control | Rating | Evidence |
|---------|--------|----------|
| Auth event logging | **MET** | All login success/failure variants logged with tenant, IP, user-agent, reason |
| Data mutation audit trail | **MET** | `AuditEventStore` covers reviews, answers, roles, tenants, service accounts, import/export |
| Cross-tenant access logging | **MET** | `review.cross_tenant_attempt` events |
| 403 authorization failure logging | **GAP** | `authorize()` middleware returns 403 but does NOT log to AuditEventStore |
| Structured logs for SIEM | **PARTIAL** | Neo4j events structured; console output is unstructured plain text |
| Alerting on security events | **GAP** | No proactive alerting; events stored but not monitored |
| Log injection protection | **PARTIAL** | Cypher-parameterized DB logs safe; console output unprotected |

---

### A10: Server-Side Request Forgery (SSRF)

| Control | Rating | Evidence |
|---------|--------|----------|
| Outbound requests from user input | **MET** | No user-controlled outbound URLs |
| StormService SSRF | **MET** | All URLs from Infisical config only; timeouts enforced with AbortController |
| URL validation | **MET (N/A)** | No user-supplied URLs fetched server-side |

---

## Consolidated Summary Matrix

| # | Area | Rating | Key Gaps |
|---|------|--------|----------|
| MT-1 | Tenant Identification | **MET** | Query-level middleware deferred (low priority) |
| MT-2 | Database Isolation | **MET** | Single-tenant mode wiring deferred |
| MT-3 | IDOR Prevention | **MET** | Fully resolved |
| MT-4 | Cache Isolation | **MET/N/A** | No external cache; in-memory cache properly keyed |
| MT-5 | API Rate Limiting | **MET** | Fully resolved |
| MT-6 | File Storage | **N/A** | No file storage |
| MT-7 | Onboarding/Offboarding | **PARTIAL** | Hard purge, offboarding status, access revocation, failed provisioning rollback |
| MT-8 | Logging & Audit | **MET** | Alerting system outstanding; AuditEvent TTL deferred |
| A01 | Broken Access Control | **MET** | No server-side session revocation |
| A02 | Cryptographic Failures | **PARTIAL** | No EAR, no HSTS, no helmet |
| A03 | Injection | **MET** | All queries parameterized; React auto-escaping |
| A04 | Insecure Design | **PARTIAL** | No security tests; no formal threat model |
| A05 | Security Misconfiguration | **PARTIAL** | Missing CSP/HSTS/helmet; error.message leakage; fingerprinting |
| A06 | Vulnerable Components | **PARTIAL** | Dependencies current; no SCA tooling |
| A07 | Auth Failures | **MET** | MFA via Entra ID delegation; JWT revocation limitation inherent |
| A08 | Data Integrity Failures | **PARTIAL** | No CI/CD pipeline |
| A09 | Logging & Monitoring | **PARTIAL** | No alerting; 403s not logged; console logs unstructured |
| A10 | SSRF | **MET** | No user-controlled outbound requests |
| Neo4j | Database Security | **PARTIAL** | No EAR; no backup isolation |

---

## Priority Remediation Roadmap

### Tier 1 — High Impact, Quick Wins ✓ COMPLETE (132a8cb)

| # | Gap | Fix | Status |
|---|-----|-----|--------|
| 1 | Error message leakage (A05) | Recorder + sanitized 62 catch blocks + global error handler | **DONE** |
| 2 | Missing security headers (A02/A05) | helmet middleware + nginx HSTS/CSP/Permissions-Policy | **DONE** |
| 3 | Technology fingerprinting (A05) | helmet removes X-Powered-By; nginx server_tokens off | **DONE** |
| 4 | 403 failure logging (A09) | authorize() rejections logged to Recorder + AuditEventStore | **DONE** |

### Tier 2 — Medium Impact, Moderate Effort

| # | Gap | Fix | Status |
|---|-----|-----|--------|
| 5 | SCA tooling (A06/A08) | Dependabot enabled for api/ and frontend/ workspaces | **DONE** (4d68943) |
| 6 | Security alerting (MT-8/A09) | Webhook or polling alert for cross-tenant attempts and brute-force events | Open |
| 7 | AuditEvent TTL (MT-8) | 90-day APOC TTL on AuditEvent nodes (matches AuthEvent pattern) | **DONE** (2f20e0d) |
| 8 | STORM baseUrl in health (A05) | Removed from unauthenticated health endpoint | **DONE** (132a8cb) |

### Tier 3 — Strategic / Group E

| # | Gap | Fix | Status |
|---|-----|-----|--------|
| 9 | Security tests (A04) | Test framework + tests for RBAC, tenant isolation, IDOR prevention | Open |
| 10 | CI/CD pipeline (A08) | GitHub Actions with lint, type-check, `npm audit`, (future: tests) | Open |
| 11 | Tenant offboarding (MT-7) | Hard purge workflow, OFFBOARDING status, access revocation, provisioning rollback | Open |
| 12 | Encryption at rest (A02/Neo4j) | Host-level LUKS/dm-crypt on Neo4j volume | Open |
| 13 | Structured logging (A09) | Recorder wired throughout API (9000–9239 event codes) | **DONE** (132a8cb) |
| 14 | Formal threat model (A04) | STRIDE analysis covering all application flows | Open |
| 15 | Server-side session revocation (A01/A07) | Short-lived JWT + refresh token pattern, or token blacklist | Open |

---

## References

- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [Neo4j Security Configuration](https://neo4j.com/docs/operations-manual/current/security/)
- Previous analysis: `docs/MULTI-TENANT-GAP-ANALYSIS.md` (2026-03-16)
- Previous plan: `docs/MULTI-TENANT-GAP-PLAN.md` (Steps 1–10 implemented)
