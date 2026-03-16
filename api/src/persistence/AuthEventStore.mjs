// ════════════════════════════════════════════════════════════════════
// AuthEventStore — authentication event logging in Neo4j
// ════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';

export class AuthEventStore {
  constructor(database) {
    this.database = database;
  }

  /**
   * Log an authentication event.  Fire-and-forget — callers should
   * not await this in the request path.
   */
  async logEvent({ sub, action, ipAddress, userAgent, host, outcome, reason }) {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    await this.database.query(
      `CREATE (event:AuthEvent {
         eventId:   $eventId,
         action:    $action,
         timestamp: $timestamp,
         ipAddress: $ipAddress,
         userAgent: $userAgent,
         host:      $host,
         outcome:   $outcome,
         reason:    $reason
       })
       WITH event
       OPTIONAL MATCH (user:User {sub: $sub})
       FOREACH (_ IN CASE WHEN user IS NOT NULL THEN [1] ELSE [] END |
         MERGE (user)-[:HAS_AUTH_EVENT]->(event)
       )`,
      { eventId, sub, action, timestamp, ipAddress, userAgent, host, outcome, reason: reason || null }
    );
  }

  /**
   * List recent auth events across all users.
   */
  async listRecentEvents({ limit = 50, offset = 0, sub } = {}) {
    const subFilter = sub
      ? 'MATCH (user:User {sub: $sub})-[:HAS_AUTH_EVENT]->(event:AuthEvent)'
      : 'MATCH (event:AuthEvent) OPTIONAL MATCH (user:User)-[:HAS_AUTH_EVENT]->(event)';

    const rows = await this.database.query(
      `${subFilter}
       RETURN event.eventId   AS eventId,
              event.action    AS action,
              event.timestamp AS timestamp,
              event.ipAddress AS ipAddress,
              event.userAgent AS userAgent,
              event.host      AS host,
              event.outcome   AS outcome,
              event.reason    AS reason,
              user.sub        AS sub,
              user.email      AS email,
              user.username   AS username
       ORDER BY event.timestamp DESC
       SKIP $offset
       LIMIT $limit`,
      { limit: neo4j.int(limit), offset: neo4j.int(offset), sub: sub || null }
    );

    return rows;
  }

  /**
   * Count distinct users with at least one successful login since a
   * given datetime.
   */
  async countActiveUsers(sinceIso) {
    const rows = await this.database.query(
      `MATCH (user:User)-[:HAS_AUTH_EVENT]->(event:AuthEvent)
       WHERE event.outcome = 'success' AND event.timestamp >= $since
       RETURN count(DISTINCT user) AS activeCount`,
      { since: sinceIso }
    );

    const result = rows[0]?.activeCount ?? 0;
    return typeof result === 'object' && result.toNumber ? result.toNumber() : Number(result);
  }
}
