/**
 * getTablesWithColumn - Find all tables in a schema that contain a specific column
 *
 * Queries SYSCAT.COLUMNS and SYSCAT.TABLES to discover tables with foreign key columns (DB2-specific)
 * Useful for auto-discovering related tables (e.g., all tables with TEST_ID column)
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} schema - Schema name
 * @param {string} column - Column name to search for
 * @returns {Promise<string[]>} Array of table names containing the column
 *
 * @example
 * const testTables = await getTablesWithColumn(db, 'TC', 'TEST_ID');
 * // Returns: ['FINDING', 'HOST', 'ANNOTATION', ...]
 */
export async function getTablesWithColumn(dbHandle, schema, column) {
  const query = `
    SELECT DISTINCT c.TABNAME
    FROM SYSCAT.COLUMNS c
    INNER JOIN SYSCAT.TABLES t
      ON t.TABSCHEMA = c.TABSCHEMA
     AND t.TABNAME = c.TABNAME
    WHERE c.TABSCHEMA = ?
      AND c.COLNAME = ?
      AND t.TYPE = 'T'
  `;

  const rows = await dbHandle.query(query, [schema, column]);
  return (rows || [])
    .map(row => row.TABNAME)
    .filter(name => !/_\d{8}$/.test(name)); // Filter out backup tables with timestamp suffix
}
