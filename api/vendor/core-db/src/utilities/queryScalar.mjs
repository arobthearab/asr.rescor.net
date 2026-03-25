/**
 * queryScalar - Execute a query and return the first column of the first row
 *
 * Useful for queries that return a single value (COUNT, MAX, MIN, etc.)
 *
 * @param {Object} dbHandle - Database handle (must have query() method)
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters (default: [])
 * @returns {Promise<any>} First column value of first row, or null if no results
 *
 * @example
 * const count = await queryScalar(db, 'SELECT COUNT(*) FROM TEST');
 * const maxId = await queryScalar(db, 'SELECT MAX(ID) FROM TEST WHERE TYPE = ?', ['SECURITY']);
 */
export async function queryScalar(dbHandle, query, params = []) {
  const rows = await dbHandle.query(query, params);
  if (!rows || rows.length === 0) return null;
  const first = rows[0];
  return first[Object.keys(first)[0]];
}
