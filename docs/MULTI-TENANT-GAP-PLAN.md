# Multi-Tenant Security Gap Remediation Plan

**Date**: 2026-03-16
**Source**: [MULTI-TENANT-GAP-ANALYSIS.md](MULTI-TENANT-GAP-ANALYSIS.md)

## Context

The gap analysis benchmarked ASR against the OWASP Multi-Tenant Security Cheat Sheet and identified
12 gaps. This plan converts each into a discrete work item with exact file locations, Cypher, and
code patterns derived from reading the live codebase.

Current baseline (what already works):
- `request.user.tenantId` set from `payload.tid` in `authenticate.mjs`
- Reviews created with `SCOPED_TO` relationship; list route (`GET /reviews`) filters by tenant
- `requireOwnershipOrAdmin` in `authorize.mjs` checks `createdBy` ownership (≠ tenant check)
- `AuthEventStore.logEvent()` exists but does not store `tenantId` on the node
- Scoring config cached as a module-level singleton in `scoring.mjs` (must become per-tenant Map)

---

## Step 1 — IDOR: Tenant guard on `GET /reviews/:reviewId` and all sub-routes ✅ IMPLEMENTED

**Root cause**: `GET /:reviewId` (reviews.mjs:82) matches only by `reviewId` — no tenant filter.
`requireOwnershipOrAdmin` checks `createdBy` but not tenant membership.
Every route under `/api/reviews/:reviewId/*` inherits the same gap.

### 1a. New file: `api/src/persistence/ReviewStore.mjs`

```js
export async function verifyReviewTenant(database, reviewId, tenantId, isAdmin) {
  if (isAdmin) return reviewId;
  const result = await database.query(
    `MATCH (r:Review {reviewId: $reviewId})-[:SCOPED_TO]->(t:Tenant {tenantId: $tenantId})
     RETURN r.reviewId AS reviewId`,
    { reviewId, tenantId }
  );
  return result.length > 0 ? result[0].reviewId : null;
}
```

Returns `null` when the review doesn't exist **or** belongs to a different tenant.
Callers respond `404` (not `403`) — enumeration oracle prevention.

### 1b. `api/src/routes/reviews.mjs` — fix `GET /:reviewId` (line 82)

