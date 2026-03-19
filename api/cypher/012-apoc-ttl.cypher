// ════════════════════════════════════════════════════════════════════
// 012 — APOC TTL back-fill for AuthEvent nodes
// ════════════════════════════════════════════════════════════════════
// Sets a 90-day TTL on existing AuthEvent nodes that don't have one.
// New events get ttl stamped at creation time via AuthEventStore.
//
// Requires: APOC plugin with apoc.ttl.enabled=true on Neo4j instance.
// Safe to re-run (WHERE IS NULL guard).
// ════════════════════════════════════════════════════════════════════

MATCH (e:AuthEvent)
WHERE e.ttl IS NULL AND e.timestamp IS NOT NULL
SET e.ttl = datetime(e.timestamp) + duration({days: 90});
