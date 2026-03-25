/**
 * SchemaStatus - determine whether a phase schema is complete versus canonical schema
 */

export class TableAttributes {
  constructor(row = {}) {
    for (const [key, value] of Object.entries(row)) {
      this[String(key).toLowerCase()] = value;
    }
  }

  get(key) {
    return this[String(key).toLowerCase()];
  }
}

export class SchemaStatus {
  static BACKUP_FILTER = /^(\w+)_(\d{8})(?:_\d+)?$/;

  constructor({ handle = null, abbreviation = null, phase = null } = {}) {
    this.handle = handle;
    this.abbreviation = abbreviation;
    this.phase = phase;
  }

  get normalizedPhase() {
    const phase = String(this.phase || '').trim().toUpperCase();
    if (!phase) return 'PROD';
    if (['DEV', 'DEVELOPMENT', 'LOCAL'].includes(phase)) return 'DEV';
    if (['UAT', 'TEST', 'TESTING', 'STAGING'].includes(phase)) return 'UAT';
    if (['PROD', 'PRODUCTION', 'LIVE'].includes(phase)) return 'PROD';
    return phase;
  }

  get canonicalSchema() {
    return this.abbreviation;
  }

  get phaseSchema() {
    return /^PROD/.test(this.normalizedPhase)
      ? this.abbreviation
      : `${this.abbreviation}${this.normalizedPhase}`;
  }

  async listTables(schema) {
    const query = `
      SELECT TABSCHEMA AS SCHEMA, TABNAME AS NAME, TYPE
      FROM SYSCAT.TABLES
      WHERE TABSCHEMA = ?
    `;
    const rows = await this.handle.query(query, [schema]);

    return (rows || [])
      .map(row => new TableAttributes(row))
      .filter(row => !SchemaStatus.BACKUP_FILTER.test(String(row.get('name') || '').trim()));
  }

  async canonicalTables() {
    return this.listTables(this.canonicalSchema);
  }

  async phaseTables() {
    return this.listTables(this.phaseSchema);
  }

  async rowCount(schema, table) {
    const rows = await this.handle.query(`SELECT COUNT(*) AS COUNT FROM ${schema}.${table}`);
    return Number(rows?.[0]?.COUNT ?? rows?.[0]?.count ?? 0);
  }

  async schemaGaps() {
    const requiredTables = await this.canonicalTables();
    const phaseTables = await this.phaseTables();

    const phaseNames = new Set(phaseTables.map(table => String(table.get('name') || '').toUpperCase()));
    const missing = requiredTables.filter(table => !phaseNames.has(String(table.get('name') || '').toUpperCase()));

    return {
      required: requiredTables,
      phase: phaseTables,
      missing
    };
  }
}
