/**
 * Neo4jOperations - Neo4j graph database operations
 *
 * Extends base Operations class with Neo4j functionality:
 * - Connection management via neo4j-driver
 * - Cypher query execution
 * - Transaction support
 * - Record-to-row normalization
 * - Neo4j type conversions
 */

import neo4j from 'neo4j-driver';
import { Operations, ConnectionError, QueryError } from './Operations.mjs';

/**
 * Neo4j graph database operations implementation
 *
 * @example
 * import { Neo4jOperations } from '@rescor-llc/core-db';
 *
 * const operations = new Neo4jOperations({
 *   schema: 'tcdev',  // Database name in Neo4j
 *   uri: 'bolt://localhost:7687',
 *   username: 'neo4j',
 *   password: 'password'
 * });
 *
 * await operations.connect();
 * const results = await operations.query(
 *   'MATCH (h:Host {address: $address}) RETURN h',
 *   { address: '192.168.1.1' }
 * );
 */
export class Neo4jOperations extends Operations {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.schema - Database name (e.g., 'tcdev', 'tc', 'spmdev')
   * @param {string} options.uri - Neo4j connection URI (bolt://, neo4j://, neo4j+s://)
   * @param {string} options.username - Database username
   * @param {string} options.password - Database password
   * @param {Object} options.config - Configuration instance (for credential loading)
   * @param {Object} options.transforms - Transform configuration
   * @param {Object} options.auditConfig - Audit configuration
   * @param {Object} options.recorder - Recorder instance
   * @param {Object} options.driverConfig - Additional neo4j driver configuration
   */
  constructor(options = {}) {
    super(options);

    this.uri = options.uri || 'bolt://localhost:7687';
    this.username = options.username || 'neo4j';
    this.password = options.password || null;
    this.config = options.config || null;
    this.driverConfig = options.driverConfig || {};

    // Neo4j-specific properties
    this.driver = null;      // Driver instance (connection pool)
    this.session = null;     // Active session
    this.database = this.schema || 'neo4j';  // Database name (schema maps to database)
  }

  /**
   * Connect to Neo4j database
   *
   * Creates driver and opens session to specified database.
   * Uses multi-database feature for schema isolation (tcdev, tc, spmdev).
   *
   * @returns {Promise<void>}
   * @throws {ConnectionError} If connection fails
   */
  async connect() {
    if (this._connected && this.driver && this.session) {
      return; // Already connected
    }

    try {
      // Get credentials (from constructor or config)
      const credentials = await this._getCredentials();

      if (!credentials.password) {
        throw new ConnectionError('No password provided for Neo4j connection');
      }

      // Log connection attempt (without credentials)
      if (this.recorder) {
        this.recorder.emit(8501, 'i', 'Connecting to Neo4j', {
          uri: this._maskUri(this.uri),
          database: this.database
        });
      }

      // Create driver (connection pool)
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(credentials.username, credentials.password),
        {
          disableLosslessIntegers: true,  // Return JS numbers instead of Integer objects
          ...this.driverConfig
        }
      );

      // Verify connectivity
      await this.driver.getServerInfo();

      // Open session to specified database
      this.session = this.driver.session({
        database: this.database,
        defaultAccessMode: neo4j.session.WRITE
      });

      this._connected = true;
      this.handle = this.session;  // For compatibility with base class

      // Log success
      if (this.recorder) {
        this.recorder.emit(8502, 'i', 'Neo4j connection established', {
          database: this.database
        });
      }
    } catch (err) {
      this._connected = false;
      this.driver = null;
      this.session = null;
      this.handle = null;

      const error = new ConnectionError(
        `Failed to connect to Neo4j: ${err.message}`,
        err.code,
        err
      );

      if (this.recorder) {
        this.recorder.emit(8503, 'e', 'Neo4j connection failed', {
          database: this.database,
          error: error.message,
          code: error.code
        });
      }

      throw error;
    }
  }

