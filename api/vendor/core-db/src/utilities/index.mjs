/**
 * @rescor-llc/core-db/utilities - Database utility functions
 *
 * Collection of reusable database utilities for schema management and data operations.
 * Originally extracted from TestingCenter SchemaBuildout module.
 *
 * Categories:
 * - Query utilities: queryScalar
 * - Table inspection: tableExists, tableHasRows, getPrimaryKeyColumns, getTablesWithColumn
 * - SQL builders: buildInClause
 * - Data operations: copyTableRows, copyStaticTables, clearTables
 * - Statistical: computeSampleSize
 */

export { queryScalar } from './queryScalar.mjs';
export { tableExists } from './tableExists.mjs';
export { tableHasRows } from './tableHasRows.mjs';
export { getPrimaryKeyColumns } from './getPrimaryKeyColumns.mjs';
export { getTablesWithColumn } from './getTablesWithColumn.mjs';
export { buildInClause } from './buildInClause.mjs';
export { copyTableRows } from './copyTableRows.mjs';
export { copyStaticTables } from './copyStaticTables.mjs';
export { clearTables } from './clearTables.mjs';
export { computeSampleSize } from './computeSampleSize.mjs';
