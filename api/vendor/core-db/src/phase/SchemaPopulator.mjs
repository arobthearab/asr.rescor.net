/**
 * SchemaPopulator - Generic schema population workflow
 *
 * Provides reusable patterns for populating database schemas across deployment phases:
 * - DEV: Seed data + generated test data
 * - UAT: Sampled data from production (statistical sampling)
 * - PROD: Validation only (no population)
 *
 * Projects provide configuration for:
 * - Table names (core, static, ancillary)
 * - Relationships (foreign key mappings)
 * - Data generators (project-specific masked data)
 * - Seed data handlers
 *
 * Originally extracted from TestingCenter SchemaBuildout module.
 *
 * @example
 * import { SchemaPopulator } from '@rescor-llc/core-db';
 *
 * const populator = new SchemaPopulator({
 *   project: 'TC',
 *   productionSchema: 'TC',
 *   tables: {
 *     core: ['TEST', 'HOST', 'FINDING', 'ANNOTATION'],
 *     static: ['CONTROL_TYPE', 'HORIZON']
 *   },
 *   relationships: {
 *     'FINDING': { column: 'TEST_ID', idColumn: 'ID' },
 *     'HOST': { column: 'TEST_ID', idColumn: 'ID' }
 *   },
 *   dataGenerator: myDataGenerator
 * });
 *
 * // Populate DEV schema
 * const result = await populator.populateDev(dbHandle, 'TCDEV', {
 *   testCount: 5,
 *   hostsPerTest: 10
 * });
 */

import {
  queryScalar,
  tableExists,
  tableHasRows,
  copyTableRows,
  copyStaticTables,
  clearTables,
  computeSampleSize,
  buildInClause,
  getTablesWithColumn
} from '../utilities/index.mjs';

export class SchemaPopulator {
  /**
   * @param {Object} config - Project-specific configuration
   * @param {string} config.project - Project name (TC, SPM, D2)
   * @param {string} config.productionSchema - Production schema name
   * @param {Object} config.tables - Table configuration
   * @param {string[]} config.tables.core - Core tables (e.g., ['TEST', 'FINDING', 'HOST'])
   * @param {string[]} config.tables.static - Static/reference tables (e.g., ['CONTROL_TYPE'])
   * @param {Object} config.relationships - FK relationships
   *   Format: { 'TABLE': { column: 'PARENT_ID', idColumn: 'ID' } }
   * @param {Object} config.dataGenerator - Project-specific data generator
   *   Must have: async generateAll(dbHandle, schema, options) => result
   */
  constructor(config) {
    this.project = config.project;
    this.productionSchema = config.productionSchema;
    this.tables = config.tables || { core: [], static: [] };
    this.relationships = config.relationships || {};
    this.dataGenerator = config.dataGenerator;
  }

  /**
   * Populate development schema
   *
   * Workflow:
   * 1. Check if main table has data
   * 2. If empty (or seed replacement needed), generate masked data
   * 3. Optionally copy static tables from production
   *
   * @param {Object} dbHandle - Database handle
   * @param {string} schema - Target schema (e.g., 'TCDEV')
   * @param {Object} options - Population options
   * @param {boolean} options.generateData - Generate data if empty (default: true)
   * @param {boolean} options.copyStaticFromProd - Copy static tables from prod (default: false)
   * @param {Object} options.generatorOptions - Options passed to data generator
   * @returns {Promise<Object>} Result: { mode, schema, populated, generated, staticTables }
   */
  async populateDev(dbHandle, schema, options = {}) {
    const {
      generateData = true,
      copyStaticFromProd = false,
      generatorOptions = {}
    } = options;

    const results = {
      mode: 'DEV',
      schema,
      populated: false,
      generated: null,
      staticTables: []
    };

    // Check if main table has rows
    const mainTable = this.tables.core[0];
    const hasRows = await tableHasRows(dbHandle, schema, mainTable);

    // Generate data if table is empty
    if (!hasRows && generateData) {
      // Clear dependent tables first
      await clearTables(dbHandle, schema, this.tables.core);

      // Generate data using project-specific generator
      if (this.dataGenerator && this.dataGenerator.generateAll) {
        results.generated = await this.dataGenerator.generateAll(dbHandle, schema, generatorOptions);
        results.populated = true;
      }
    }

    // Copy static tables from production
    if (copyStaticFromProd && this.tables.static.length > 0) {
      results.staticTables = await copyStaticTables(
        dbHandle,
        this.productionSchema,
        schema,
        this.tables.static,
        { requireSource: false }
      );
    }

    return results;
  }

