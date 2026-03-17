import { QueryError } from '@rescor-llc/core-db';

export class GraphStoreRepository {
  constructor({ operations, recorder }) {
    this.operations = operations;
    this.recorder = recorder;
    this.driver = operations?.driver || 'sqlite';
  }

  _col(row, ...keys) {
    for (const key of keys) {
      if (row[key] !== undefined) {
        return row[key];
      }
    }

    return undefined;
  }

  async ensureStore() {
    if (this.driver === 'db2') {
      await this.operations.query(`
        CREATE TABLE asr_graph_store (
          id INTEGER NOT NULL PRIMARY KEY,
          payload CLOB(2M) NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          CONSTRAINT chk_asr_graph_store_id CHECK (id = 1)
        )
      `).catch(() => {
        // Table may already exist in DB2; ignore in bootstrap path.
      });
    } else {
      await this.operations.query(`
        CREATE TABLE IF NOT EXISTS asr_graph_store (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    }

    this.recorder?.emit(7401, 'i', 'Ensured graph storage table');
  }

  async getGraphRecord() {
    const rows = await this.operations.query(
      'SELECT payload, updated_at AS updatedAt FROM asr_graph_store WHERE id = ?',
      [1]
    );

    const row = rows?.[0] ?? null;
    if (!row) {
      return null;
    }

    try {
      return {
        graph: JSON.parse(this._col(row, 'payload', 'PAYLOAD')),
        updatedAt: this._col(row, 'updatedat', 'updatedAt', 'UPDATED_AT')
      };
    } catch {
      throw new QueryError('Stored graph payload is not valid JSON');
    }
  }

  async upsertGraph(graph) {
    const updatedAt = new Date().toISOString();

    if (this.driver === 'db2') {
      await this.operations.query(
        `
          MERGE INTO asr_graph_store AS target
          USING (VALUES (?, ?, ?)) AS source (id, payload, updated_at)
          ON target.id = source.id
          WHEN MATCHED THEN UPDATE SET
            payload = source.payload,
            updated_at = source.updated_at
          WHEN NOT MATCHED THEN INSERT (id, payload, updated_at)
          VALUES (source.id, source.payload, source.updated_at)
        `,
        [1, JSON.stringify(graph), updatedAt]
      );
    } else {
      await this.operations.query(
        `
          INSERT INTO asr_graph_store (id, payload, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        `,
        [1, JSON.stringify(graph), updatedAt]
      );
    }

    this.recorder?.emit(7402, 'i', 'Persisted graph payload', { updatedAt });
    return { updatedAt };
  }
}
