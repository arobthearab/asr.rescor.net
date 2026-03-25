/**
 * DB2Operations - IBM DB2-specific database operations
 *
 * Extends base Operations class with IBM DB2 functionality:
 * - Connection management via ibm_db
 * - Connection string building
 * - Credential management integration
 * - DB2-specific validation
 * - Transaction support
 */

import { Operations, ConnectionError, QueryError } from './Operations.mjs';

/**
 * IBM DB2 operations implementation
 *
 * @example
 * // Individual connection (each instance creates own connection)
 * import { DB2Operations } from '@rescor-llc/core-db';
 * import { DatabaseTemplate } from '@rescor-llc/core-config';
 *
 * const template = new LocalDatabaseTemplate();
 * await template.apply(config);
 * const dbConfig = await template.schema.load(config);
 *
 * const operations = new DB2Operations({
 *   schema: 'TCDEV',
 *   connectionString: dbConfig.connectionString
 * });
 *
 * await operations.connect();
 * const results = await operations.query('SELECT * FROM TCDEV.TEST');
 *
 * @example
 * // Shared connection pool (multiple instances share one connection)
 * import { DB2Operations } from '@rescor-llc/core-db';
 *
 * // Create shared pool once
 * const pool = await DB2Operations.createPool({ config });
 *
 * // All operations share the pool
 * const ticketOps = new TicketOperations({ config, sharedPool: pool });
 * const authOps = new AuthorizationOperations({ config, sharedPool: pool });
 *
 * await ticketOps.connect();  // Uses shared pool
 * await authOps.connect();    // Uses same shared pool
 *
 * // Only disconnect pool once when all operations are done
 * await DB2Operations.disconnectPool(pool);
 */