  /**
   * Disconnect from Neo4j database
   *
   * Closes session and driver.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this._connected) {
      return;
    }

    try {
      // Close session
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      // Close driver
      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }

      if (this.recorder) {
        this.recorder.emit(8504, 'i', 'Neo4j connection closed', {
          database: this.database
        });
      }
    } catch (err) {
      if (this.recorder) {
        this.recorder.emit(8505, 'w', 'Error closing Neo4j connection', {
          error: err.message
        });
      }
    } finally {
      this._connected = false;
      this.handle = null;
    }
  }

  /**
   * Execute a Cypher query
   *
   * @param {string} cypher - Cypher query
   * @param {Object} params - Query parameters (named parameters for Cypher)
   * @returns {Promise<Array>} - Query results as flat row objects
   * @throws {QueryError} If query fails
   *
   * @example
   * const results = await ops.query(
   *   'MATCH (h:Host {address: $address}) RETURN h',
   *   { address: '192.168.1.1' }
   * );
   */
  async query(cypher, params = {}) {
    if (!this.isConnected) {
      throw new QueryError('Not connected to Neo4j');
    }

    const startTime = Date.now();

    try {
      // Execute Cypher query
      const result = await this.session.run(cypher, params);
      const duration = Date.now() - startTime;

      // Convert Neo4j Records to flat row objects
      const rows = this._recordsToRows(result.records);

      // Log query
      this._logQuery(cypher, params, duration, 'success');

      return rows;
    } catch (err) {
      const duration = Date.now() - startTime;

      // Log error
      this._logQuery(cypher, params, duration, 'error');

      throw new QueryError(
        `Cypher query failed: ${err.message}`,
        err.code,
        err
      );
    }
  }

  /**
   * Begin transaction
   *
   * @returns {Promise<Object>} - Transaction object
   */
  async beginTransaction() {
    if (!this.isConnected) {
      throw new QueryError('Not connected to Neo4j');
    }

    try {
      const tx = this.session.beginTransaction();

      if (this.recorder) {
        this.recorder.emit(8510, 'i', 'Transaction started', {
          database: this.database
        });
      }

      return tx;
    } catch (err) {
      throw new QueryError(
        `Failed to begin transaction: ${err.message}`,
        err.code,
        err
      );
    }
  }

  /**
   * Execute query within a transaction
   *
   * Automatically commits on success or rolls back on error.
   *
   * @param {Function} callback - Async function that receives transaction object
   * @returns {Promise<*>} - Result from callback
   *
   * @example
   * const result = await operations.transaction(async (tx) => {
   *   await tx.run('CREATE (n:Test {id: $id})', { id: 123 });
   *   await tx.run('CREATE (n:Test {id: $id})', { id: 456 });
   *   return { created: 2 };
   * });
   */
  async transaction(callback) {
    const tx = await this.beginTransaction();

    try {
      // Execute callback with transaction object
      const result = await callback(tx);

      // Commit transaction
      await tx.commit();

      if (this.recorder) {
        this.recorder.emit(8511, 'i', 'Transaction committed', {
          database: this.database
        });
      }

      return result;
    } catch (err) {
      // Rollback transaction
      await tx.rollback();

      if (this.recorder) {
        this.recorder.emit(8512, 'w', 'Transaction rolled back', {
          database: this.database,
          error: err.message
        });
      }

      throw err;
    }
  }

  /**
   * Convert Neo4j Records to flat row objects
   *
   * Transforms Neo4j-specific types to JavaScript types:
   * - Integer → number
   * - Node → object with properties + _labels + _id
   * - Relationship → object with properties + _type + _id
   * - Path → array of nodes and relationships
   *
   * @param {Array} records - Neo4j Record objects
   * @returns {Array} - Flat JavaScript objects
   * @private
   */
  _recordsToRows(records) {
    return records.map(record => {
      const row = {};

      // Iterate through record keys (column names)
      record.keys.forEach((key, index) => {
        const value = record.get(index);
        row[key] = this._neo4jValueToJS(value);
      });

      return row;
    });
  }

  /**
   * Convert Neo4j value to JavaScript value
   *
   * @param {*} value - Neo4j value (Integer, Node, Relationship, Path, etc.)
   * @returns {*} - JavaScript value
   * @private
   */
  _neo4jValueToJS(value) {
    // Null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Neo4j Integer → JavaScript number
    if (neo4j.isInt(value)) {
      return value.toNumber();
    }

    // Neo4j Node → object with properties + metadata
    if (value instanceof neo4j.types.Node) {
      return {
        ...this._convertProperties(value.properties),
        _labels: value.labels,
        _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity
      };
    }

    // Neo4j Relationship → object with properties + metadata
    if (value instanceof neo4j.types.Relationship) {
      return {
        ...this._convertProperties(value.properties),
        _type: value.type,
        _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity,
        _startId: neo4j.isInt(value.start) ? value.start.toNumber() : value.start,
        _endId: neo4j.isInt(value.end) ? value.end.toNumber() : value.end
      };
    }

    // Neo4j Path → object with nodes, relationships, segments
    if (value instanceof neo4j.types.Path) {
      return {
        start: this._neo4jValueToJS(value.start),
        end: this._neo4jValueToJS(value.end),
        segments: value.segments.map(segment => ({
          start: this._neo4jValueToJS(segment.start),
          relationship: this._neo4jValueToJS(segment.relationship),
          end: this._neo4jValueToJS(segment.end)
        })),
        length: value.length
      };
    }

    // Array → recurse
    if (Array.isArray(value)) {
      return value.map(item => this._neo4jValueToJS(item));
    }

    // Object → recurse through properties
    if (value && typeof value === 'object') {
      return this._convertProperties(value);
    }

    // Primitive value
    return value;
  }

