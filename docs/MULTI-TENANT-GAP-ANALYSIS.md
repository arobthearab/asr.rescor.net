# Multi-Tenant Security Gap Analysis

**Date**: 2026-03-16
**Baseline**: [OWASP Multi-Tenant Application Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
**Additional references**: OWASP Cloud Tenant Isolation Project, OWASP ASVS, Neo4j Security Checklist

## Scope

This document evaluates the ASR platform (asr.rescor.net) against the OWASP
Multi-Tenant Security Cheat Sheet's 8 best-practice areas and the Neo4j-specific
security guidance.  Each area is rated:

| Rating | Meaning |
|--------|---------|
| **MET** | Requirement fully satisfied |
| **PARTIAL** | Some aspects addressed, gaps remain |
| **GAP** | Not yet implemented |
| **N/A** | Not applicable to current architecture |

---

## 1. Tenant Identification & Context Management

**OWASP requirement**: Establish tenant context early in the request lifecycle;
use cryptographically secure, non-guessable tenant identifiers; never trust
client-supplied tenant IDs; bind tenant context to the authenticated session;
propagate tenant context securely through all application layers.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Tenant context from authenticated token | **MET** | `authenticate.mjs` extracts `tid` from Entra ID JWT `payload.tid` — never from client headers or query params |
| Non-guessable tenant identifiers | **MET** | Tenant IDs are Entra ID directory GUIDs (UUIDv4) — not sequential |
| Client-supplied tenant ID rejected | **MET** | `tid` is extracted server-side from JWT; no API accepts `tenantId` in request body for scoping |
| Tenant context bound to session | **MET** | `request.user.tenantId` set in auth middleware, available to all route handlers |
| Tenant context propagated to all layers | **PARTIAL** | Reviews use `SCOPED_TO` relationship; however, questionnaire config, scoring config, gates, and compliance tags are **not yet tenant-scoped** (global reads) |
| Multi-tenant issuer validation | **MET** | `authenticate.mjs` validates issuer format (`/^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]+)\/v2\.0$/`) and checks against `allowedTenants` whitelist |

**Gaps**:
- Questionnaire, scoring, gates, and compliance config lack tenant context propagation (planned: [Phase 2–3](PLAN-FULL-MULTITENANCY-USERLOG.md#phase-2))
- No middleware that automatically injects `tenantId` into every database query (defence-in-depth)

**Remediation**: Phase 2 (tenant-scoped questionnaire/scoring) + mandatory tenant-scoping middleware

---

## 2. Database Isolation Strategies

**OWASP requirement**: Choose an isolation strategy based on security
requirements and compliance needs — separate databases (highest), separate
schemas (high), shared tables with row-level security (medium), or hybrid.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Isolation model selected | **MET** | Architecture plan defines two deployment modes: shared-graph (multi-tenant) and database-per-tenant (single-tenant) — see [PLAN-FULL-MULTITENANCY-USERLOG.md](PLAN-FULL-MULTITENANCY-USERLOG.md) |
| Relationship-based isolation (Reviews) | **MET** | `Review-[:SCOPED_TO]->Tenant` enforced in `reviews.mjs`; non-admin queries filter by tenant |
| Relationship-based isolation (global data) | **GAP** | ScoringConfig, QuestionnaireSnapshot, QuestionnaireDraft, GateQuestion, ComplianceTagConfig are **not** linked to a Tenant node |
| Database-per-tenant option | **PARTIAL** | Designed in Phase 6 of the plan; not yet implemented. `SessionPerQueryWrapper` provides the abstraction boundary |
| Neo4j row-level security | **N/A** | Neo4j Community Edition does not support RLS or RBAC at the database level; isolation is application-enforced |
| Defence-in-depth: query filter middleware | **GAP** | No middleware automatically injects tenant filter into every Cypher query |

**Gaps**:
- Global config entities readable by all tenants
- No automated Cypher query interception to enforce tenant scope
- Single-tenant deployment mode not yet wired

**Remediation**: Phase 2–3 (OWNED_BY relationships), Phase 6 (deployment-mode wiring), consider a `TenantScopedDatabase` wrapper that auto-injects `tenantId` into parameterized queries

---

## 3. Preventing Cross-Tenant Data Access (IDOR Prevention)

**OWASP requirement**: Always validate that requested resources belong to
the current tenant; use composite keys; implement authorization at the data
access layer, not just the API layer; avoid exposing sequential/guessable IDs.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Non-guessable resource IDs | **MET** | Reviews use `randomUUID()` for `reviewId`; all node IDs are UUIDs |
| Tenant-scoped review access | **MET** | `reviews.mjs` GET list: admin sees all, non-admin filtered by `SCOPED_TO` tenant |
| Tenant-scoped single review access | **PARTIAL** | `GET /reviews/:reviewId` fetches by `reviewId` without explicit tenant check — relies on list filtering but allows direct access by ID if known |
| Answers/remediation tenant check | **PARTIAL** | Answers/remediation filtered by `reviewId`; the review itself is tenant-scoped, but no explicit `AND tenant = $tenantId` guard in the answer queries |
| Questionnaire admin IDOR | **GAP** | Draft/snapshot CRUD does not check tenant — any admin can modify any draft |
| Admin user management IDOR | **MET** | Admin routes gated by `authorize('admin')` — only admins can manage users |

**Gaps**:
- Direct review access by UUID not tenant-validated (information disclosure if reviewId leaked)
- Answer/remediation/proposed-change routes inherit review scope but lack explicit tenant guard
- Questionnaire admin operations are not tenant-scoped

**Remediation**:
- Add tenant validation on `GET /reviews/:reviewId` — verify `review-[:SCOPED_TO]->tenant` matches `request.user.tenantId`
- Phase 2 adds tenant scoping to questionnaire admin
- Consider a `verifyResourceTenant(reviewId, tenantId)` helper used by all review sub-routes

---

## 4. Cache & Session Isolation

**OWASP requirement**: Prefix cache keys with tenant identifier; use separate
cache namespaces; implement cache key validation; set appropriate TTLs.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Server-side caching | **N/A** | ASR does not use an application-level cache (Redis, Memcached) — all reads go to Neo4j |
| MSAL token cache | **MET** | MSAL v4 manages per-account token cache client-side; tenant context embedded in access token |
| Session isolation | **MET** | Stateless API — no server-side sessions; tenant context derived from JWT on every request |

**Gaps**: None currently. If caching is introduced (e.g., questionnaire config cache), it must be keyed by `tenantId`.

---

## 5. API Security & Rate Limiting

**OWASP requirement**: Per-tenant rate limiting and quotas; tenant-specific
throttling; validate tenant context on every API request; separate API keys
per tenant; tenant-aware request signing for B2B APIs.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Tenant context validation per request | **MET** | Auth middleware runs on all `/api/*` routes (except health) |
| Per-tenant rate limiting | **GAP** | No rate limiting middleware (express-rate-limit or equivalent) |
| API key per tenant | **N/A** | Uses Entra ID OAuth2 tokens, not API keys |
| Tenant-aware throttling | **GAP** | No throttling of any kind |
| CORS configuration | **PARTIAL** | `cors()` called with no origin restrictions — allows all origins in dev |

**Gaps**:
- No rate limiting (DoS/noisy-neighbor vulnerability)
- CORS allows all origins — acceptable in dev, must be restricted in production

**Remediation**:
- Add `express-rate-limit` with per-tenant key derivation
- Configure CORS `origin` to allowed domains per deployment
- Consider per-tenant quota enforcement at the API Gateway level for production

---

## 6. File Storage & Blob Isolation

**OWASP requirement**: Tenant-prefixed paths; storage access policies per
tenant; tenant ownership validation; signed URLs with tenant context; encryption
at rest with tenant-specific keys.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| File storage | **N/A** | ASR does not store tenant-uploaded files. Document export (DOCX) is generated on-the-fly from review data without server-side file persistence |

**Gaps**: None currently. If document storage or evidence uploads are added, tenant prefixing and ownership validation will be required.

---

## 7. Tenant Onboarding & Offboarding Security

**OWASP requirement**: Secure provisioning with isolated resources; unique
encryption keys per tenant; complete data deletion on offboarding; audit trail
of provisioning/deprovisioning; data export for portability.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Tenant provisioning | **PARTIAL** | Tenant nodes seeded via Cypher scripts (`005-seed-tenants.cypher`); no self-service onboarding |
| Resource isolation on provisioning | **GAP** | New tenant gets a Tenant node but no isolated questionnaire/scoring config (shares global) |
| Tenant offboarding / data deletion | **GAP** | No tenant deletion or data purge functionality |
| Data export for portability | **PARTIAL** | Review export (DOCX, XLSX) exists; no tenant-wide data export |
| Audit trail of provisioning | **GAP** | No logging of tenant creation/modification events |

**Gaps**:
- No automated provisioning that creates tenant-specific config
- No offboarding/data-deletion workflow
- No tenant lifecycle audit trail

**Remediation**: Phase 4 (Tenant Admin UI) + Phase 7 (future: tenant lifecycle management)

---

## 8. Logging, Monitoring & Audit

**OWASP requirement**: Include tenant context in all log entries; implement
tenant-isolated audit trails; monitor for cross-tenant access attempts; set
up alerts for tenant isolation violations; ensure compliance with
tenant-specific retention policies.

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Auth event logging | **MET** | Phase 1 (just implemented): `AuthEvent` nodes with timestamp, IP, user-agent, host, outcome, reason, linked to User via `HAS_AUTH_EVENT` |
| Tenant context in auth events | **PARTIAL** | Auth events are linked to User (who `BELONGS_TO` Tenant), but the `tenantId` is not stored directly on the AuthEvent node |
| Application audit trail | **GAP** | No audit logging for review creation, answer changes, remediation actions, role changes, etc. |
| Cross-tenant access attempt detection | **GAP** | No monitoring for access attempts across tenant boundaries |
| Tenant-specific retention policies | **GAP** | No retention policy or TTL on auth events or audit logs |
| Alerting on isolation violations | **GAP** | No alerting system |

**Gaps**:
- Auth events don't include `tenantId` directly (requires JOIN through User→Tenant)
- No data-mutation audit trail (answers, reviews, remediation)
- No cross-tenant access attempt detection
- No retention policies

**Remediation**:
- Add `tenantId` to AuthEvent nodes for direct querying
- Implement `AuditEvent` nodes for all data mutations (Phase 2+)
- Add cross-tenant access monitoring when tenant-scoped queries are implemented
- Configure APOC TTL for auth event auto-purge after retention period

---

## Neo4j-Specific Security Assessment

| Control | Rating | Evidence / Gap |
|---------|--------|----------------|
| Encryption at rest | **GAP** | Dev Neo4j container uses default storage — no dm-crypt/Bitlocker |
| Encryption in transit (TLS/SSL) | **GAP** | Bolt connection uses `bolt://` (unencrypted) in dev; production should use `bolt+s://` |
| Authentication | **MET** | Neo4j auth enabled (neo4j/asrdev123 in dev; Infisical-managed in prod) |
| Authorization (Neo4j RBAC) | **N/A** | Community Edition — single user, no database-level RBAC |
| Port security | **MET** | Neo4j ports (17474, 17687) bound to localhost via Docker compose |
| Parameterized queries | **MET** | All Cypher queries use `$param` syntax — no string interpolation |
| APOC whitelisting | **PARTIAL** | APOC plugin installed but not explicitly whitelisted to specific procedures |
| Backup isolation | **GAP** | No per-tenant backup strategy |
| Import directory segmentation | **N/A** | No bulk import operations; data seeded via Cypher scripts |

---

## Summary Matrix

| OWASP Area | Rating | Key Gaps |
|------------|--------|----------|
| 1. Tenant Identification | **PARTIAL** | Config entities not tenant-propagated |
| 2. Database Isolation | **PARTIAL** | Global config entities; no query-level defence-in-depth |
| 3. IDOR Prevention | **PARTIAL** | Direct review access lacks tenant check; questionnaire admin unscoped |
| 4. Cache Isolation | **MET/N/A** | No app cache; stateless API |
| 5. API Rate Limiting | **GAP** | No rate limiting or throttling |
| 6. File Storage | **N/A** | No tenant file storage |
| 7. Onboarding/Offboarding | **GAP** | No provisioning automation or data deletion |
| 8. Logging & Audit | **PARTIAL** | Auth events implemented; no data-mutation audit trail |
| Neo4j Security | **PARTIAL** | Queries parameterized; no TLS, no encryption at rest |

---

## Priority Remediation Roadmap

| Priority | Gap | Remediation | Plan Phase |
|----------|-----|-------------|------------|
| **Critical** | Direct review IDOR | Add tenant validation on GET /reviews/:reviewId | Immediate fix |
| **Critical** | No rate limiting | Add express-rate-limit with per-tenant keys | Pre-production |
| **High** | Global config entities | OWNED_BY relationships on all config nodes | [Phase 2–3](PLAN-FULL-MULTITENANCY-USERLOG.md) |
| **High** | Questionnaire admin unscoped | Tenant-scope all draft/publish operations | [Phase 2](PLAN-FULL-MULTITENANCY-USERLOG.md) |
| **High** | No TLS on Neo4j | Configure bolt+s:// for production | Production config |
| **Medium** | No data-mutation audit | AuditEvent nodes for all writes | Post-Phase 3 |
| **Medium** | No tenant provisioning automation | Tenant CRUD + isolated config cloning | [Phase 4](PLAN-FULL-MULTITENANCY-USERLOG.md) |
| **Medium** | No cross-tenant monitoring | Alerting on access pattern anomalies | Post-Phase 4 |
| **Medium** | CORS unrestricted | Configure origin whitelist per deployment | Production config |
| **Low** | Auth event retention | APOC TTL auto-purge | Post-Phase 1 |
| **Low** | No encryption at rest | dm-crypt/LUKS on production Neo4j volumes | Production infra |
| **Low** | No tenant offboarding | Data deletion + export workflow | Future |

---

## Related Documents

- [Multi-Tenancy + User Activity Log Plan](PLAN-FULL-MULTITENANCY-USERLOG.md) — 6-phase implementation roadmap
- [RBAC + Multi-Tenancy Plan](PLAN-RBAC-MULTITENANCY.md) — Role-based access control and tenant-scoped review isolation (completed)
- [ASR Project Patterns](PROJECT-PATTERNS.md) — Neo4j schema, scoring model, CLI commands
- [RESCOR Cross-Project Patterns](../../core.rescor.net/docs/PROJECT-PATTERNS.md) — Code style, secrets policy, configuration-first runtime

## References

- [OWASP Multi-Tenant Application Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [OWASP Cloud Tenant Isolation Project](https://owasp.org/www-project-cloud-tenant-isolation/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [Neo4j Security Configuration](https://neo4j.com/docs/operations-manual/current/security/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
