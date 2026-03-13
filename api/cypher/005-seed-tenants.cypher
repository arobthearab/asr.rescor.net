// ════════════════════════════════════════════════════════════════════
// ASR Neo4j — Seed tenants
// ════════════════════════════════════════════════════════════════════
// Creates the initial Tenant nodes.
// Idempotent — MERGE ensures no duplicates.
// ════════════════════════════════════════════════════════════════════

// RESCOR LLC — the platform operator (super-tenant)
MERGE (rescor:Tenant {tenantId: '319d0c76-9d6c-4f59-b427-299fc75b1e62'})
  ON CREATE SET
    rescor.name       = 'RESCOR LLC',
    rescor.domain     = 'rescor.net',
    rescor.createdAt  = datetime(),
    rescor.active     = true
  ON MATCH SET
    rescor.name       = 'RESCOR LLC',
    rescor.domain     = 'rescor.net';

// Stride (k12.com) — first client tenant
MERGE (k12:Tenant {tenantId: 'k12.com'})
  ON CREATE SET
    k12.name       = 'Stride Inc (k12.com)',
    k12.domain     = 'k12.com',
    k12.createdAt  = datetime(),
    k12.active     = true
  ON MATCH SET
    k12.name       = 'Stride Inc (k12.com)',
    k12.domain     = 'k12.com';
