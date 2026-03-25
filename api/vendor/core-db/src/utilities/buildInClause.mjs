/**
 * buildInClause - Build optimized IN clause for large value lists
 *
 * DB2 has parameter limits, so this function chunks large value arrays into
 * multiple IN clauses connected by OR.
 *
 * @param {string} column - Column name for the IN clause
 * @param {Array} values - Array of values to include
 * @param {number} chunkSize - Maximum values per IN clause (default: 500)
 * @returns {Object} Object with { clause, params } properties
 *
 * @example
 * const { clause, params } = buildInClause('ID', [1, 2, 3, ..., 1000], 500);
 * // clause: "(ID IN (?, ?, ...) OR ID IN (?, ?, ...))"
 * // params: [1, 2, 3, ..., 1000]
 *
 * const sql = `SELECT * FROM TEST WHERE ${clause}`;
 * const rows = await db.query(sql, params);
 */
export function buildInClause(column, values, chunkSize = 500) {
  const chunks = [];
  const params = [];

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    chunks.push(`${column} IN (${placeholders})`);
    params.push(...chunk);
  }

  return {
    clause: chunks.length > 1 ? `(${chunks.join(' OR ')})` : chunks[0],
    params
  };
}