  /**
   * Populate UAT schema with sampled production data
   *
   * Workflow:
   * 1. Calculate statistical sample size from production
   * 2. Select random sample of parent entities (e.g., tests)
   * 3. Copy parent entities to UAT
   * 4. Copy child entities (findings, hosts, etc.)
   * 5. Auto-discover and copy ancillary tables with FK filtering
   *
   * @param {Object} dbHandle - Database handle
   * @param {string} schema - Target schema (e.g., 'TCUAT')
   * @param {Object} options - Sampling options
   * @param {Object} options.sampleConfig - Statistical sampling config
   * @param {number} options.sampleConfig.z - Z-score (default: 1.96 for 95% confidence)
   * @param {number} options.sampleConfig.e - Margin of error (default: 0.05 for 5%)
   * @param {string[]} options.excludeTables - Tables to exclude from ancillary discovery
   * @returns {Promise<Object>} Result: { mode, schema, sampleSize, tables, ancillaryTables }
   */
  async populateUat(dbHandle, schema, options = {}) {
    const {
      sampleConfig = {},
      excludeTables = []
    } = options;

    const results = {
      mode: 'UAT',
      schema,
      sampleSize: 0,
      tables: [],
      ancillaryTables: []
    };

    // Get main table (parent entity, typically 'TEST')
    const mainTable = this.tables.core[0];
    const mainRelationship = this.relationships[mainTable];

    // Calculate sample size
    const totalQuery = `SELECT COUNT(*) FROM ${this.productionSchema}.${mainTable}`;
    const total = await queryScalar(dbHandle, totalQuery);
    const sampleSize = computeSampleSize(Number(total || 0), sampleConfig);
    results.sampleSize = sampleSize;

    if (sampleSize === 0) {
      return results;
    }

    // Select random sample of parent IDs
    const idColumn = mainRelationship?.idColumn || 'ID';
    const sampleQuery = `
      SELECT ${idColumn}
      FROM ${this.productionSchema}.${mainTable}
      ORDER BY RAND()
      FETCH FIRST ${sampleSize} ROWS ONLY
    `;
    const sampleRows = await dbHandle.query(sampleQuery);
    const parentIds = (sampleRows || []).map(row => row[idColumn]);

    if (parentIds.length === 0) {
      return results;
    }

    // Copy parent entities
    const { clause: parentClause, params: parentParams } = buildInClause(idColumn, parentIds);
    results.tables.push(await copyTableRows({
      dbHandle,
      sourceSchema: this.productionSchema,
      targetSchema: schema,
      table: mainTable,
      whereClause: parentClause,
      whereParams: parentParams
    }));

    // Copy child entities based on relationships
    for (const table of this.tables.core.slice(1)) {
      const relationship = this.relationships[table];
      if (!relationship) continue;

      const { clause, params } = buildInClause(relationship.column, parentIds);
      results.tables.push(await copyTableRows({
        dbHandle,
        sourceSchema: this.productionSchema,
        targetSchema: schema,
        table,
        whereClause: clause,
        whereParams: params,
        requireEmptyTarget: false
      }));
    }

    // Auto-discover ancillary tables
    const ancillaryTables = new Set();
    const coreTableSet = new Set([...this.tables.core, ...this.tables.static, ...excludeTables]);

    // Find tables with foreign keys to our core tables
    for (const table of this.tables.core) {
      const relationship = this.relationships[table];
      if (!relationship) continue;

      const tablesWithFK = await getTablesWithColumn(
        dbHandle,
        this.productionSchema,
        relationship.column
      );

      for (const fkTable of tablesWithFK) {
        if (!coreTableSet.has(fkTable)) {
          ancillaryTables.add(fkTable);
        }
      }
    }

    // Copy ancillary tables
    for (const table of ancillaryTables) {
      // Determine which FK column to use for filtering
      let fkColumn = null;
      let fkValues = [];

      for (const coreTable of this.tables.core) {
        const relationship = this.relationships[coreTable];
        if (!relationship) continue;

        const columns = await getTablesWithColumn(dbHandle, this.productionSchema, relationship.column);
        if (columns.includes(table)) {
          fkColumn = relationship.column;
          // Get IDs from the core table we already copied
          const idsQuery = `SELECT ${relationship.idColumn} FROM ${schema}.${coreTable}`;
          const idRows = await dbHandle.query(idsQuery);
          fkValues = (idRows || []).map(row => row[relationship.idColumn]);
          break;
        }
      }

      if (fkColumn && fkValues.length > 0) {
        const { clause, params } = buildInClause(fkColumn, fkValues);
        const result = await copyTableRows({
          dbHandle,
          sourceSchema: this.productionSchema,
          targetSchema: schema,
          table,
          whereClause: clause,
          whereParams: params,
          requireEmptyTarget: false
        });
        results.ancillaryTables.push(result);
      }
    }

    return results;
  }

  /**
   * Validate production schema
   *
   * Ensures production schema exists and has expected tables.
   * Does NOT modify data.
   *
   * @param {Object} dbHandle - Database handle
   * @param {string} schema - Production schema name
   * @param {string[]} requiredTables - List of tables that must exist
   * @returns {Promise<Object>} Result: { schema, tables, missing }
   * @throws {Error} If schema or tables are missing
   */
  async validateProduction(dbHandle, schema, requiredTables = []) {
    const tablesToCheck = requiredTables.length > 0 ? requiredTables : this.tables.core;
    const missing = [];

    for (const table of tablesToCheck) {
      const exists = await tableExists(dbHandle, schema, table);
      if (!exists) {
        missing.push(table);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Production schema ${schema} missing tables: ${missing.join(', ')}`);
    }

    return {
      schema,
      tables: tablesToCheck.length,
      missing: []
    };
  }
}
