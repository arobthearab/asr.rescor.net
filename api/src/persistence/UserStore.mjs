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
    const displayName = claims.displayName || null;
    const jwtRoles = claims.roles || [];
    const hasJwtRoles = jwtRoles.length > 0;
    const roles = JSON.stringify(hasJwtRoles ? jwtRoles : ['user']);
    const tenantId = claims.tenantId || null;
    const now = new Date().toISOString();

    // Claim pre-provisioned user (matched by email OR username) on first login
    await this.database.query(
      `MATCH (u:User)
       WHERE u.sub STARTS WITH 'pre-provisioned:'
         AND (u.email = $username OR u.username = $username)
       SET u.sub = $sub`,
      { username, sub }
    );

    const rows = await this.database.query(
      `MERGE (u:User { sub: $sub })
       ON CREATE SET
         u.username    = $username,
         u.email       = $email,
         u.displayName = $displayName,
         u.roles       = $roles,
         u.firstSeen   = $now,
         u.lastSeen    = $now
       ON MATCH SET
         u.username    = $username,
         u.email       = CASE WHEN $email <> '' THEN $email ELSE u.email END,
         u.displayName = CASE WHEN $displayName IS NOT NULL THEN $displayName ELSE u.displayName END,
         u.roles       = CASE WHEN $hasJwtRoles = true THEN $roles ELSE u.roles END,
         u.lastSeen    = $now
       WITH u
       OPTIONAL MATCH (t:Tenant {tenantId: $tenantId})
       FOREACH (_ IN CASE WHEN t IS NOT NULL THEN [1] ELSE [] END |
         MERGE (u)-[:BELONGS_TO]->(t)
       )
       RETURN u.sub         AS sub,
              u.username    AS username,
              u.email       AS email,
              u.displayName AS displayName,
              u.roles       AS roles,
              u.firstSeen   AS firstSeen,
              u.lastSeen    AS lastSeen`,
      { sub, username, email, displayName, roles, hasJwtRoles, tenantId, now }
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
       RETURN u.sub         AS sub,
              u.username    AS username,
              u.email       AS email,
              u.displayName AS displayName,
              u.roles       AS roles,
              u.firstSeen   AS firstSeen,
              u.lastSeen    AS lastSeen,
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

  /**
   * List all users.
   *
   * @returns {Promise<object[]>}
   */
  async listUsers() {
    const rows = await this.database.query(
      `MATCH (u:User)
       OPTIONAL MATCH (u)-[:BELONGS_TO]->(t:Tenant)
       RETURN u.sub         AS sub,
              u.username    AS username,
              u.email       AS email,
              u.displayName AS displayName,
              u.roles       AS roles,
              u.firstSeen   AS firstSeen,
              u.lastSeen    AS lastSeen,
              collect(t.tenantId) AS tenants
       ORDER BY u.username`
    );

    for (const row of rows) {
      if (typeof row.roles === 'string') {
        row.roles = JSON.parse(row.roles);
      }
    }

    return rows;
  }

  /**
   * Pre-provision a user by email so they can be assigned roles
   * before their first login.
   *
   * @param {string} email
   * @param {string[]} roles
   * @returns {Promise<object>}
   */
  async provisionUser(email, roles) {
    const sub = `pre-provisioned:${email}`;
    const rolesJson = JSON.stringify(roles);
    const now = new Date().toISOString();

    const rows = await this.database.query(
      `MERGE (u:User {email: $email})
       ON CREATE SET
         u.sub       = $sub,
         u.username  = $email,
         u.roles     = $roles,
         u.firstSeen = $now,
         u.lastSeen  = $now
       ON MATCH SET
         u.roles     = $roles,
         u.lastSeen  = $now
       RETURN u.sub         AS sub,
              u.username    AS username,
              u.email       AS email,
              u.displayName AS displayName,
              u.roles       AS roles,
              u.firstSeen   AS firstSeen,
              u.lastSeen    AS lastSeen`,
      { email, sub, roles: rolesJson, now }
    );

    const result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }

    return result;
  }

  /**
   * Update roles for an existing user (by sub).
   *
   * @param {string} sub
   * @param {string[]} roles
   * @returns {Promise<object|null>}
   */
  async updateRoles(sub, roles) {
    const rolesJson = JSON.stringify(roles);
    const now = new Date().toISOString();

    const rows = await this.database.query(
      `MATCH (u:User {sub: $sub})
       SET u.roles    = $roles,
           u.lastSeen = $now
       RETURN u.sub         AS sub,
              u.username    AS username,
              u.email       AS email,
              u.displayName AS displayName,
              u.roles       AS roles,
              u.firstSeen   AS firstSeen,
              u.lastSeen    AS lastSeen`,
      { sub, roles: rolesJson, now }
    );

    const result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }

    return result;
  }
}
