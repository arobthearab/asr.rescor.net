# Plan: Full Multi-Tenancy + User Activity Log

**Status**: Draft — 2026-03-16

## Goal

1. **Full tenant isolation** — each organization (mapped from Entra ID `tid` claim)
   gets a completely separate ASR environment: its own reviews, questionnaires,
   scoring configuration, and remediation items, invisible to other tenants.
2. **User activity log** — track every authentication event (login, token
   refresh, failed attempt) with timestamp, IP, and outcome; expose via a
   "User Log" icon in the User Management header bar.
3. **Preserve the current dev environment** — existing RESCOR data stays intact
   as a `demo` tenant, accessible for demonstrations.

---

## Current State

What exists today:

| Layer | Status |
|-------|--------|
| **Tenant nodes** | ✅ Two Tenants seeded (RESCOR LLC, Acme Corp) |
| **User→Tenant** | ✅ `BELONGS_TO` relationship via `tid` claim |
| **Review→Tenant** | ✅ `SCOPED_TO` relationship + admin vs. tenant-filtered GET |
| **Questionnaire** | ❌ Global — all tenants share one questionnaire + scoring config |
| **Remediation** | ❌ Scoped via Review (inherits tenant), but no explicit filter |
| **Auth events** | ❌ Not logged — only `firstSeen` / `lastSeen` timestamps on User |
| **User activity UI** | ❌ No log view; User Management shows users table only |

Key isolation gaps:

- `loadScoringConfiguration()` reads the single `ScoringConfig {configId: 'default'}`
  → every tenant gets the same scoring parameters
- Questionnaire snapshots (`QuestionnaireSnapshot`) are global — publishing
  affects all tenants
- Drafts (`QuestionnaireDraft`) are global
- `GET /api/config` returns the same data for all users regardless of tenant
- Gate questions are global
- ComplianceTagConfig is global
- Remediation route filters by reviewId (which is tenant-scoped) but the
  questionnaire editor is not

---

## Deployment Modes (Installation Choice)

Tenancy is a **deployment/installation choice**, not a runtime per-tenant
decision.  Both modes run identical API code.

### Multi-Tenant Mode (`ASR_TENANCY_MODE=multi`)

Single Neo4j instance.  Every tenant-owned entity connects to its Tenant node
via a relationship (existing `SCOPED_TO` pattern extended to all data types
via `OWNED_BY`).  Global entities (NIST CSF, Policy master data) remain shared.

**Pros**: Zero infrastructure overhead, single backup, single upgrade path,
queries stay in one database.

**Cons**: Tenant leaks if a query misses the filter.  Defence-in-depth via
mandatory tenant-scoping middleware that injects `tenantId` into every query.

### Single-Tenant Mode (`ASR_TENANCY_MODE=single`)

Each client installation gets its own dedicated API + Neo4j deployment.
The entire database *is* the tenant boundary — no cross-tenant data possible.

**Pros**: Hard physical isolation — impossible to leak across tenants.
Each installation can have independent schema versions, different
questionnaires, separate backup schedules.

**Cons**: N deployments to maintain.  Cross-tenant admin views require
external aggregation.  More operational overhead per client.

### How It Works

`createDatabase(configuration)` already returns a single
`SessionPerQueryWrapper`.  In both modes, the API gets one wrapper:

- **Multi-tenant**: one shared database, queries include tenant filter
  via `OWNED_BY`/`SCOPED_TO` relationships
- **Single-tenant**: one dedicated database, tenant filter relationships
  exist but are redundant (all data belongs to the single tenant)

No runtime database router is needed.  A single-tenant client is simply a
standalone installation of the same codebase with its own Neo4j.

### Recommendation

**Start with multi-tenant mode** for development, demo, and initial clients.
Single-tenant mode is available for compliance-sensitive clients — it's just
a different deployment configuration, not different code.

---

## Data Model Changes

### New Relationships (tenant-scoping)

```
(:ScoringConfig)-[:OWNED_BY]->(:Tenant)
(:QuestionnaireSnapshot)-[:OWNED_BY]->(:Tenant)
(:QuestionnaireDraft)-[:OWNED_BY]->(:Tenant)
(:GateQuestion)-[:OWNED_BY]->(:Tenant)       // optional — can stay global
(:ComplianceTagConfig)-[:OWNED_BY]->(:Tenant) // optional — can stay global
```

