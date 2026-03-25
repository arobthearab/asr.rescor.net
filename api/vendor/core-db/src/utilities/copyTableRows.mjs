/**
 * copyTableRows - Copy rows from source table to target table with filtering
 *
 * Features:
 * - Validates DB2 identifiers (prevents SQL injection)
 * - Checks target table existence
 * - Optional empty target requirement
 * - Automatic duplicate prevention using primary keys
 * - WHERE clause filtering
 *
 * @param {Object} options - Copy options
 * @param {Object} options.dbHandle - Database handle
 * @param {string} options.sourceSchema - Source schema name
 * @param {string} options.targetSchema - Target schema name
 * @param {string} options.table - Table name (must exist in both schemas)
 * @param {string} options.whereClause - WHERE clause for filtering (e.g., "ID IN (?, ?)")
 * @param {Array} options.whereParams - Parameters for WHERE clause (default: [])
 * @param {boolean} options.requireEmptyTarget - Require target to be empty (default: true)
 * @returns {Promise<Object>} Result: { table, copied, skipped, reason? }
 *
 * @example
 * const result = await copyTableRows({
 *   dbHandle: db,
 *   sourceSchema: 'TC',
 *   targetSchema: 'TCUAT',
 *   table: 'TEST',
 *   whereClause: 'ID IN (?, ?, ?)',
 *   whereParams: [1, 2, 3]
 * });
 * // Returns: { table: 'TEST', copied: 3, skipped: false }
 */
import { DB2Operations as Operations } from '../DB2Operations.mjs';
import { tableExists } from './tableExists.mjs';
import { tableHasRows } from './tableHasRows.mjs';
import { getPrimaryKeyColumns } from './getPrimaryKeyColumns.mjs';

export async function copyTableRows({
  dbHandle,
  sourceSchema,
  targetSchema,
  table,
  whereClause,
  whereParams = [],
  requireEmptyTarget = true
}) {
  // Validate identifiers to prevent SQL injection
  Operations.validateDB2Identifier(sourceSchema, 'schema');
  Operations.validateDB2Identifier(targetSchema, 'schema');
  Operations.validateDB2Identifier(table, 'table');

  // Check target table exists
  const exists = await tableExists(dbHandle, targetSchema, table);
  if (!exists) {
    return { table, copied: 0, skipped: true, reason: 'missing-target-table' };
  }

  // Check if target is empty (if required)
  if (requireEmptyTarget) {
    const hasRows = await tableHasRows(dbHandle, targetSchema, table);
    if (hasRows) {
      return { table, copied: 0, skipped: true, reason: 'target-not-empty' };
    }
  }

  // Build NOT EXISTS clause using primary keys to prevent duplicates
  const pkColumns = await getPrimaryKeyColumns(dbHandle, targetSchema, table);
  let notExistsClause = '';
  if (pkColumns.length > 0) {
    const conditions = pkColumns.map(col => `t.${col} = s.${col}`).join(' AND ');
    notExistsClause = ` AND NOT EXISTS (SELECT 1 FROM ${targetSchema}.${table} t WHERE ${conditions})`;
  }

  // Build and execute INSERT SELECT
  const sql = `
    INSERT INTO ${targetSchema}.${table}
    SELECT *
    FROM ${sourceSchema}.${table} s
    WHERE ${whereClause}${notExistsClause}
  `;

  const result = await dbHandle.query(sql, whereParams);
  const copied = Array.isArray(result) ? result.length : 0;
  return { table, copied, skipped: false };
}