  /**
   * Convert object properties (handles nested Neo4j types)
   *
   * @param {Object} properties - Object properties
   * @returns {Object} - Converted properties
   * @private
   */
  _convertProperties(properties) {
    const converted = {};

    for (const [key, value] of Object.entries(properties)) {
      converted[key] = this._neo4jValueToJS(value);
    }

    return converted;
  }

  /**
   * Get qualified table name
   *
   * In Neo4j, "schema" refers to the database name, not table qualification.
   * Node labels don't require qualification, so this returns the label as-is.
   *
   * @param {string} label - Node label
   * @returns {string} - Label (unqualified)
   */
  qualifyTable(label) {
    // Neo4j doesn't use schema.table notation
    // Labels are global within a database
    return label;
  }

  /**
   * Get credentials with Infisical-first strategy
   *
   * Priority (NEW):
   * 1. Infisical (via Configuration) - PRIMARY
   * 2. Constructor parameters - OVERRIDE
   * 3. Environment variables - FALLBACK
   *
   * Event codes:
   * - 8506: Credentials loaded from Infisical
   * - 8507: Infisical unavailable, using fallback
   * - 8508: Using constructor credentials
   * - 8509: Using environment credentials
   *
   * @returns {Promise<{username: string, password: string, source: string}>}
   * @private
   */
  async _getCredentials() {
    let source = 'unknown';

    // Tier 1: Infisical (via Configuration) - PRIMARY
    if (this.useInfisicalFirst) {
      try {
        const config = await this._getConfig();
        const username = await config.get('neo4j', 'username');
        const password = await config.get('neo4j', 'password');

        if (username && password) {
          source = 'infisical';

          if (this.recorder) {
            this.recorder.emit(8506, 'i', 'Loaded Neo4j credentials from Infisical', {
              username: this._maskUsername(username)
            });
          }

          return { username, password, source };
        }
      } catch (err) {
        // Infisical unavailable - log warning and continue to fallbacks
        if (this.recorder) {
          this.recorder.emit(8507, 'w', 'Infisical unavailable, using fallback credentials', {
            error: err.message
          });
        }
      }
    }

    // Tier 2: Constructor parameters - OVERRIDE
    if (this.password) {
      source = 'constructor';

      if (this.recorder) {
        this.recorder.emit(8508, 'i', 'Using Neo4j credentials from constructor', {
          username: this._maskUsername(this.username)
        });
      }

      return {
        username: this.username,
        password: this.password,
        source
      };
    }

    // Tier 3: Environment variables - FALLBACK
    const username = process.env.NEO4J_USERNAME || this.username || 'neo4j';
    const password = process.env.NEO4J_PASSWORD;

    if (password) {
      source = 'environment';

      if (this.recorder) {
        this.recorder.emit(8509, 'i', 'Using Neo4j credentials from environment', {
          username: this._maskUsername(username)
        });
      }

      return { username, password, source };
    }

    // No credentials found
    throw new Error(
      'Neo4j credentials not found. Checked: Infisical, constructor, environment variables. ' +
      'Set NEO4J_PASSWORD or configure Infisical.'
    );
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
   * Mask URI for logging
   *
   * @param {string} uri - Neo4j URI
   * @returns {string} - Masked URI
   * @private
   */
  _maskUri(uri) {
    // Mask credentials if present in URI
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }

  /**
   * Get connection metadata
   *
   * @returns {Object} - Metadata about this operations instance
   */
  getMetadata() {
    return {
      ...super.getMetadata(),
      uri: this._maskUri(this.uri),
      database: this.database,
      databaseType: 'neo4j'
    };
  }
}