### New Node: AuthEvent

```
(:AuthEvent {
  eventId:   String (UUID),
  action:    String ('login' | 'token_refresh' | 'login_failed' | 'logout'),
  timestamp: DateTime,
  ipAddress: String,
  userAgent: String,
  host:      String,      // request Host header (detects ngrok vs localhost)
  outcome:   String ('success' | 'failure'),
  reason:    String       // null on success; error message on failure
})
```

### New Relationships

```
(:User)-[:HAS_AUTH_EVENT]->(:AuthEvent)
```

### New Constraints (007-auth-events.cypher)

```cypher
CREATE CONSTRAINT auth_event_id_unique IF NOT EXISTS
  FOR (e:AuthEvent) REQUIRE e.eventId IS UNIQUE;
CREATE INDEX auth_event_timestamp_idx IF NOT EXISTS
  FOR (e:AuthEvent) ON (e.timestamp);
CREATE INDEX auth_event_action_idx IF NOT EXISTS
  FOR (e:AuthEvent) ON (e.action);
```

---

## Phases

### Phase 1 — User Activity Logging (AuthEvent nodes)

*Immediate value: tracks who logged in when, from where, with what outcome.*

**API changes:**

1. **AuthEventStore.mjs** (NEW) — persistence for auth events
   - `logEvent({ sub, action, ipAddress, userAgent, host, outcome, reason })`
     - Creates `(:AuthEvent)` linked to `(:User)` via `HAS_AUTH_EVENT`
   - `listEventsForUser(sub, { limit, offset })` — paginated
   - `listRecentEvents({ limit, offset })` — all users, most recent first
   - `countActiveUsers(sinceDatetime)` — users with at least one successful
     login since the given datetime

