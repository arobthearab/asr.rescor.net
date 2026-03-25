/**
 * getPrimaryKeyColumns - Get primary key columns for a table
 *
 * Queries SYSCAT.KEYCOLUSE and SYSCAT.TABCONST to find primary key columns (DB2-specific)
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {Promise<string[]>} Array of primary key column names, ordered by COLSEQ
 *
 * @example
 * const pkColumns = await getPrimaryKeyColumns(db, 'TCDEV', 'TEST');
 * // Returns: ['ID'] or ['ID', 'VERSION'] etc.
 */
export async function getPrimaryKeyColumns(dbHandle, schema, table) {
  const query = `
    SELECT k.COLNAME
    FROM SYSCAT.KEYCOLUSE k
    INNER JOIN SYSCAT.TABCONST c
      ON c.TABSCHEMA = k.TABSCHEMA
     AND c.TABNAME = k.TABNAME
     AND c.CONSTNAME = k.CONSTNAME
    WHERE k.TABSCHEMA = ?
      AND k.TABNAME = ?
      AND c.TYPE = 'P'
    ORDER BY k.COLSEQ
  `;

  const rows = await dbHandle.query(query, [schema, table]);
  if (!rows || rows.length === 0) return [];
  return rows.map(row => row.COLNAME);
}
