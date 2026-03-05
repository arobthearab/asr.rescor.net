// ════════════════════════════════════════════════════════════════════
// Neo4j Database Connection
// ════════════════════════════════════════════════════════════════════
// Wraps Neo4jOperations with per-query session management so
// concurrent HTTP requests never collide on a single session.
// ════════════════════════════════════════════════════════════════════

import neo4j from 'neo4j-driver';
import { Neo4jOperations } from '@rescor/core-db';

// ────────────────────────────────────────────────────────────────────
// SessionPerQueryWrapper — opens a fresh session for every query()
// call, then closes it immediately. The underlying driver manages the
// connection pool so this is cheap.
// ────────────────────────────────────────────────────────────────────

class SessionPerQueryWrapper {
  constructor(operations) {
    this._operations = operations;
    this._driver = operations.driver;
    this._database = operations.database;
  }

  /** True when the underlying driver is live */
  get isConnected() {
    return this._operations.isConnected;
  }

  /**
   * Execute a Cypher query in its own session.
   * Delegates record→row conversion to the underlying operations instance.
   */
  async query(cypher, params = {}) {
    const session = this._driver.session({
      database: this._database,
      defaultAccessMode: neo4j.session.WRITE,
    });

    try {
      const result = await session.run(cypher, params);
      return this._operations._recordsToRows(result.records);
    } finally {
      await session.close();
    }
  }

  /** Delegate transaction to a dedicated session as well */
  async transaction(callback) {
    const session = this._driver.session({
      database: this._database,
      defaultAccessMode: neo4j.session.WRITE,
    });

    const transaction = session.beginTransaction();
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  async disconnect() {
    return this._operations.disconnect();
  }
}

// ────────────────────────────────────────────────────────────────────
// createDatabase — connect to Neo4j via core-db, return safe wrapper
// ────────────────────────────────────────────────────────────────────

export async function createDatabase() {
  const operations = new Neo4jOperations({
    schema: process.env.NEO4J_DATABASE || 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: null,    // Resolved from Infisical or NEO4J_PASSWORD env
  });

  await operations.connect();
  console.log('Connected to Neo4j (asr database)');

  return new SessionPerQueryWrapper(operations);
}