2. **authenticate.mjs** (MODIFY) — log auth events at each decision point
   - Successful JWT validation → `logEvent(action: 'login', outcome: 'success')`
   - Failed JWT validation → `logEvent(action: 'login_failed', outcome: 'failure')`
   - Dev bypass activation → `logEvent(action: 'login', outcome: 'success',
     reason: 'dev-bypass')`
   - Extract IP from `request.ip` or `x-forwarded-for`
   - Extract user-agent from `request.headers['user-agent']`
   - **Non-blocking**: fire-and-forget (don't delay the response for logging)

3. **007-auth-events.cypher** (NEW) — constraints + indexes

4. **admin.mjs** (MODIFY) — new endpoints
   - `GET /api/admin/auth-events` — paginated list of recent auth events
     (admin only); query params: `?limit=50&offset=0&sub=<optional>`
   - `GET /api/admin/auth-events/active-count` — count of distinct users
     with a successful login in the last 30 days

**Frontend changes:**

5. **apiClient.ts** (MODIFY) — add `fetchAuthEvents()` and `fetchActiveUserCount()`

6. **AdminUsersPage.tsx** (MODIFY) — add "User Log" icon button in the header
   bar Toolbar, right before the "Provision User" button
   - Icon: `HistoryIcon` (MUI) with tooltip "User Activity Log"
   - Click opens a dialog or navigates to an activity log view

7. **UserActivityLogDialog.tsx** (NEW) — dialog component
   - Shows a table: timestamp, user (email/username), action, outcome, IP, host
   - Pill/chip for outcome (green=success, red=failure)
   - Filter by user (autocomplete from user list)
   - Filter by action type
   - Pagination (50 per page)
   - Summary bar at top: "N active users in last 30 days"

**Files:** AuthEventStore.mjs (NEW), 007-auth-events.cypher (NEW),
authenticate.mjs (MODIFY), admin.mjs (MODIFY), apiClient.ts (MODIFY),
AdminUsersPage.tsx (MODIFY), UserActivityLogDialog.tsx (NEW)

---

### Phase 2 — Tenant-Scoped Questionnaire & Scoring

*Each tenant gets its own questionnaire configuration.*

**API changes:**

1. **ScoringConfig** gets `OWNED_BY` relationship to Tenant
   - Migration: link existing `ScoringConfig {configId: 'default'}` to a new
     `demo` tenant (or the RESCOR tenant)
   - `loadScoringConfiguration()` modified to accept `tenantId` parameter
   - Each tenant gets its own ScoringConfig (cloned from default on first use)

2. **QuestionnaireSnapshot** gets `OWNED_BY` relationship to Tenant
   - Publishing creates a snapshot linked to the current user's tenant
   - `GET /api/config` filters snapshots by tenant
   - `GET /api/config/versions` filters by tenant

3. **QuestionnaireDraft** gets `OWNED_BY` relationship to Tenant
   - Draft CRUD filtered by tenant

4. **config.mjs** (MODIFY)
   - Extract `tenantId` from `request.user.tenantId`
   - All queries add tenant filter
   - `loadScoringConfiguration(tenantId)` → returns tenant-specific config

5. **questionnaireAdmin.mjs** (MODIFY)
   - All draft/publish/delete operations scoped to tenant
   - Version listing scoped to tenant

6. **Migration script** (NEW) — `008-migrate-tenant-scoping.cypher`
   - Link all existing unlinked data to the RESCOR/demo tenant
   - Creates `OWNED_BY` relationships for existing global nodes

**Frontend changes:**

7. Minimal — the frontend already sends the auth token; tenant scoping happens
   server-side.  No UI changes needed unless we add a tenant selector for
   superusers.

**Files:** config.mjs (MODIFY), questionnaireAdmin.mjs (MODIFY), scoring.mjs
(MODIFY), 008-migrate-tenant-scoping.cypher (NEW)

---

### Phase 3 — Tenant-Scoped Gates & Compliance Config

1. **GateQuestion** — link to Tenant via `OWNED_BY`
   - `gates.mjs` filters by tenant
   - Migration: link existing gates to demo tenant

2. **ComplianceTagConfig** — link to Tenant via `OWNED_BY`
   - `config.mjs` builds compliance refs from tenant-specific tags
   - Migration: link existing tags to demo tenant

3. **Policy nodes** — already client-seeded; link to Tenant if not already

**Files:** gates.mjs (MODIFY), config.mjs (MODIFY), migration cypher (EXTEND)

---

### Phase 4 — Tenant Admin UI

*Superuser can manage tenants; tenant picker for cross-tenant admin view.*

1. **Tenant CRUD endpoints**
   - `GET /api/admin/tenants` — list all tenants (superuser)
   - `POST /api/admin/tenants` — create tenant
   - `PATCH /api/admin/tenants/:tenantId` — update name/domain/active

2. **TenantStore.mjs** (NEW) — persistence for tenant management

3. **Tenant user assignment**
   - `POST /api/admin/tenants/:tenantId/users` — add user to tenant
   - `DELETE /api/admin/tenants/:tenantId/users/:sub` — remove

4. **Frontend**
   - **AdminTenantsPage.tsx** (NEW) — tenant management CRUD
   - Tenant selector in admin header bar for superusers
   - Route: `/admin/tenants`

**Files:** TenantStore.mjs (NEW), admin.mjs (MODIFY), AdminTenantsPage.tsx
(NEW), App.tsx (MODIFY), apiClient.ts (MODIFY)

---

### Phase 5 — Demo Tenant Preservation

*Ensure existing dev data remains accessible.*

1. **Seed a `demo` Tenant** in 005-seed-tenants.cypher (or new script)
   - `tenantId: 'demo'`, `name: 'Demo Environment'`, `domain: 'rescor.local'`

2. **Migration** — link all existing unlinked Reviews, ScoringConfig,
   QuestionnaireSnapshots, QuestionnaireDrafts, Gates to the demo tenant

3. **Dev bypass** — when `isDevelopment=true` and localhost, the synthetic dev
   user gets `tenantId: 'demo'` → sees demo data

4. **Protected flag** — `Tenant.protected: true` on demo tenant → cannot be
   deleted via admin UI

---

### Phase 6 — Deployment Mode Wiring

*Design now, implement later.  Enables single-tenant installations.*

1. **`ASR_TENANCY_MODE`** config key in Infisical (`multi` | `single`,
   default `multi`)

2. **Single-tenant Docker Compose template** — one API + one Neo4j,
   pre-seeded with a single Tenant node

3. **Provisioning CLI**: `npm run tenant:provision -- --name "Acme Corp"
   --domain acme.com` — seeds Tenant node + runs DDL scripts

4. **No runtime routing needed** — single-tenant is just a standalone
   installation of the same codebase with its own Neo4j

5. **Multi-tenant admin features** (Phase 4 tenant CRUD) only enabled
   when `ASR_TENANCY_MODE=multi`

6. **Trade-offs:**
   - Each single-tenant installation: ~512MB RAM minimum (Neo4j) + API
   - Backup/restore per installation
   - Schema migrations must run against all installations
   - Cross-tenant reporting requires external aggregation
   - **Not recommended for the immediate term** — use multi-tenant mode
     first; graduate individual high-security clients to dedicated installs

---

## Migration Strategy

All phases use idempotent MERGE/IF NOT EXISTS patterns — safe to re-run.

| Phase | Migration |
|-------|-----------|
| 1 | New constraints only (no data migration) |
| 2 | Link existing ScoringConfig/Snapshots/Drafts → demo tenant |
| 3 | Link existing Gates/ComplianceTagConfig → demo tenant |
| 4 | No migration (new feature) |
| 5 | Create demo tenant, link orphaned data |
| 6 | No migration (deployment configuration only) |

**Execution order**: Phase 5 migration should run before Phases 2–3 so the
demo tenant exists when we start linking data to it.  Actual implementation
order: Phase 1 → Phase 5 → Phase 2 → Phase 3 → Phase 4 → Phase 6 (optional).

---

## Implementation Priority

| Priority | Phase | Effort | Value |
|----------|-------|--------|-------|
| **Now** | Phase 1 (User Activity Log) | 1 session | Immediate admin visibility |
| **Now** | Phase 5 (Demo Tenant) | 0.5 session | Required foundation |
| **Next** | Phase 2 (Tenant Questionnaire) | 1–2 sessions | Core isolation |
| **Next** | Phase 3 (Tenant Gates/Compliance) | 0.5 session | Completes isolation |
| **Later** | Phase 4 (Tenant Admin UI) | 1 session | Management convenience |
| **Design Now** | Phase 6 (Deployment Mode) | 1 session | Single-tenant installs |

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Isolation model | Deployment mode choice: multi-tenant (shared) or single-tenant (dedicated) | Installation config, not runtime routing — identical API code for both |
| Single-tenant mode | Separate installation per client | No runtime DB router; each client gets own API + Neo4j deployment |
| Auth event storage | Neo4j nodes (not external log) | Consistent with existing stack; queryable via Cypher |
| Auth event retention | No auto-purge initially | Small volume; add TTL later if needed |
| Demo tenant | `tenantId: 'demo'`, protected | Preserves all existing dev data |
| Questionnaire sharing | Tenant-specific by default | Each org has different ISP/IISP; global templates can be cloned |
| Global data | CSF subcategories, NIST framework | Shared reference data — same for all tenants |
| Tenant-specific data | Reviews, Snapshots, Drafts, Scoring, Gates, Compliance tags | Full isolation per org |

## Verification

**Phase 1:**
1. Login via Entra → AuthEvent created with `action: 'login'`, IP address, user-agent
2. Failed token → AuthEvent with `outcome: 'failure'`
3. Dev bypass → AuthEvent with `reason: 'dev-bypass'`
4. Admin UI → "User Log" icon opens dialog showing event history
5. Active user count shows in summary bar

**Phase 2:**
1. User in Tenant A publishes questionnaire → only Tenant A sees it
2. User in Tenant B has independent questionnaire + scoring config
3. `GET /api/config` returns tenant-specific data
4. Demo tenant sees all existing dev data unchanged

**Phase 5:**
1. Existing reviews linked to demo tenant
2. Dev bypass user sees demo tenant data
3. Demo tenant cannot be deleted

**Phase 6:**
1. `ASR_TENANCY_MODE=single` → single-tenant Docker Compose works
2. Provisioning CLI seeds Tenant node + runs DDL
3. Multi-tenant admin features hidden when `ASR_TENANCY_MODE=single`
