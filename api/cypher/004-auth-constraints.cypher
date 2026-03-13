// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — Auth constraints and indexes
// ════════════════════════════════════════════════════════════════════
// RBAC + Multi-Tenancy schema additions.
// Idempotent — safe to re-run (IF NOT EXISTS).
// ════════════════════════════════════════════════════════════════════

// ─── Tenant ──────────────────────────────────────────────────────

CREATE CONSTRAINT tenant_id_unique IF NOT EXISTS
  FOR (tenant:Tenant)
  REQUIRE tenant.tenantId IS UNIQUE;

CREATE INDEX tenant_domain_index IF NOT EXISTS
  FOR (tenant:Tenant)
  ON (tenant.domain);

// ─── User ────────────────────────────────────────────────────────

CREATE CONSTRAINT user_sub_unique IF NOT EXISTS
  FOR (user:User)
  REQUIRE user.sub IS UNIQUE;

CREATE INDEX user_email_index IF NOT EXISTS
  FOR (user:User)
  ON (user.email);

// ─── ProposedChange ──────────────────────────────────────────────

CREATE CONSTRAINT proposed_change_id_unique IF NOT EXISTS
  FOR (change:ProposedChange)
  REQUIRE change.changeId IS UNIQUE;

// ─── AuditorComment ──────────────────────────────────────────────

CREATE CONSTRAINT auditor_comment_id_unique IF NOT EXISTS
  FOR (comment:AuditorComment)
  REQUIRE comment.commentId IS UNIQUE;
