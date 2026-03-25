/**
 * BatchInserter — streaming accumulator for bulk DB inserts
 *
 * Accumulates rows fed one at a time and flushes them to the database in
 * chunked multi-row INSERT statements via Operations.insertMany(). Designed
 * for ETL loops and generator pipelines where materializing all rows into
 * memory upfront is impractical.
 *
 * When `sequenceName` is provided, flushes via `insertManyWithSequence()` instead
 * of `insertMany()`. This uses `NEXT VALUE FOR` for the ID column and wraps the
 * INSERT in `FINAL TABLE`, returning generated IDs in row order. The `ids` array
 * is then included in the `onAfterFlush` payload, enabling callers to map inserted
 * rows to their DB-assigned IDs without a separate lookup query.
 *
 * @example
 * // Without sequence — ID must come from IDENTITY or DEFAULT
 * const batcher = new BatchInserter(operations, 'FINDING', columns, { chunkSize: 500 });
 *
 * @example
 * // With sequence — IDs returned from FINAL TABLE, no post-insert SELECT needed
 * const batcher = new BatchInserter(operations, 'FINDING', columns, {
 *   chunkSize: 500,
 *   sequenceName: 'TCDEV.FINDING_SEQUENCE',
 *   onAfterFlush: async ({ chunk, rowsInserted, ids }) => {
 *     // ids[i] is the DB-assigned ID for chunk[i]
 *   }
 * });
 */
export class BatchInserter {
  /**
   * @param {import('./Operations.mjs').Operations} operations - Connected operations instance
   * @param {string}   table     - Table name (unqualified or 'SCHEMA.TABLE')
   * @param {string[]} columns   - Column names in value-array order (must NOT include the ID column)
   * @param {Object}   options
   * @param {number}   [options.chunkSize=500]    - Rows per INSERT flush
   * @param {string}   [options.sequenceName]     - Fully-qualified sequence name (e.g. 'TCDEV.FINDING_SEQUENCE').
   *                                                When set, uses insertManyWithSequence() and passes generated
   *                                                ids[] to onAfterFlush. DB2-specific.
   * @param {Function} [options.onAfterFlush]     - Optional async hook called after each successful flush.
   *                                                Receives { table, columns, chunk, rowsInserted,
   *                                                chunksExecuted, totalRowsInserted, ids }.
   *                                                ids[] is populated only when sequenceName is set.
   */
  constructor(operations, table, columns, options = {}) {
    this._operations     = operations;
    this._table          = table;
    this._columns        = columns;
    this._chunkSize      = options.chunkSize ?? 500;
    this._sequenceName   = options.sequenceName || null;
    this._onAfterFlush   = typeof options.onAfterFlush === 'function' ? options.onAfterFlush : null;
    this._buffer         = [];
    this._rowsInserted   = 0;
    this._chunksExecuted = 0;
  }

  /**
   * Add one row to the batch. Flushes automatically when the chunk threshold
   * is reached.
   *
   * @param {unknown[]} row - Values in column order
   * @returns {Promise<number>} Rows flushed this call (0 unless a chunk fired)
   */
  async add(row) {
    this._buffer.push(row);

    let rowsFlushed = 0;
    if (this._buffer.length >= this._chunkSize) {
      rowsFlushed = await this._flush();
    }

    return rowsFlushed;
  }

  /**
   * Flush any remaining buffered rows and return totals.
   *
   * Must be called after the last `add()` to ensure all rows are inserted.
   *
   * @returns {Promise<{rowsInserted: number, chunksExecuted: number}>}
   */
  async close() {
    while (this._buffer.length > 0) {
      await this._flush();
    }

    return { rowsInserted: this._rowsInserted, chunksExecuted: this._chunksExecuted };
  }

  /**
   * Flush up to chunkSize buffered rows.
   *
   * Uses insertManyWithSequence() when sequenceName is configured (returns ids[]),
   * otherwise falls back to insertMany().
   *
   * @returns {Promise<number>} Rows inserted
   * @private
   */
  async _flush() {
    const chunk = this._buffer.slice(0, this._chunkSize);
    let answer  = 0;

    if (chunk.length === 0) {
      return answer;
    }

    let ids = [];

    if (this._sequenceName) {
      const result = await this._operations.insertManyWithSequence(
        this._table, this._sequenceName, this._columns, chunk, chunk.length
      );
      ids = result.ids;
    } else {
      await this._operations.insertMany(this._table, this._columns, chunk, chunk.length);
    }

    this._buffer.splice(0, chunk.length);
    this._rowsInserted   += chunk.length;
    this._chunksExecuted += 1;

    if (this._onAfterFlush) {
      await this._onAfterFlush({
        table:             this._table,
        columns:           this._columns,
        chunk,
        rowsInserted:      chunk.length,
        chunksExecuted:    this._chunksExecuted,
        totalRowsInserted: this._rowsInserted,
        ids
      });
    }

    answer = chunk.length;

    return answer;
  }
}
