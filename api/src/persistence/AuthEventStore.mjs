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
   * Count total auth events (optionally filtered by user).
   */
  async countEvents({ sub } = {}) {
    const subFilter = sub
      ? 'MATCH (user:User {sub: $sub})-[:HAS_AUTH_EVENT]->(event:AuthEvent)'
      : 'MATCH (event:AuthEvent)';

    const rows = await this.database.query(
      `${subFilter}
       RETURN count(event) AS total`,
      { sub: sub || null }
    );

    const result = rows[0]?.total ?? 0;
    return typeof result === 'object' && result.toNumber ? result.toNumber() : Number(result);
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

  // ── Session grouping ─────────────────────────────────────────────

  static SESSION_GAP_MS = 30 * 60 * 1000; // 30-minute idle → new session

  /**
   * Return session summaries (paginated).  A "session" is a span of
   * consecutive events from the same user with < 30 min gaps.
   */
  async listSessions({ limit = 20, offset = 0 } = {}) {
    const rows = await this.database.query(
      `MATCH (event:AuthEvent)
       OPTIONAL MATCH (user:User)-[:HAS_AUTH_EVENT]->(event)
       RETURN event.eventId   AS eventId,
              event.action    AS action,
              event.timestamp AS timestamp,
              event.ipAddress AS ipAddress,
              event.host      AS host,
              event.outcome   AS outcome,
              event.reason    AS reason,
              user.sub        AS sub,
              user.email      AS email,
              user.username   AS username
       ORDER BY event.timestamp DESC`,
      {}
    );

    const sessions = AuthEventStore.#groupIntoSessions(rows);
    const total = sessions.length;
    const page = sessions.slice(offset, offset + limit);

    return { sessions: page, total };
  }

  /**
   * Return individual events for one session (identified by sub +
   * time range).
   */
  async listSessionEvents({ sub, from, to }) {
    const subFilter = sub && sub !== 'anonymous'
      ? 'MATCH (user:User {sub: $sub})-[:HAS_AUTH_EVENT]->(event:AuthEvent)'
      : 'MATCH (event:AuthEvent) WHERE NOT (:User)-[:HAS_AUTH_EVENT]->(event)';

    const rows = await this.database.query(
      `${subFilter}
       WHERE event.timestamp >= $from AND event.timestamp <= $to
       OPTIONAL MATCH (u:User)-[:HAS_AUTH_EVENT]->(event)
       RETURN event.eventId   AS eventId,
              event.action    AS action,
              event.timestamp AS timestamp,
              event.ipAddress AS ipAddress,
              event.userAgent AS userAgent,
              event.host      AS host,
              event.outcome   AS outcome,
              event.reason    AS reason,
              u.sub           AS sub,
              u.email         AS email,
              u.username      AS username
       ORDER BY event.timestamp ASC`,
      { sub: sub || null, from, to }
    );

    return rows;
  }

  /**
   * Group a timestamp-descending array of events into sessions.
   * Each session contains events from the same user whose timestamps
   * are within SESSION_GAP_MS of each other.
   */
  static #groupIntoSessions(rows) {
    if (rows.length === 0) return [];

    const sessions = [];
    let currentSession = null;

    // rows are timestamp-descending; walk forward (newest first)
    for (const row of rows) {
      const userKey = row.sub || 'anonymous';
      const eventTime = new Date(row.timestamp).getTime();

      if (
        !currentSession ||
        currentSession.userKey !== userKey ||
        currentSession.oldestTime - eventTime > AuthEventStore.SESSION_GAP_MS
      ) {
        // Start a new session
        currentSession = {
          userKey,
          sub: row.sub,
          email: row.email,
          username: row.username,
          newestTimestamp: row.timestamp,
          oldestTimestamp: row.timestamp,
          newestTime: eventTime,
          oldestTime: eventTime,
          eventCount: 0,
          successCount: 0,
          failureCount: 0,
          actions: new Set(),
          ipAddresses: new Set(),
          hosts: new Set(),
        };
        sessions.push(currentSession);
      }

      currentSession.oldestTimestamp = row.timestamp;
      currentSession.oldestTime = eventTime;
      currentSession.eventCount += 1;
      if (row.outcome === 'success') currentSession.successCount += 1;
      if (row.outcome === 'failure') currentSession.failureCount += 1;
      currentSession.actions.add(row.action);
      if (row.ipAddress) currentSession.ipAddresses.add(row.ipAddress);
      if (row.host) currentSession.hosts.add(row.host);
    }

    // Serialize Sets to arrays for JSON transport
    for (const session of sessions) {
      session.actions = [...session.actions];
      session.ipAddresses = [...session.ipAddresses];
      session.hosts = [...session.hosts];
      delete session.userKey;
      delete session.newestTime;
      delete session.oldestTime;
    }

    return sessions;
  }
}
