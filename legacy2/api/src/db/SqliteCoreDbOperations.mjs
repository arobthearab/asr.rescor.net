import Database from 'better-sqlite3';
import { Operations, QueryError } from '@rescor-llc/core-db';

export class SqliteCoreDbOperations extends Operations {
  constructor(options = {}) {
    super({
      schema: options.schema || 'ASR',
      recorder: options.recorder
    });

    this.databasePath = options.databasePath || './asr.db';
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    this.handle = new Database(this.databasePath);
    this._connected = true;
  }

  async disconnect() {
    if (!this.handle) {
      return;
    }

    this.handle.close();
    this.handle = null;
    this._connected = false;
  }

  async query(sql, params = []) {
    this.checkConnection();
    const startedAt = Date.now();

    try {
      const statement = this.handle.prepare(sql);
      const trimmed = sql.trim().toUpperCase();
      let result;

      if (trimmed.startsWith('SELECT')) {
        const rows = statement.all(params);
        result = Operations.MassageResults(rows, this.transforms);
      } else if (
        trimmed.startsWith('INSERT') ||
        trimmed.startsWith('UPDATE') ||
        trimmed.startsWith('DELETE') ||
        trimmed.startsWith('REPLACE')
      ) {
        const runResult = statement.run(params);
        result = [{
          changes: runResult.changes,
          lastInsertRowid: runResult.lastInsertRowid
        }];
      } else {
        this.handle.exec(sql);
        result = [];
      }

      this._logQuery(sql, params, Date.now() - startedAt, 'success');
      return result;
    } catch (error) {
      this._logQuery(sql, params, Date.now() - startedAt, 'error');
      throw new QueryError(`SQLite query failed: ${error.message}`);
    }
  }

  async transaction(callback) {
    this.checkConnection();

    this.handle.exec('BEGIN');
    try {
      const result = await callback(this);
      this.handle.exec('COMMIT');
      return result;
    } catch (error) {
      this.handle.exec('ROLLBACK');
      throw error;
    }
  }
}
