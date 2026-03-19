// ════════════════════════════════════════════════════════════════════
// AuditEventStore — data-mutation audit trail in Neo4j
// ════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';

export class AuditEventStore {
  constructor(database) {
    this.database = database;
  }

  /**
   * Log a data-mutation event.  Fire-and-forget — callers must NOT
   * await this in the request path.
   *
   * action values: 'review.create' | 'review.delete' | 'answer.update'
   *                'role.change' | 'questionnaire.publish'
   * resourceType:  'Review' | 'User' | 'QuestionnaireDraft'
   */
  logEvent({ tenantId, sub, action, resourceType, resourceId, ipAddress, userAgent, meta = {} }) {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    this.database.query(
      `CREATE (:AuditEvent {
         eventId:      $eventId,
         tenantId:     $tenantId,
         sub:          $sub,
         action:       $action,
         resourceType: $resourceType,
         resourceId:   $resourceId,
         timestamp:    $timestamp,
         ipAddress:    $ipAddress,
         userAgent:    $userAgent,
         meta:         $meta
       })`,
      {
        eventId,
        tenantId:     tenantId || null,
        sub:          sub || null,
        action,
        resourceType,
        resourceId:   resourceId || null,
        timestamp,
        ipAddress:    ipAddress || null,
        userAgent:    userAgent || null,
        meta:         JSON.stringify(meta),
      }
    ).catch(() => {});
  }

  /**
   * List audit events with optional filters, newest first.
   */
  async listEvents({ tenantId, action, resourceId, since, until, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = {};

    if (tenantId)    { conditions.push('event.tenantId = $tenantId');       params.tenantId = tenantId; }
    if (action)      { conditions.push('event.action = $action');           params.action = action; }
    if (resourceId)  { conditions.push('event.resourceId = $resourceId');   params.resourceId = resourceId; }
    if (since)       { conditions.push('event.timestamp >= $since');        params.since = since; }
    if (until)       { conditions.push('event.timestamp <= $until');        params.until = until; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.database.query(
      `MATCH (event:AuditEvent)
       ${whereClause}
       RETURN event
       ORDER BY event.timestamp DESC
       SKIP $offset
       LIMIT $limit`,
      { ...params, offset: neo4j.int(offset), limit: neo4j.int(limit) }
    );

    return rows.map((row) => row.event || row);
  }

  /**
   * Count audit events matching the same filters as listEvents.
   */
  async countEvents({ tenantId, action, resourceId, since, until } = {}) {
    const conditions = [];
    const params = {};

    if (tenantId)   { conditions.push('event.tenantId = $tenantId');     params.tenantId = tenantId; }
    if (action)     { conditions.push('event.action = $action');         params.action = action; }
    if (resourceId) { conditions.push('event.resourceId = $resourceId'); params.resourceId = resourceId; }
    if (since)      { conditions.push('event.timestamp >= $since');      params.since = since; }
    if (until)      { conditions.push('event.timestamp <= $until');      params.until = until; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.database.query(
      `MATCH (event:AuditEvent)
       ${whereClause}
       RETURN count(event) AS total`,
      params
    );

    const result = rows[0]?.total ?? 0;
    return typeof result === 'object' && result.toNumber ? result.toNumber() : Number(result);
  }
}
