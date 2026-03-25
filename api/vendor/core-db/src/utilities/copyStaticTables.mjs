/**
 * copyStaticTables - Copy static/reference tables from source to target schema
 *
 * Copies entire tables (all rows) without filtering.
 * Useful for reference data like CONTROL_TYPE, HORIZON, etc.
 *
 * Features:
 * - Skips if target table doesn't exist
 * - Skips if target table already has rows
 * - Optional source requirement (throw error if source missing)
 *
 * @param {Object} dbHandle - Database handle
 * @param {string} sourceSchema - Source schema name (e.g., 'TC')
 * @param {string} targetSchema - Target schema name (e.g., 'TCDEV')
 * @param {string[]} tables - Array of table names to copy
 * @param {Object} options - Copy options
 * @param {boolean} options.requireSource - Throw error if source table missing (default: false)
 * @returns {Promise<Array>} Array of results: [{ table, copied, skipped, reason? }]
 *
 * @example
 * const results = await copyStaticTables(
 *   db,
 *   'TC',
 *   'TCDEV',
 *   ['CONTROL_TYPE', 'HORIZON', 'IDENTITY_TYPE_MAP'],
 *   { requireSource: false }
 * );
 * // Returns: [
 * //   { table: 'CONTROL_TYPE', copied: 15, skipped: false },
 * //   { table: 'HORIZON', copied: 3, skipped: false },
 * //   { table: 'IDENTITY_TYPE_MAP', copied: 0, skipped: true, reason: 'target-not-empty' }
 * // ]
 */
import { tableExists } from './tableExists.mjs';
import { tableHasRows } from './tableHasRows.mjs';

export async function copyStaticTables(dbHandle, sourceSchema, targetSchema, tables, options = {}) {
  const requireSource = options.requireSource === true;
  const results = [];

  for (const table of tables) {
    // Check if target table exists
    const exists = await tableExists(dbHandle, targetSchema, table);
    if (!exists) {
      results.push({ table, copied: 0, skipped: true, reason: 'missing-target-table' });
      continue;
    }

    // Check if target already has rows
    const hasRows = await tableHasRows(dbHandle, targetSchema, table);
    if (hasRows) {
      results.push({ table, copied: 0, skipped: true, reason: 'target-not-empty' });
      continue;
    }

    // Copy all rows from source to target
    const sql = `INSERT INTO ${targetSchema}.${table} SELECT * FROM ${sourceSchema}.${table}`;
    try {
      const result = await dbHandle.query(sql);
      const copied = Array.isArray(result) ? result.length : 0;
      results.push({ table, copied, skipped: false });
    } catch (error) {
      // If source is required, throw error; otherwise, skip gracefully
      if (requireSource) {
        throw error;
      }
      results.push({ table, copied: 0, skipped: true, reason: 'source-missing-or-unavailable' });
    }
  }

  return results;
}
