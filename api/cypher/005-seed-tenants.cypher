// ════════════════════════════════════════════════════════════════════
// ASR Neo4j — Seed tenants
// ════════════════════════════════════════════════════════════════════
// Creates the initial Tenant nodes.
// Idempotent — MERGE ensures no duplicates.
// ════════════════════════════════════════════════════════════════════

MERGE (rescor:Tenant {tenantId: '319d0c76-9d6c-4f59-b427-299fc75b1e62'})
  ON CREATE SET
    rescor.name       = 'RESCOR LLC',
    rescor.domain     = 'rescor.net',
    rescor.createdAt  = datetime(),
    rescor.active     = true
  ON MATCH SET
    rescor.name       = 'RESCOR LLC',
    rescor.domain     = 'rescor.net';

// Client-specific tenants are seeded via overlay cypher files in the client repo.
// Example:  ASR_OVERLAY_CYPHER_DIR=../asr.client-a/cypher npm run cypher:setup -w api

MERGE (demo:Tenant {tenantId: 'demo'})
  ON CREATE SET
    demo.name       = 'Demo Environment',
    demo.domain     = 'rescor.local',
    demo.createdAt  = datetime(),
    demo.active     = true,
    demo.protected  = true
  ON MATCH SET
    demo.name       = 'Demo Environment',
    demo.domain     = 'rescor.local',
    demo.protected  = true;
