// ════════════════════════════════════════════════════════════════════
// ASR Neo4j — Seed superusers
// ════════════════════════════════════════════════════════════════════
// Pre-provisions User nodes with admin roles so that the first real
// login inherits the correct permissions from the database.
// Idempotent — MERGE ensures no duplicates.
// ════════════════════════════════════════════════════════════════════

MERGE (u:User {email: 'atr@atra.us'})
  ON CREATE SET
    u.sub       = 'pre-provisioned:atr@atra.us',
    u.username  = 'atr@atra.us',
    u.roles     = '["admin"]',
    u.firstSeen = datetime(),
    u.lastSeen  = datetime()
  ON MATCH SET
    u.roles     = '["admin"]',
    u.lastSeen  = datetime();

// Link superuser to demo tenant (dev environment)
MATCH (u:User {email: 'atr@atra.us'})
MATCH (t:Tenant {tenantId: 'demo'})
MERGE (u)-[:BELONGS_TO]->(t);
