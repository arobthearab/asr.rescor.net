// ════════════════════════════════════════════════════════════════════
// ServiceAccountStore — machine-to-machine API key credentials
// ════════════════════════════════════════════════════════════════════
// Service accounts allow external systems (e.g. cc-api) to call
// admin endpoints without an Entra ID JWT.  Keys use the `sa_` prefix
// and are stored as SHA-256 hashes.
// ════════════════════════════════════════════════════════════════════

export class ServiceAccountStore {
  constructor(database) {
    this.database = database;
  }

  /**
   * Create a new service account.  The plaintext key is returned once
   * and never stored — only the hash is persisted.
   *
   * @param {object} options
   * @param {string} options.serviceAccountId - UUID
   * @param {string} options.label            - human-readable name
   * @param {string} options.apiKeyHash       - SHA-256 hex of the plaintext key
   * @param {string[]} options.roles          - e.g. ['admin']
   * @param {string} options.tenantId         - owning tenant (or 'demo')
   * @param {string} options.createdBy        - who created (sub or username)
   * @returns {Promise<object>}
   */
  async create({ serviceAccountId, label, apiKeyHash, roles, tenantId, createdBy }) {
    const now = new Date().toISOString();
    const rolesJson = JSON.stringify(roles);

    const rows = await this.database.query(
      `CREATE (sa:ServiceAccount {
         serviceAccountId: $serviceAccountId,
         label:            $label,
         apiKeyHash:       $apiKeyHash,
         roles:            $roles,
         tenantId:         $tenantId,
         createdBy:        $createdBy,
         created:          $now,
         active:           true
       })
       RETURN sa.serviceAccountId AS serviceAccountId,
              sa.label            AS label,
              sa.roles            AS roles,
              sa.tenantId         AS tenantId,
              sa.created          AS created,
              sa.active           AS active`,
      { serviceAccountId, label, apiKeyHash, roles: rolesJson, tenantId, createdBy, now }
    );

    const result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }
    return result;
  }

  /**
   * Look up a service account by its API key hash.
   * Only returns active accounts.
   *
   * @param {string} apiKeyHash
   * @returns {Promise<object|null>}
   */
  async findByApiKeyHash(apiKeyHash) {
    const rows = await this.database.query(
      `MATCH (sa:ServiceAccount {apiKeyHash: $apiKeyHash, active: true})
       RETURN sa.serviceAccountId AS serviceAccountId,
              sa.label            AS label,
              sa.roles            AS roles,
              sa.tenantId         AS tenantId,
              sa.created          AS created`,
      { apiKeyHash }
    );

    const result = rows[0] || null;
    if (result && typeof result.roles === 'string') {
      result.roles = JSON.parse(result.roles);
    }
    return result;
  }

  /**
   * List all service accounts (optionally filtered by tenant).
   *
   * @param {string|null} tenantId
   * @returns {Promise<object[]>}
   */
  async list(tenantId = null) {
    const matchClause = tenantId
      ? `MATCH (sa:ServiceAccount {tenantId: $tenantId})`
      : `MATCH (sa:ServiceAccount)`;

    const rows = await this.database.query(
      `${matchClause}
       RETURN sa.serviceAccountId AS serviceAccountId,
              sa.label            AS label,
              sa.roles            AS roles,
              sa.tenantId         AS tenantId,
              sa.created          AS created,
              sa.active           AS active
       ORDER BY sa.created DESC`,
      { tenantId: tenantId || null }
    );

    for (const row of rows) {
      if (typeof row.roles === 'string') {
        row.roles = JSON.parse(row.roles);
      }
    }
    return rows;
  }

  /**
   * Soft-delete (deactivate) a service account.
   *
   * @param {string} serviceAccountId
   * @returns {Promise<boolean>} true if found and deactivated
   */
  async deactivate(serviceAccountId) {
    const rows = await this.database.query(
      `MATCH (sa:ServiceAccount {serviceAccountId: $serviceAccountId})
       SET sa.active = false
       RETURN sa.serviceAccountId AS serviceAccountId`,
      { serviceAccountId }
    );

    return rows.length > 0;
  }
}
