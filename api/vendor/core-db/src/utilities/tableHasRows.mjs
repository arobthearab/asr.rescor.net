/**
 * tableHasRows - Check if a table contains any rows
 *
 * Executes a simple SELECT 1 query with FETCH FIRST 1 ROW ONLY
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {Promise<boolean>} True if table has at least one row, false if empty
 *
 * @example
 * const hasData = await tableHasRows(db, 'TCDEV', 'TEST');
 * if (!hasData) {
 *   console.log('Table is empty');
 * }
 */
export async function tableHasRows(dbHandle, schema, table) {
  const query = `SELECT 1 FROM ${schema}.${table} FETCH FIRST 1 ROW ONLY`;
  const rows = await dbHandle.query(query);
  return rows && rows.length > 0;
}
