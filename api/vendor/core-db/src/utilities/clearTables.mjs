/**
 * clearTables - Delete all rows from specified tables
 *
 * Executes DELETE FROM for each table if it exists.
 * Skips tables that don't exist (no error thrown).
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} schema - Schema name
 * @param {string[]} tables - Array of table names to clear
 * @returns {Promise<void>}
 *
 * @example
 * await clearTables(db, 'TCDEV', ['TEST', 'FINDING', 'HOST']);
 * // All rows deleted from TEST, FINDING, HOST tables
 *
 * @warning This is a destructive operation. Use with caution!
 */
import { tableExists } from './tableExists.mjs';

export async function clearTables(dbHandle, schema, tables) {
  for (const table of tables) {
    const exists = await tableExists(dbHandle, schema, table);
    if (!exists) continue;
    await dbHandle.query(`DELETE FROM ${schema}.${table}`);
  }
}