export class DB2Operations extends Operations {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.schema - Database schema (e.g., 'TCDEV', 'TC')
   * @param {string} options.connectionString - DB2 connection string
   * @param {Object} options.config - Configuration instance (for credential loading)
   * @param {Object} options.transforms - Transform configuration
   * @param {Object} options.auditConfig - Audit configuration
   * @param {Object} options.recorder - Recorder instance
   * @param {Object} options.sharedPool - Shared connection pool (from createPool)
   */
  constructor(options = {}) {
    super(options);

    this.connectionString = options.connectionString || null;
    this.config = options.config || null;
    this.ibmdb = null; // Loaded lazily
    this.sharedPool = options.sharedPool || null;
    this._usingSharedPool = !!options.sharedPool;

    // Generate unique operation ID for pool reference tracking
    this._operationId = `${this.schema || 'db'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a shared connection pool
   *
   * Use this when multiple Operations instances need to share one database connection.
   * This is more efficient than creating separate connections per instance.
   *
   * @param {Object} options - Pool configuration
   * @param {Object} options.config - Configuration instance
   * @param {string} options.connectionString - Connection string (optional)
   * @param {Object} options.recorder - Recorder instance (optional)
   * @returns {Promise<Object>} Pool object with connection handle
   *
   * @example
   * const pool = await DB2Operations.createPool({ config });
   *
   * const ticketOps = new TicketOperations({ config, sharedPool: pool });
   * const authOps = new AuthorizationOperations({ config, sharedPool: pool });
   *
   * await ticketOps.connect();
   * await authOps.connect();
   *
   * // Later, disconnect pool once
   * await DB2Operations.disconnectPool(pool);
   */
  static async createPool(options = {}) {
    const { config, connectionString, recorder } = options;

    // Lazy load ibm_db first
    const ibmdb = await import('ibm_db');

    // Build connection string
    let connStr;
    if (connectionString) {
      // Use provided connection string directly
      connStr = connectionString;
    } else if (config) {
      // Try to load from configuration using ClassifiedDatum
      try {
        const { ClassifiedDatum } = await import('@rescor-llc/core-config');

        const hostname = await config.get(ClassifiedDatum.setting('database', 'hostname'));
        const port = await config.get(ClassifiedDatum.setting('database', 'port'));
        const database = await config.get(ClassifiedDatum.setting('database', 'database'));
        const user = await config.get(ClassifiedDatum.credential('database', 'user'));
        const password = await config.get(ClassifiedDatum.credential('database', 'password'));

        let protocol;
        try {
          protocol = await config.get(ClassifiedDatum.setting('database', 'protocol'));
        } catch {
          protocol = 'TCPIP';
        }

        connStr = `DATABASE=${database};HOSTNAME=${hostname};PORT=${port};PROTOCOL=${protocol};UID=${user};PWD=${password}`;
      } catch (err) {
        // Fall back to environment variables
        const hostname = process.env.DB2_HOSTNAME || 'localhost';
        const port = process.env.DB2_PORT || '50000';
        const database = process.env.DB2_DATABASE;
        const user = process.env.DB2_USER;
        const password = process.env.DB2_PASSWORD;
        const protocol = process.env.DB2_PROTOCOL || 'TCPIP';

        if (!database || !user || !password) {
          throw new ConnectionError(
            'DB2 connection parameters not found in config or environment. ' +
            'Set DB2_DATABASE, DB2_USER, DB2_PASSWORD or configure Infisical.'
          );
        }

        connStr = `DATABASE=${database};HOSTNAME=${hostname};PORT=${port};PROTOCOL=${protocol};UID=${user};PWD=${password}`;
      }
    } else {
      throw new ConnectionError('No connection string or config provided for pool');
    }

    // Log pool creation
    if (recorder) {
      // Mask credentials for logging
      const masked = connStr
        .replace(/UID=([^;]+)/i, 'UID=***')
        .replace(/PWD=([^;]+)/i, 'PWD=***')
        .replace(/USER=([^;]+)/i, 'USER=***')
        .replace(/PASSWORD=([^;]+)/i, 'PASSWORD=***');

      recorder.emit(8520, 'i', 'Creating shared DB2 connection pool', {
        masked
      });
    }

    // Open connection
    const handle = await ibmdb.open(connStr);

    // Log success
    if (recorder) {
      recorder.emit(8521, 'i', 'Shared DB2 connection pool created');
    }

    // Create pool object with reference tracking
    const pool = {
      handle,
      ibmdb,
      connectionString: connStr,
      createdAt: new Date(),
      _isPool: true,
      _references: new Set(),
      _recorder: recorder,

      /**
       * Acquire a reference to this pool
       * Used internally by DB2Operations.connect()
       * @param {string} operationId - Unique identifier for the operation acquiring this
       * @returns {Object} The pool handle
       */
      acquire(operationId) {
        this._references.add(operationId);
        if (this._recorder) {
          this._recorder.emit(8526, 'd', 'Pool reference acquired', {
            operationId,
            activeReferences: this._references.size
          });
        }
        return this.handle;
      },

      /**
       * Release a reference to this pool
       * Used by DB2Operations.releaseConnection()
       * @param {string} operationId - Unique identifier for the operation releasing this
       */
      release(operationId) {
        const removed = this._references.delete(operationId);
        if (removed && this._recorder) {
          this._recorder.emit(8527, 'd', 'Pool reference released', {
            operationId,
            activeReferences: this._references.size
          });
        }
      },

      /**
       * Get current pool statistics
       * @returns {Object} Pool stats
       */
      getStats() {
        return {
          activeReferences: this._references.size,
          createdAt: this.createdAt,
          age: Date.now() - this.createdAt.getTime()
        };
      }
    };

    return pool;
  }

  /**
   * Disconnect a shared connection pool
   *
   * Call this ONCE when all Operations instances using the pool are done.
   * Do NOT call disconnect() on individual Operations instances when using a shared pool.
   *
   * @param {Object} pool - Pool from createPool()
   * @param {Object} recorder - Recorder instance (optional)
   * @returns {Promise<void>}
   *
   * @example
   * const pool = await DB2Operations.createPool({ config });
   * // ... use pool with multiple Operations instances ...
   * await DB2Operations.disconnectPool(pool);
   */
  static async disconnectPool(pool, recorder = null) {
    if (!pool || !pool._isPool) {
      throw new Error('Invalid pool object');
    }

    // Warn if there are active references
    const stats = pool.getStats();
    if (stats.activeReferences > 0) {
      const warning = `Closing pool with ${stats.activeReferences} active reference(s). ` +
                     `Call releaseConnection() on all Operations instances first.`;

      if (recorder || pool._recorder) {
        (recorder || pool._recorder).emit(8530, 'w', warning, {
          activeReferences: stats.activeReferences
        });
      } else {
        console.warn(warning);
      }
    }

    try {
      if (pool.handle && pool.handle.close) {
        await pool.handle.close();
      }

      if (recorder || pool._recorder) {
        (recorder || pool._recorder).emit(8522, 'i', 'Shared DB2 connection pool closed', {
          lifespan: stats.age,
          totalReferences: pool._references.size
        });
      }
    } catch (err) {
      if (recorder || pool._recorder) {
        (recorder || pool._recorder).emit(8523, 'w', 'Error closing shared DB2 connection pool', {
          error: err.message
        });
      }
    }
  }

  /**
   * Connect to IBM DB2 database
   *
   * If a shared pool was provided in constructor, uses the shared connection.
   * Otherwise, creates a new dedicated connection.
   *
   * @returns {Promise<void>}
   * @throws {ConnectionError} If connection fails
   */
  async connect() {
    if (this._connected && this.handle) {
      return; // Already connected
    }

    // If using shared pool, acquire reference
    if (this._usingSharedPool && this.sharedPool) {
      this.handle = this.sharedPool.acquire(this._operationId);
      this.ibmdb = this.sharedPool.ibmdb;
      this._connected = true;

      if (this.recorder) {
        this.recorder.emit(8524, 'i', 'Using shared DB2 connection pool', {
          schema: this.schema,
          operationId: this._operationId,
          activeReferences: this.sharedPool.getStats().activeReferences
        });
      }

      return;
    }

    // Otherwise, create dedicated connection
    try {
      // Lazy load ibm_db (only when needed)
      if (!this.ibmdb) {
        this.ibmdb = await import('ibm_db');
      }

      // Get connection string
      const connStr = await this._getConnectionString();

      if (!connStr) {
        throw new ConnectionError('No connection string provided');
      }

      // Log connection attempt (without credentials)
      if (this.recorder) {
        this.recorder.emit(8501, 'i', 'Connecting to database', {
          schema: this.schema,
          masked: this._maskConnectionString(connStr)
        });
      }

      // Open connection
      this.handle = await this.ibmdb.open(connStr);
      this._connected = true;

      // Log success
      if (this.recorder) {
        this.recorder.emit(8502, 'i', 'Database connection established', {
          schema: this.schema
        });
      }
    } catch (err) {
      this._connected = false;
      this.handle = null;

      const error = new ConnectionError(
        `Failed to connect to database: ${err.message}`,
        err.code || err.sqlcode,
        err
      );

      if (this.recorder) {
        this.recorder.emit(8503, 'e', 'Database connection failed', {
          schema: this.schema,
          error: error.message,
          code: error.code
        });
      }

      throw error;
    }
  }

  /**
   * Disconnect from database
   *
   * If using a shared pool, this only marks the instance as disconnected.
   * The actual connection remains open for other instances using the pool.
   * Use DB2Operations.disconnectPool() to close the shared pool.
   *
   * If using a dedicated connection, closes the connection immediately.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this._connected || !this.handle) {
      return;
    }

    // If using shared pool, release reference
    if (this._usingSharedPool && this.sharedPool) {
      this.sharedPool.release(this._operationId);

      if (this.recorder) {
        this.recorder.emit(8525, 'i', 'Releasing shared DB2 connection pool reference', {
          schema: this.schema,
          operationId: this._operationId,
          activeReferences: this.sharedPool.getStats().activeReferences
        });
      }

      this._connected = false;
      this.handle = null; // Clear reference but don't close
      return;
    }

    // Otherwise, close dedicated connection
    try {
      if (this.handle.close) {
        await this.handle.close();
      }

      if (this.recorder) {
        this.recorder.emit(8504, 'i', 'Database connection closed', {
          schema: this.schema
        });
      }
    } catch (err) {
      if (this.recorder) {
        this.recorder.emit(8505, 'w', 'Error closing database connection', {
          error: err.message
        });
      }
    } finally {
      this._connected = false;
      this.handle = null;
    }
  }

  /**
   * Execute a SQL query
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} - Query results
   * @throws {QueryError} If query fails
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new QueryError('Not connected to database');
    }

    const startTime = Date.now();

    try {
      // Execute query
      const results = await this.handle.query(sql, params);
      const duration = Date.now() - startTime;

      // Log query
      this._logQuery(sql, params, duration, 'success');

      return results;
    } catch (err) {
      const duration = Date.now() - startTime;

      // Log error
      this._logQuery(sql, params, duration, 'error');

      throw new QueryError(
        `Query failed: ${err.message}`,
        err.code || err.sqlcode,
        err
      );
    }
  }

  /**
   * Execute a prepared statement
   *
   * @param {string} sql - SQL with placeholders
   * @param {Array} params - Parameters
   * @returns {Promise<Array>} - Results
   */
  async prepare(sql, params = []) {
    if (!this.isConnected) {
      throw new QueryError('Not connected to database');
    }

    try {
      const stmt = await this.handle.prepare(sql);
      const results = await stmt.execute(params);
      return results;
    } catch (err) {
      throw new QueryError(
        `Prepared statement failed: ${err.message}`,
        err.code || err.sqlcode,
        err
      );
    }
  }

  /**
   * Begin transaction
   *
   * @returns {Promise<void>}
   */
  async beginTransaction() {
    if (!this.isConnected) {
      throw new QueryError('Not connected to database');
    }

    try {
      await this.handle.beginTransaction();

      if (this.recorder) {
        this.recorder.emit(8510, 'i', 'Transaction started', {
          schema: this.schema
        });
      }
    } catch (err) {
      throw new QueryError(
        `Failed to begin transaction: ${err.message}`,
        err.code || err.sqlcode,
        err
      );
    }
  }

  /**
   * Commit transaction
   *
   * @returns {Promise<void>}
   */
  async commit() {
    if (!this.isConnected) {
      throw new QueryError('Not connected to database');
    }

    try {
      await this.handle.commitTransaction();

      if (this.recorder) {
        this.recorder.emit(8511, 'i', 'Transaction committed', {
          schema: this.schema
        });
      }
    } catch (err) {
      throw new QueryError(
        `Failed to commit transaction: ${err.message}`,
        err.code || err.sqlcode,
        err
      );
    }
  }

  /**
   * Rollback transaction
   *
   * @returns {Promise<void>}
   */
  async rollback() {
    if (!this.isConnected) {
      throw new QueryError('Not connected to database');
    }

    try {
      await this.handle.rollbackTransaction();

      if (this.recorder) {
        this.recorder.emit(8512, 'w', 'Transaction rolled back', {
          schema: this.schema
        });
      }
    } catch (err) {
      throw new QueryError(
        `Failed to rollback transaction: ${err.message}`,
        err.code || err.sqlcode,
        err
      );
    }
  }

  /**
   * Execute query within a transaction
   *
   * @param {Function} callback - Async function with queries
   * @returns {Promise<*>} - Result from callback
   *
   * @example
   * const result = await operations.transaction(async () => {
   *   await operations.query('INSERT INTO ...');
   *   await operations.query('UPDATE ...');
   *   return { success: true };
   * });
   */
  async transaction(callback) {
    await this.beginTransaction();

    try {
      const result = await callback();
      await this.commit();
      return result;
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  /**
   * Release connection back to pool without closing
   *
   * Only works with pooled connections. For dedicated connections, this is a no-op.
   * After releasing, the connection is available for other operations to use.
   * Call reconnect() to reacquire a connection from the pool.
   *
   * Use case: Long-running operations that don't need continuous DB access
   *
   * @returns {Promise<void>}
   *
   * @example
   * // Long-running background job
   * const ops = new TicketOperations({ config, pool });
   *
   * while (running) {
   *   await ops.reconnect();                    // Get connection
   *   const batch = await ops.query('...');     // Use it
   *   await ops.releaseConnection();            // Return to pool
   *
   *   // Do expensive non-DB work without holding connection
   *   await processData(batch);
   *   await sleep(1000);
   * }
   */
  async releaseConnection() {
    if (!this._usingSharedPool || !this.sharedPool) {
      // No-op for dedicated connections
      return;
    }

    if (!this._connected || !this.handle) {
      // Already released
      return;
    }

    // Release reference to pool
    this.sharedPool.release(this._operationId);

    if (this.recorder) {
      this.recorder.emit(8528, 'i', 'Released connection back to pool', {
        schema: this.schema,
        operationId: this._operationId,
        activeReferences: this.sharedPool.getStats().activeReferences
      });
    }

    this._connected = false;
    this.handle = null;
  }

  /**
   * Reacquire connection from pool
   *
   * Only works with pooled connections. For dedicated connections, calls connect().
   * Use after releaseConnection() to get the connection back.
   *
   * @returns {Promise<void>}
   *
   * @example
   * await ops.releaseConnection();  // Release to pool
   * // ... do non-DB work ...
   * await ops.reconnect();          // Reacquire from pool
   * const results = await ops.query('...');
   */
  async reconnect() {
    if (!this._usingSharedPool || !this.sharedPool) {
      // For dedicated connections, just call connect()
      return this.connect();
    }

    if (this._connected && this.handle) {
      // Already connected
      return;
    }

    // Acquire reference from pool
    this.handle = this.sharedPool.acquire(this._operationId);
    this.ibmdb = this.sharedPool.ibmdb;
    this._connected = true;

    if (this.recorder) {
      this.recorder.emit(8529, 'i', 'Reacquired connection from pool', {
        schema: this.schema,
        operationId: this._operationId,
        activeReferences: this.sharedPool.getStats().activeReferences
      });
    }
  }

  /**
   * Validate DB2 identifier (table name, column name, etc.)
   *
   * DB2 rules:
   * - 1-128 characters
   * - Start with A-Z or underscore
   * - Contain only A-Z, 0-9, underscore
   * - Case-insensitive but preserves case
   *
   * @param {string} identifier - Identifier to validate
   * @returns {boolean} - True if valid
   * @throws {Error} If invalid
   */
  static validateDB2Identifier(identifier) {
    return Operations.validateIdentifier(identifier, 128);
  }

  /**
   * Get connection string with Infisical-first strategy
   *
   * Priority (NEW):
   * 1. Infisical (via Configuration + DatabaseSchema) - PRIMARY
   * 2. Constructor parameter (connectionString) - OVERRIDE
   * 3. Environment variables - FALLBACK
   *
   * Event codes:
   * - 8506: Connection string loaded from Infisical
   * - 8507: Infisical unavailable, using fallback
   * - 8508: Using constructor connection string
   * - 8509: Using environment connection string
   *
   * @returns {Promise<string>} - Connection string
   * @private
   */
  async _getConnectionString() {
    let source = 'unknown';

    // Tier 1: Infisical (via Configuration + DatabaseSchema) - PRIMARY
    if (this.useInfisicalFirst) {
      try {
        const config = await this._getConfig();
        const { DatabaseSchema } = await import('@rescor-llc/core-config');
        const schema = new DatabaseSchema({ domain: 'database' });
        const dbConfig = await schema.load(config);

        if (dbConfig && dbConfig.connectionString) {
          source = 'infisical';

          if (this.recorder) {
            this.recorder.emit(8506, 'i', 'Loaded DB2 connection string from Infisical', {
              hostname: dbConfig.hostname,
              database: dbConfig.database
            });
          }

          return dbConfig.connectionString;
        }
      } catch (err) {
        // Infisical unavailable - log warning and continue to fallbacks
        if (this.recorder) {
          this.recorder.emit(8507, 'w', 'Infisical unavailable, using fallback connection string', {
            error: err.message
          });
        }
      }
    }

    // Tier 2: Constructor parameter - OVERRIDE
    if (this.connectionString) {
      source = 'constructor';

      if (this.recorder) {
        this.recorder.emit(8508, 'i', 'Using DB2 connection string from constructor');
      }

      return this.connectionString;
    }

    // Tier 3: Environment variables - FALLBACK
    const hostname = process.env.DB2_HOSTNAME || 'localhost';
    const port = process.env.DB2_PORT || '50000';
    const database = process.env.DB2_DATABASE;
    const protocol = process.env.DB2_PROTOCOL || 'TCPIP';
    const user = process.env.DB2_USER;
    const password = process.env.DB2_PASSWORD;

    if (!database || !user || !password) {
      throw new Error(
        'DB2 connection parameters not found. Checked: Infisical, constructor, environment variables. ' +
        'Set DB2_DATABASE, DB2_USER, DB2_PASSWORD or configure Infisical.'
      );
    }

    source = 'environment';

    if (this.recorder) {
      this.recorder.emit(8509, 'i', 'Using DB2 connection string from environment', {
        hostname,
        database,
        user: this._maskUsername(user)
      });
    }

    return `DATABASE=${database};HOSTNAME=${hostname};PORT=${port};PROTOCOL=${protocol};UID=${user};PWD=${password}`;
  }

  /**
   * Mask username for logging (show first 2 chars)
   *
   * @param {string} username
   * @returns {string}
   * @private
   */
  _maskUsername(username) {
    if (!username || username.length < 3) return '***';
    return username.substring(0, 2) + '***';
  }

  /**
   * Mask connection string for logging
   *
   * @param {string} connStr - Connection string
   * @returns {string} - Masked connection string
   * @private
   */
  _maskConnectionString(connStr) {
    return connStr
      .replace(/UID=([^;]+)/i, 'UID=***')
      .replace(/PWD=([^;]+)/i, 'PWD=***')
      .replace(/USER=([^;]+)/i, 'USER=***')
      .replace(/PASSWORD=([^;]+)/i, 'PASSWORD=***');
  }

  /**
   * Bulk insert rows using NEXT VALUE FOR for the ID column, returning generated IDs.
   *
   * Mirrors the fullChunks + remainder chunking pattern of insertMany().
   * Each chunk executes one statement:
   *
   *   SELECT ID FROM FINAL TABLE (
   *     INSERT INTO {table} (ID, col1, col2, ...)
   *     VALUES (NEXT VALUE FOR {seq}, ?, ?),
   *            (NEXT VALUE FOR {seq}, ?, ?), ...
   *   )
   *
   * NEXT VALUE FOR is evaluated once per VALUES row — each row gets a unique ID.
   * FINAL TABLE returns all inserted rows (IDs included) in a single round-trip.
   *
   * DB2-specific — uses DB2 sequence and FINAL TABLE syntax.
   *
   * @param {string}      table        - Table name (unqualified or 'SCHEMA.TABLE')
   * @param {string}      sequenceName - Fully-qualified sequence (e.g. 'TCDEV.FINDING_SEQUENCE')
   * @param {string[]}    columns      - Non-ID column names in value-array order
   * @param {unknown[][]} rows         - Value arrays, one per row (without ID column)
   * @param {number}      chunkSize    - Rows per INSERT statement (default 500)
   * @returns {Promise<{rowsInserted: number, ids: number[]}>}
   */
  async insertManyWithSequence(table, sequenceName, columns, rows, chunkSize = 500) {
    this.checkConnection();

    if (!columns || columns.length === 0) {
      throw new Error('insertManyWithSequence: columns array must not be empty');
    }
    if (chunkSize < 1) {
      throw new Error('insertManyWithSequence: chunkSize must be at least 1');
    }

    let qualifiedTable;
    if (table.includes('.')) {
      Operations.validateIdentifier(table);
      qualifiedTable = table;
    } else {
      Operations.validateIdentifier(table);
      qualifiedTable = this.qualifyTable(table);
    }

    Operations.validateIdentifier(sequenceName);

    for (const column of columns) {
      Operations.validateIdentifier(column);
    }

    if (!rows || rows.length === 0) {
      return { rowsInserted: 0, ids: [] };
    }

    const columnList     = columns.join(', ');
    const columnCount    = columns.length;
    const rowPlaceholder = `(NEXT VALUE FOR ${sequenceName}, ${Array(columnCount).fill('?').join(', ')})`;
    const fullChunks     = Math.floor(rows.length / chunkSize);
    const remainder      = rows.length % chunkSize;
    let rowsInserted     = 0;
    const ids            = [];

    if (fullChunks > 0) {
      const chunkValueList = Array(chunkSize).fill(rowPlaceholder).join(', ');
      const chunkSql = `SELECT ID FROM FINAL TABLE (INSERT INTO ${qualifiedTable} (ID, ${columnList}) VALUES ${chunkValueList})`;

      for (let chunk = 0; chunk < fullChunks; chunk++) {
        const flatParams  = rows.slice(chunk * chunkSize, (chunk + 1) * chunkSize).flat();
        const chunkResult = await this.query(chunkSql, flatParams);
        for (const row of (chunkResult ?? [])) {
          ids.push(Number(row?.ID ?? row?.id));
        }
        rowsInserted += chunkSize;
      }
    }

    if (remainder > 0) {
      const remainderValueList = Array(remainder).fill(rowPlaceholder).join(', ');
      const remainderSql = `SELECT ID FROM FINAL TABLE (INSERT INTO ${qualifiedTable} (ID, ${columnList}) VALUES ${remainderValueList})`;
      const flatParams      = rows.slice(fullChunks * chunkSize).flat();
      const remainderResult = await this.query(remainderSql, flatParams);
      for (const row of (remainderResult ?? [])) {
        ids.push(Number(row?.ID ?? row?.id));
      }
      rowsInserted += remainder;
    }

    return { rowsInserted, ids };
  }
}
