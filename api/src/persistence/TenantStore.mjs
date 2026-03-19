// ════════════════════════════════════════════════════════════════════
// TenantStore — tenant lifecycle management
// ════════════════════════════════════════════════════════════════════

export class TenantStore {
  constructor(database) {
    this.database = database;
  }

  /**
   * Provision a new tenant:
   * 1. MERGE Tenant node
   * 2. Clone default ScoringConfig for the tenant
   * 3. Clone the active Questionnaire's current snapshot for the tenant
   */
  async createTenant({ tenantId, name, domain }) {
    const now = new Date().toISOString();

    // 1. Tenant node
    await this.database.query(
      `MERGE (t:Tenant {tenantId: $tenantId})
       SET t.name    = $name,
           t.domain  = $domain,
           t.active  = true,
           t.created = $now`,
      { tenantId, name, domain: domain || null, now }
    );

    // 2. Clone ScoringConfig from default — idempotent via MERGE
    await this.database.query(
      `MATCH (src:ScoringConfig {configId: 'default'})
       MERGE (dst:ScoringConfig {tenantId: $tenantId})
       ON CREATE SET dst.dampingFactor    = src.dampingFactor,
                     dst.rawMax           = src.rawMax,
                     dst.ratingThresholds = src.ratingThresholds,
                     dst.ratingLabels     = src.ratingLabels,
                     dst.configId         = $tenantId`,
      { tenantId }
    );

    // 3. Clone current QuestionnaireSnapshot — idempotent via MERGE
    await this.database.query(
      `MATCH (q:Questionnaire {active: true})-[:CURRENT_VERSION]->(snap:QuestionnaireSnapshot)
       MERGE (copy:QuestionnaireSnapshot {version: snap.version, tenantId: $tenantId})
       ON CREATE SET copy.label   = snap.label,
                     copy.data    = snap.data,
                     copy.created = snap.created`,
      { tenantId }
    );
  }

  /**
   * List all tenants with user counts.
   */
  async listTenants() {
    const rows = await this.database.query(
      `MATCH (t:Tenant)
       OPTIONAL MATCH (u:User)-[:BELONGS_TO]->(t)
       RETURN t.tenantId AS tenantId,
              t.name     AS name,
              t.domain   AS domain,
              t.active   AS active,
              t.created  AS created,
              count(u)   AS userCount
       ORDER BY t.name`
    );

    return rows.map((row) => ({
      tenantId:  row.tenantId,
      name:      row.name,
      domain:    row.domain,
      active:    row.active,
      created:   row.created,
      userCount: typeof row.userCount === 'object' && row.userCount?.toNumber
        ? row.userCount.toNumber()
        : Number(row.userCount ?? 0),
    }));
  }

  /**
   * Soft-delete a tenant.  Reviews and data are preserved.
   */
  async deactivateTenant(tenantId) {
    const result = await this.database.query(
      `MATCH (t:Tenant {tenantId: $tenantId})
       SET t.active = false
       RETURN t`,
      { tenantId }
    );

    return result.length > 0 ? (result[0].t || result[0]) : null;
  }
}
