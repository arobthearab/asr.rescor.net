/**
 * tableExists - Check if a table exists in a schema
 *
 * Queries SYSCAT.TABLES to verify table existence (DB2-specific)
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {Promise<boolean>} True if table exists, false otherwise
 *
 * @example
 * const exists = await tableExists(db, 'TCDEV', 'TEST');
 * if (!exists) {
 *   console.log('Table does not exist');
 * }
 */
export async function tableExists(dbHandle, schema, table) {
  const query = `
    SELECT 1
    FROM SYSCAT.TABLES
    WHERE TABSCHEMA = ? AND TABNAME = ? AND TYPE = 'T'
    FETCH FIRST 1 ROW ONLY
  `;
  const rows = await dbHandle.query(query, [schema, table]);
  return rows && rows.length > 0;
}
