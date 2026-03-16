// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — Auth event constraints and indexes
// ════════════════════════════════════════════════════════════════════
// User activity logging — tracks authentication events.
// Idempotent — safe to re-run (IF NOT EXISTS).
// ════════════════════════════════════════════════════════════════════

CREATE CONSTRAINT auth_event_id_unique IF NOT EXISTS
  FOR (event:AuthEvent)
  REQUIRE event.eventId IS UNIQUE;

CREATE INDEX auth_event_timestamp_idx IF NOT EXISTS
  FOR (event:AuthEvent)
  ON (event.timestamp);

CREATE INDEX auth_event_action_idx IF NOT EXISTS
  FOR (event:AuthEvent)
  ON (event.action);
