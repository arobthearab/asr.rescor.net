// ════════════════════════════════════════════════════════════════════
// UserStore — user auto-registration in Neo4j
// ════════════════════════════════════════════════════════════════════
// MERGE on `sub` — first authenticated request creates the node;
// subsequent requests update lastSeen and roles.
// ════════════════════════════════════════════════════════════════════

export class UserStore {
  constructor(database) {
    this.database = database;
  }

  /**
   * Upsert a User node from JWT claims.  Also links the user to the
   * appropriate Tenant via BELONGS_TO (matched by Entra `tid` claim
   * or explicit tenantId).
   *
   * @param {object} claims - request.user from authenticate middleware
   * @returns {Promise<object>} the persisted user record
   */
  async ensureUser(claims) {
    const sub = claims.sub;
    const username = claims.preferred_username || claims.email || sub;
    const email = claims.email || '';
    const roles = JSON.stringify(claims.roles || []);
    const tenantId = claims.tenantId || null;
    const now = new Date().toISOString();

    const rows = await this.database.query(
      `MERGE (u:User { sub: $sub })
       ON CREATE SET
         u.username  = $username,
         u.email     = $email,
         u.roles     = $roles,
         u.firstSeen = $now,
         u.lastSeen  = $now
       ON MATCH SET
         u.username  = $username,
         u.email     = $email,
         u.roles     = $roles,
         u.lastSeen  = $now
       WITH u
       OPTIONAL MATCH (t:Tenant {tenantId: $tenantId})
       FOREACH (_ IN CASE WHEN t IS NOT NULL THEN [1] ELSE [] END |
         MERGE (u)-[:BELONGS_TO]->(t)
       )
       RETURN u.sub       AS sub,
              u.username  AS username,
              u.email     AS email,
              u.roles     AS roles,
              u.firstSeen AS firstSeen,
              u.lastSeen  AS lastSeen`,
      { sub, username, email, roles, tenantId, now }
    );

    const result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }

    return result;
  }

  /**
   * Look up a user by Entra subject.
   *
   * @param {string} sub - Entra ID subject identifier
   * @returns {Promise<object|null>}
   */
  async findBySub(sub) {
    const rows = await this.database.query(
      `MATCH (u:User {sub: $sub})
       OPTIONAL MATCH (u)-[:BELONGS_TO]->(t:Tenant)
       RETURN u.sub       AS sub,
              u.username  AS username,
              u.email     AS email,
              u.roles     AS roles,
              u.firstSeen AS firstSeen,
              u.lastSeen  AS lastSeen,
              collect(t.tenantId) AS tenants`,
      { sub }
    );

    let result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }

    return result;
  }

  /**
   * Return the list of tenantIds this user belongs to.
   * An admin with ['*'] can see all tenants.
   *
   * @param {string} sub
   * @returns {Promise<string[]>}
   */
  async getUserTenants(sub) {
    const rows = await this.database.query(
      `MATCH (u:User {sub: $sub})
       OPTIONAL MATCH (u)-[:BELONGS_TO]->(t:Tenant)
       RETURN collect(t.tenantId) AS tenants`,
      { sub }
    );

    const result = rows[0]?.tenants || [];
    return result;
  }
}