```js
// Replace lines 88-91 with tenant-aware Cypher (single DB round-trip):
`MATCH (review:Review {reviewId: $reviewId})
 WHERE $isAdmin OR EXISTS {
   MATCH (review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
 }
 OPTIONAL MATCH (review)-[:CONTAINS]->(existingAnswer:Answer)
 OPTIONAL MATCH (existingAnswer)-[:ANSWERS]->(question:Question)
 RETURN review, collect({answer: existingAnswer, question: question}) AS answers`
// params: { reviewId, tenantId: request.user?.tenantId, isAdmin }
```

### 1b (cont). `api/src/middleware/authorize.mjs` — extend `requireOwnershipOrAdmin`

The existing query:
```cypher
MATCH (r:Review {reviewId: $reviewId}) RETURN r.createdBy AS createdBy
```
Extend to verify tenant at the same time (covers all PATCH/DELETE routes that use this middleware):
```cypher
MATCH (r:Review {reviewId: $reviewId})
WHERE $isAdmin OR EXISTS {
  MATCH (r)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
}
RETURN r.createdBy AS createdBy
```
Null result → 404. Adds tenant protection to classification, deployment, submit, rename, delete.

### 1c. Sub-routes not protected by `requireOwnershipOrAdmin`

Call `verifyReviewTenant()` at handler entry in each of these files:

| File | Routes to guard |
|------|----------------|
| `api/src/routes/answers.mjs` | `PUT /:reviewId/answers` |
| `api/src/routes/remediation.mjs` | `GET`, `POST`, `PUT`, `DELETE` on `/:reviewId/remediation/*` |
| `api/src/routes/proposedChanges.mjs` | all `/:reviewId/proposed-changes` routes |
| `api/src/routes/auditorComments.mjs` | all `/:reviewId/auditor-comments` routes |
| `api/src/routes/gates.mjs` | `GET/PUT/DELETE /:reviewId/gates/*` |

Pattern (example for answers.mjs):
```js
import { verifyReviewTenant } from '../persistence/ReviewStore.mjs';

router.put('/:reviewId/answers', authorize('admin', 'reviewer'), async (request, response) => {
  const isAdmin = request.user?.roles?.includes('admin');
  const owned = await verifyReviewTenant(
    database, request.params.reviewId, request.user?.tenantId, isAdmin
  );
  if (!owned) return sendResult(response, 404, { error: 'Review not found' });
  // ... existing handler logic unchanged
});
```

---

## Step 2 — Rate limiting ✅ IMPLEMENTED

**Gap**: No throttling. `server.mjs:31` calls `cors()` with no config.

### 2a. Install

```
npm install express-rate-limit -w api
```

### 2b. New file: `api/src/middleware/rateLimiter.mjs`

```js
import rateLimit from 'express-rate-limit';

// Auth endpoints — tight (20 req / 15 min per IP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests, please try again later.' },
});

// API — per-tenant key, falls back to IP for unauthenticated requests
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.user?.tenantId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded, please slow down.' },
});
```

### 2c. `api/src/server.mjs`

```js
import { authLimiter, apiLimiter } from './middleware/rateLimiter.mjs';

application.use('/api/auth', authLimiter);  // before authenticate middleware (~line 30)
application.use('/api', apiLimiter);         // after cors(), before routes (~line 55)
```

---

## Step 3 — Add `tenantId` to `AuthEvent` nodes ✅ IMPLEMENTED

**Gap**: `AuthEventStore.logEvent()` (line 17) doesn't receive or store `tenantId`. Admin endpoint
and active-user counter are unscoped.

### 3a. `api/src/persistence/AuthEventStore.mjs`

```js
// logEvent — add tenantId to signature and CREATE:
async logEvent({ sub, tenantId, action, ipAddress, userAgent, host, outcome, reason }) {
  await this.database.query(
    `CREATE (event:AuthEvent {
       eventId:   $eventId,
       tenantId:  $tenantId,   // ← new
       action:    $action,
       ...
     }) ...`,
    { ..., tenantId }
  );
}

// listRecentEvents — add optional tenant filter:
async listRecentEvents({ limit = 50, offset = 0, sub, tenantId } = {}) {
  const tenantClause = tenantId ? 'AND event.tenantId = $tenantId' : '';
  // inject tenantClause into WHERE
}

// countActiveUsers — add optional tenant filter:
async countActiveUsers(sinceIso, tenantId = null) {
  const tenantClause = tenantId ? 'AND event.tenantId = $tenantId' : '';
}
```

### 3b. `api/src/middleware/authenticate.mjs`

Pass `tenantId: payload.tid || null` to `authEventStore.logEvent()` call (~line 65).

### 3c. `api/cypher/007-auth-events.cypher` — append index

```cypher
CREATE INDEX auth_event_tenant_idx IF NOT EXISTS FOR (e:AuthEvent) ON (e.tenantId);
```

### 3d. `api/src/routes/admin.mjs` — scope auth-events endpoint

`GET /api/admin/auth-events` — non-superadmin auto-gets their own `tenantId` as filter.
Superadmin (`tenants: ['*']`) can pass `?tenantId=` to query other tenants.

---

## Step 4 — CORS per-deployment configuration ✅ IMPLEMENTED

**Gap**: `application.use(cors())` at server.mjs:31 accepts all origins.

### `api/src/server.mjs`

```js
const rawOrigins = config.CORS_ALLOWED_ORIGINS; // "https://asr.rescor.net,https://asr.k12.com"
const corsOptions = rawOrigins
  ? { origin: rawOrigins.split(',').map(s => s.trim()) }
  : {};  // dev: allow all (preserved current behaviour)
application.use(cors(corsOptions));
```

Add `CORS_ALLOWED_ORIGINS` to the Infisical production secret set. Leave unset in dev.

---

## Step 5 — Tenant-scope questionnaire / scoring config ✅ IMPLEMENTED

**Gap**: `loadScoringConfiguration` (scoring.mjs:20) uses a module-level singleton and hardcodes
`ScoringConfig {configId: 'default'}` — no tenant filter. All draft/snapshot Cypher is unscoped.

### 5a. `api/cypher/009-tenant-config.cypher` (NEW)

```cypher
CREATE INDEX scoring_config_tenant_idx IF NOT EXISTS FOR (s:ScoringConfig)         ON (s.tenantId);
CREATE INDEX snapshot_tenant_idx       IF NOT EXISTS FOR (s:QuestionnaireSnapshot) ON (s.tenantId);
CREATE INDEX draft_tenant_idx          IF NOT EXISTS FOR (d:QuestionnaireDraft)    ON (d.tenantId);

// Migration: stamp existing global nodes with the demo tenant
MATCH (sc:ScoringConfig {configId: 'default'}) WHERE sc.tenantId IS NULL
SET sc.tenantId = 'demo';

MATCH (snap:QuestionnaireSnapshot) WHERE snap.tenantId IS NULL
SET snap.tenantId = 'demo';

MATCH (d:QuestionnaireDraft) WHERE d.tenantId IS NULL
SET d.tenantId = 'demo';
```

### 5b. `api/src/scoring.mjs` — per-tenant cache

Replace module-level `cachedScoringConfiguration` (line 14) with a `Map`:

```js
const scoringConfigCache = new Map();  // tenantId|'global' → config

export async function loadScoringConfiguration(database, tenantId = null) {
  const cacheKey = tenantId || 'global';
  if (scoringConfigCache.has(cacheKey)) return scoringConfigCache.get(cacheKey);

  const query = tenantId
    ? `MATCH (config:ScoringConfig {tenantId: $tenantId}) RETURN config LIMIT 1`
    : `MATCH (config:ScoringConfig {configId: 'default'}) RETURN config LIMIT 1`;

  const result = await database.query(query, { tenantId });
  // ... build answer object (same shape as lines 29-47) ...
  scoringConfigCache.set(cacheKey, answer);
  return answer;
}

export function clearScoringConfigurationCache(tenantId = null) {
  tenantId ? scoringConfigCache.delete(tenantId) : scoringConfigCache.clear();
}
```

Update all callers to pass `tenantId`:
- `config.mjs` → `loadScoringConfiguration(database, req.user?.tenantId)`
- `reviews.mjs` POST → `loadScoringConfiguration(database, tenantId)`
- `questionnaireAdmin.mjs` readLiveConfig + publishDraft → `loadScoringConfiguration(database, tenantId)`

### 5c. `api/src/routes/config.mjs` — tenant-scoped reads

**`GET /` (live questionnaire)**:
- Pass `tenantId` to `loadScoringConfiguration()`
- Snapshot lookup (`?version=`) — add `WHERE snap.tenantId = $tenantId OR $tenantId IS NULL`
- `loadComplianceTagConfigs()` — add tenant filter (see Step 6c)

**`GET /versions`** (line 128): add `WHERE snapshot.tenantId = $tenantId OR snapshot.tenantId IS NULL`

**`GET /scoring`**: rename `_request` → `request`, pass `tenantId` to `loadScoringConfiguration()`

### 5d. `api/src/routes/questionnaireAdmin.mjs` — scope all draft operations

| Route | Change |
|-------|--------|
| `readLiveConfig` | Add `tenantId` param; pass to `loadScoringConfiguration()`; add tenant filter to ComplianceTagConfig query (line 109) |
| `GET /drafts` (line 501) | `MATCH (draft:QuestionnaireDraft {tenantId: $tenantId})` |
| `POST /drafts` (line 532) | Add `tenantId: $tenantId` to `CREATE` |
| `GET /drafts/:draftId` (line 572) | `MATCH ... {draftId: $draftId, tenantId: $tenantId}` — 404 for wrong tenant |
| `PUT /drafts/:draftId` (line 607) | Add `tenantId: $tenantId` to `MATCH` |
| `POST /drafts/:draftId/publish` (line 670) | Add `tenantId` to draft MATCH; in `publishDraft()` stamp tenant's ScoringConfig (not `configId: 'default'`); add `tenantId` to snapshot CREATE; call `clearScoringConfigurationCache(tenantId)` |
| `DELETE /drafts/:draftId` (line 735) | Add `tenantId: $tenantId` to `MATCH` |
| `DELETE /versions/:version` (line 770) | Verify `snapshot.tenantId = req.user.tenantId` |
| `POST /import` (line 826) | Add `tenantId` to draft `CREATE` |
| `GET /export` (line 938) | Call `readLiveConfig(database, req.user?.tenantId)` |

In `publishDraft()` (line 224), replace the ScoringConfig stamp (line 330):
```cypher
// Before:
MATCH (config:ScoringConfig {configId: 'default'})
// After:
MATCH (config:ScoringConfig {tenantId: $tenantId})
```

---

## Step 6 — Tenant-scope gates and compliance config ✅ IMPLEMENTED

**Gap**: `GateQuestion` and `ComplianceTagConfig` nodes are global.

### 6a. `api/cypher/010-tenant-gates.cypher` (NEW)

```cypher
CREATE INDEX gate_tenant_idx           IF NOT EXISTS FOR (g:GateQuestion)       ON (g.tenantId);
CREATE INDEX compliance_tag_tenant_idx IF NOT EXISTS FOR (c:ComplianceTagConfig) ON (c.tenantId);

MATCH (g:GateQuestion) WHERE g.tenantId IS NULL
SET g.tenantId = 'demo';

MATCH (c:ComplianceTagConfig) WHERE c.tenantId IS NULL
SET c.tenantId = 'demo';
```

### 6b. `api/src/routes/gates.mjs`

`GET /api/gates` — add tenant filter with global fallback:
```cypher
MATCH (gate:GateQuestion)
WHERE gate.active = true
AND (gate.tenantId = $tenantId OR gate.tenantId IS NULL)
RETURN gate ORDER BY gate.sortOrder
```

`GET/PUT/DELETE /:reviewId/gates/*` — add `verifyReviewTenant()` call at handler entry (Step 1c pattern).

### 6c. `api/src/routes/config.mjs` — `loadComplianceTagConfigs`

```js
// Add tenantId param:
async function loadComplianceTagConfigs(database, tenantId) {
  const result = await database.query(
    `MATCH (config:ComplianceTagConfig)
     WHERE config.tenantId = $tenantId OR config.tenantId IS NULL
     RETURN config.tag AS tag, config.action AS action, config.baseUrl AS baseUrl`,
    { tenantId }
  );
  // ... same map-building logic
}
```

---

## Step 7 — Data-mutation audit trail (`AuditEvent` nodes) ✅ IMPLEMENTED

**Gap**: No logging for review creation, answer changes, role assignments, or publish events.

### 7a. `api/cypher/011-audit-events.cypher` (NEW)

```cypher
CREATE CONSTRAINT audit_event_id    IF NOT EXISTS FOR (a:AuditEvent) REQUIRE a.eventId IS UNIQUE;
CREATE INDEX audit_event_tenant_idx IF NOT EXISTS FOR (a:AuditEvent) ON (a.tenantId);
CREATE INDEX audit_event_action_idx IF NOT EXISTS FOR (a:AuditEvent) ON (a.action);
CREATE INDEX audit_event_ts_idx     IF NOT EXISTS FOR (a:AuditEvent) ON (a.timestamp);
```

Node shape:
```
(:AuditEvent {
  eventId, tenantId, sub,
  action,       // 'review.create' | 'review.delete' | 'answer.update' |
                //  'role.change'  | 'questionnaire.publish' | 'tenant.create' | 'tenant.delete'
  resourceType, // 'Review' | 'User' | 'QuestionnaireDraft'
  resourceId,   // reviewId / sub / draftId
  timestamp, ipAddress, userAgent,
  meta          // JSON string: { before?, after?, applicationName?, ... }
})
```

### 7b. `api/src/persistence/AuditEventStore.mjs` (NEW)

Modeled after `AuthEventStore`. Fire-and-forget:

```js
import { randomUUID } from 'node:crypto';

export class AuditEventStore {
  constructor(database) { this.database = database; }

  logEvent({ tenantId, sub, action, resourceType, resourceId, ipAddress, userAgent, meta = {} }) {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    this.database.query(
      `CREATE (:AuditEvent {
         eventId: $eventId, tenantId: $tenantId, sub: $sub,
         action: $action, resourceType: $resourceType, resourceId: $resourceId,
         timestamp: $timestamp, ipAddress: $ipAddress, userAgent: $userAgent,
         meta: $meta
       })`,
      { eventId, tenantId, sub, action, resourceType, resourceId,
        timestamp, ipAddress, userAgent, meta: JSON.stringify(meta) }
    ).catch(() => {});
  }

  async listEvents({ tenantId, action, resourceId, since, until, limit = 50, offset = 0 } = {}) {
    // Build WHERE clauses, ORDER BY timestamp DESC, paginate
  }
}
```

### 7c. `api/src/server.mjs`

Instantiate `AuditEventStore(database)` alongside `AuthEventStore`; pass to route factories that
need it (`reviews`, `answers`, `admin`, `questionnaireAdmin`).

### 7d. Wire fire-and-forget calls into routes

| Route | Action | resourceType | Notes |
|-------|--------|-------------|-------|
| `POST /api/reviews` | `review.create` | `Review` | meta: `{ applicationName }` |
| `DELETE /api/reviews/:id` | `review.delete` | `Review` | |
| `PUT /api/reviews/:id/answers` | `answer.update` | `Review` | meta: `{ domainIndex, questionIndex }` |
| `PATCH /api/admin/users/:sub/roles` | `role.change` | `User` | meta: `{ before: oldRoles, after: newRoles }` |
| `POST /admin/questionnaire/drafts/:id/publish` | `questionnaire.publish` | `QuestionnaireDraft` | meta: `{ questionnaireVersion }` |

### 7e. Admin endpoint — `api/src/routes/admin.mjs`

```
GET /api/admin/audit-events?action=&resourceId=&since=&until=&limit=&offset=
```
- Non-superadmin: `tenantId` forced to `req.user.tenantId`
- Superadmin (`tenants: ['*']`): can filter by any `?tenantId=`

---

## Step 8 — Tenant provisioning API ✅ IMPLEMENTED

**Gap**: New tenants get a Tenant node but no isolated config; no lifecycle management.

### 8a. `api/src/persistence/TenantStore.mjs` (NEW)

```js
export class TenantStore {
  constructor(database) { this.database = database; }

  async createTenant({ tenantId, name, domain }) {
    // 1. MERGE Tenant node
    await this.database.query(
      `MERGE (t:Tenant {tenantId: $tenantId})
       SET t.name = $name, t.domain = $domain, t.active = true, t.created = $now`,
      { tenantId, name, domain, now: new Date().toISOString() }
    );
    // 2. Clone default ScoringConfig for this tenant
    await this.database.query(
      `MATCH (src:ScoringConfig {configId: 'default'})
       MERGE (dst:ScoringConfig {tenantId: $tenantId})
       ON CREATE SET dst.dampingFactor        = src.dampingFactor,
                     dst.rawMax               = src.rawMax,
                     dst.ratingThresholds     = src.ratingThresholds,
                     dst.ratingLabels         = src.ratingLabels,
                     dst.questionnaireVersion = src.questionnaireVersion,
                     dst.questionnaireLabel   = src.questionnaireLabel,
                     dst.configId             = $tenantId`,
      { tenantId }
    );
    // 3. Clone current live QuestionnaireSnapshot for this tenant
    // (subquery finds the version stamped on the default ScoringConfig)
    await this.database.query(
      `MATCH (src:ScoringConfig {configId: 'default'})
       MATCH (snap:QuestionnaireSnapshot {version: src.questionnaireVersion,
                                          tenantId: 'demo'})
       MERGE (copy:QuestionnaireSnapshot {version: snap.version, tenantId: $tenantId})
       ON CREATE SET copy.label   = snap.label,
                     copy.data    = snap.data,
                     copy.created = snap.created`,
      { tenantId }
    );
  }

  async listTenants() {
    // MATCH (t:Tenant) OPTIONAL MATCH (u:User)-[:BELONGS_TO]->(t)
    // RETURN t, count(u) AS userCount ORDER BY t.name
  }

  async deactivateTenant(tenantId) {
    // MATCH (t:Tenant {tenantId: $tenantId}) SET t.active = false
  }

  async purgeTenant(tenantId) {
    // MATCH (n) WHERE n.tenantId = $tenantId DETACH DELETE n
    // + MATCH (:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId}) ...
  }
}
```

### 8b. `api/src/routes/admin.mjs` — add tenant management endpoints

```
GET    /api/admin/tenants              — list tenants with user counts (superadmin only)
POST   /api/admin/tenants              — provision { tenantId, name, domain }
DELETE /api/admin/tenants/:tenantId   — soft-delete; ?purge=true for hard delete
```

Emit `'tenant.create'` / `'tenant.delete'` to `AuditEventStore` on each mutation.

---

## Step 9 — APOC TTL for `AuthEvent` retention ✅ IMPLEMENTED

**Gap**: Auth events accumulate indefinitely.

### 9a. `api/cypher/012-apoc-ttl.cypher` (NEW)

```cypher
// Back-fill TTL on existing nodes (90 days from event timestamp)
MATCH (e:AuthEvent)
WHERE e.ttl IS NULL AND e.timestamp IS NOT NULL
SET e.ttl = datetime(e.timestamp) + duration({days: 90});
```

### 9b. `api/src/persistence/AuthEventStore.mjs` — stamp TTL on creation

```js
// In the CREATE Cypher, add:
ttl: datetime($timestamp) + duration({days: 90})
```

### 9c. Docker compose env for `asr-neo4j`

```yaml
environment:
  NEO4J_apoc_ttl_enabled: "true"
  NEO4J_apoc_ttl_schedule: 3600     # run hourly
  NEO4J_apoc_ttl_limit: 1000        # max nodes purged per run
```

---

## Step 10 — Production Neo4j hardening ✅ IMPLEMENTED

### 10a. TLS — operational, no code change

`NEO4J_URI` already comes from Infisical. Set `bolt+s://thorium.rescor.net:7687` in the production
secret set. Verify `@rescor/core-db` driver does not override TLS settings.

### 10b. APOC procedure whitelist

```yaml
# docker compose env for asr-neo4j:
NEO4J_dbms_security_procedures_whitelist: "apoc.ttl.*,apoc.periodic.*,apoc.util.*,apoc.convert.*"
NEO4J_dbms_security_procedures_unrestricted: "apoc.ttl.*"
```

---

## Group E — Future work (not in this plan)

| Item | When |
|------|------|
| Encryption at rest | dm-crypt/LUKS on production Neo4j volume — operational infra task |
| Full tenant offboarding | Tenant-wide XLSX/DOCX export + hard purge — after Step 8 soft-delete |
| Cross-tenant access monitoring | Log `verifyReviewTenant()` null hits as `'review.cross_tenant_attempt'` audit events; alert on threshold |
| Scope `GET /admin/users` by tenant | Non-superadmin admins see only their own tenant's user list |

---

## Execution order

| Step | Files modified | Files created |
|------|---------------|---------------|
| 1 — IDOR | `reviews.mjs`, `answers.mjs`, `remediation.mjs`, `proposedChanges.mjs`, `auditorComments.mjs`, `gates.mjs`, `authorize.mjs` | `ReviewStore.mjs` |
| 2 — Rate limit | `server.mjs` | `rateLimiter.mjs` |
| 3 — AuthEvent tenantId | `AuthEventStore.mjs`, `authenticate.mjs`, `007-auth-events.cypher` | — |
| 4 — CORS | `server.mjs` | — |
| 5 — Config scoping | `scoring.mjs`, `config.mjs`, `questionnaireAdmin.mjs` | `009-tenant-config.cypher` |
| 6 — Gates scoping | `gates.mjs`, `config.mjs` | `010-tenant-gates.cypher` |
| 7 — AuditEvent | `reviews.mjs`, `answers.mjs`, `admin.mjs`, `server.mjs` | `AuditEventStore.mjs`, `011-audit-events.cypher` |
| 8 — Provisioning | `admin.mjs` | `TenantStore.mjs` |
| 9 — APOC TTL | `AuthEventStore.mjs`, `docker-compose.yml` | `012-apoc-ttl.cypher` |
| 10 — Neo4j hardening | Infisical secrets, `docker-compose.yml` | — |

---

## Verification

| Step | Test |
|------|------|
| 1 | `curl -H "Authorization: Bearer <tenant_A_token>" /api/reviews/<tenant_B_reviewId>` → 404 |
| 1 | Cross-tenant answer PUT → 404 |
| 2 | `ab -n 400 -c 10 /api/reviews` (same token) → 429 after 300 req/min |
| 3 | Post-login: `MATCH (e:AuthEvent) RETURN e.tenantId LIMIT 1` in Neo4j → non-null |
| 4 | Production: `curl -H "Origin: https://evil.com" /api/config` → no `Access-Control-Allow-Origin` header |
| 5 | Two tenants with separate ScoringConfig: `GET /api/config/scoring` returns different values per tenant |
| 5 | Tenant A admin cannot see Tenant B's drafts via `GET /admin/questionnaire/drafts` |
| 6 | Tenant A gate list differs from Tenant B after per-tenant gate seeding |
| 7 | `POST /api/reviews` → `MATCH (a:AuditEvent {action: 'review.create'}) RETURN a` returns node with correct tenantId |
| 7 | Role change → AuditEvent with `before`/`after` in `meta` |
| 8 | `POST /api/admin/tenants` → new Tenant node + cloned ScoringConfig in Neo4j |
| 9 | AuthEvent node has `ttl` property; APOC scheduler purges expired nodes |
| Full | Two browser sessions from different tenants: neither can read the other's reviews, drafts, or audit events |
