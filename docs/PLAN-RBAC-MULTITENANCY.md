# Plan: RBAC + Multi-Tenancy

**Status**: Complete (all 5 phases implemented)

## Goal

Add role-based access control (Administrator, Reviewer, User, Auditor) and tenant-scoped
review isolation to the ASR application.

- Only authorized people can change an ASR
- Only authorized people can view an ASR
- Distinction between reviewer, user, and auditor
- ASRs created under a tenant (e.g., client-a.example.com) are invisible to anyone outside that tenant
- A user associated with all tenants is effectively a superuser

## Roles

| Role | Code | Create Review | Edit Own | Edit Others' | View (own tenant) | Propose Changes | Auditor Comments | Delete |
|------|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Administrator | `admin` | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Reviewer | `reviewer` | ✅ | ✅ (owner) | ❌ | ✅ | — | ❌ | Own only |
| User | `user` | ❌ | ❌ | ❌ | ✅ (assigned) | ✅ (proposed) | ❌ | ❌ |
| Auditor | `auditor` | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |

- `admin` bypasses all role checks (same pattern as STORM API)
- A user with `tenants: ['*']` acts as a superuser across all tenants

## Current State (Gaps)

- Zero authorization — every route open to all authenticated users
- No Tenant/User nodes — all reviews live in a flat namespace
- No role enforcement — dev user gets `roles: ['assessor']` but nothing checks it
- Single-tenant Entra — only RESCOR LLC accounts can sign in

## Neo4j Schema Additions

### New Nodes

```
(:Tenant {tenantId, name, domain, active, created})
(:User {sub, username, email, roles, firstSeen, lastSeen})
(:ProposedChange {changeId, domainIndex, questionIndex, choiceText, rawScore, notes, proposedBy, proposedAt, status, resolvedBy, resolvedAt})
(:AuditorComment {commentId, text, author, created, resolved, resolvedBy, resolvedAt})
```

### New Relationships

```
(:User)-[:BELONGS_TO]->(:Tenant)
(:Review)-[:SCOPED_TO]->(:Tenant)
(:Review)-[:HAS_PROPOSED_CHANGE]->(:ProposedChange)-[:FOR_QUESTION]->(:Question)
(:Review)-[:HAS_AUDITOR_COMMENT]->(:AuditorComment)
(:AuditorComment)-[:ON_QUESTION]->(:Question)
```

### New Constraints (004-auth-constraints.cypher)

```cypher
CREATE CONSTRAINT tenant_id_unique FOR (t:Tenant) REQUIRE t.tenantId IS UNIQUE;
CREATE CONSTRAINT user_sub_unique FOR (u:User) REQUIRE u.sub IS UNIQUE;
CREATE CONSTRAINT proposed_change_id_unique FOR (p:ProposedChange) REQUIRE p.changeId IS UNIQUE;
CREATE CONSTRAINT auditor_comment_id_unique FOR (a:AuditorComment) REQUIRE a.commentId IS UNIQUE;
CREATE INDEX user_email_idx FOR (u:User) ON (u.email);
CREATE INDEX tenant_domain_idx FOR (t:Tenant) ON (t.domain);
```

---

## Phases

### Phase 1 — API Authorization + User/Tenant Nodes

*Foundation layer — no frontend changes yet.*

1. Create `api/src/middleware/authorize.mjs` — `authorize(...requiredRoles)` middleware
2. Create `api/src/persistence/UserStore.mjs` — `ensureUser(claims)` MERGE pattern
3. Create `api/cypher/004-auth-constraints.cypher` — Tenant, User, ProposedChange, AuditorComment
4. Create `api/cypher/005-seed-tenants.cypher` — seed client-a  rescor tenants
5. Update `authenticate.mjs` — call `ensureUser()` after JWT validation, extract `tid` claim
6. Update `server.mjs` — wire `authorize()` per route group
7. Update `GET /api/reviews` — tenant filter via `SCOPED_TO`
8. Update `POST /api/reviews` — create `SCOPED_TO` relationship

**Files:** authorize.mjs (NEW), UserStore.mjs (NEW), 004/005 cypher (NEW),
authenticate.mjs (MODIFY), server.mjs (MODIFY), reviews.mjs (MODIFY)

### Phase 2 — Proposed Changes (User Role)

*User role proposes answer changes without overwriting reviewer answers.*

1. `POST /api/reviews/:id/proposed-changes` — User creates ProposedChange
2. `GET /api/reviews/:id/proposed-changes` — list pending proposals
3. `PATCH /api/proposed-changes/:changeId/resolve` — Reviewer/Admin accept or reject

**Files:** proposedChanges.mjs (NEW), server.mjs (MODIFY)

### Phase 3 — Auditor Comments

*Auditor-specific comment field per review and optionally per question.*

1. `POST /api/reviews/:id/auditor-comments` — `authorize('admin', 'auditor')`
2. `GET /api/reviews/:id/auditor-comments` — visible to admin + auditor
3. `PATCH /api/auditor-comments/:commentId/resolve` — admin resolves

**Files:** auditorComments.mjs (NEW), server.mjs (MODIFY)

### Phase 4 — Frontend RBAC

*UI adapts to user's role.*

1. `GET /api/auth/me` endpoint
2. `useCurrentUser()` React hook
3. `RoleGuard` component
4. DashboardPage — hide "New Review" for user/auditor
5. ReviewPage — user: propose-change controls; auditor: read-only + comments panel
6. ProposedChangesPanel + AuditorCommentsPanel components

**Files:** auth.mjs (NEW), useCurrentUser.ts (NEW), RoleGuard.tsx (NEW),
ProposedChangesPanel.tsx (NEW), AuditorCommentsPanel.tsx (NEW),
DashboardPage.tsx (MODIFY), ReviewPage.tsx (MODIFY)

### Phase 5 — Multi-Tenant Entra ID

*Allow client-a.example.com accounts to sign in alongside RESCOR.*

1. Change app registration to multi-tenant in Entra portal
2. Update authConfig.ts authority → `/organizations`
3. Update authenticate.mjs for multi-issuer validation
4. Extract `tid` claim → Tenant mapping
5. Optional `ENTRA_ALLOWED_TENANTS` whitelist in Infisical

**Files:** authConfig.ts (MODIFY), authenticate.mjs (MODIFY)

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Roles source | Entra ID App Roles (JWT `roles`) | Centralized, auditable, no separate role store |
| Tenant mapping | Entra `tid` JWT claim → Neo4j Tenant | Standard Entra claim, always present |
| Superuser | `tenants: ['*']` | Simple flag, no special node type |
| User auto-registration | MERGE on first auth | Proven STORM pattern |
| Tenant provisioning | Pre-register (whitelist) | Prevents unauthorized orgs |
| Proposed vs direct edit | ProposedChange if reviewer already answered | Clear ownership trail |
| Role management UI | Entra-only initially | Simpler, can add later |

## Verification

1. **Phase 1**: `curl` with reviewer token → can create; user token → 403. GET returns only own tenant.
2. **Phase 2**: User proposes change → reviewer accepts → answer updated.
3. **Phase 3**: Auditor POSTs comment → 200; reviewer → 403.
4. **Phase 4**: Login as each role → UI adapts.
5. **Phase 5**: client-a.example.com login → sees only client reviews.
