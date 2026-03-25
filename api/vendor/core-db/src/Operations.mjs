/**
 * Operations - Base class for database operations
 *
 * Provides a generic, DB-agnostic foundation for database operations.
 * Subclasses implement DB-specific functionality (DB2, PostgreSQL, etc.)
 */

import { BaseError } from '@rescor-llc/core-utils/errors';

/**
 * Global Configuration singleton for all Operations instances
 * @type {Configuration|null}
 * @private
 */
let _globalConfiguration = null;

/**
 * Abstract base class for database operations
 *
 * Features:
 * - Schema-aware operations (supports dev/uat/prod isolation)
 * - Connection management
 * - Query execution interface
 * - Row normalization via transforms
 * - Error handling base
 *
 * @example
 * class MyOperations extends Operations {
 *   constructor(schema, connectionString) {
 *     super({ schema });
 *     this.connectionString = connectionString;
 *   }
 *
 *   async connect() {
 *     // DB-specific connection logic
 *   }
 * }
 */
export class Operations {
  /**
   * Get or create global Configuration instance
   *
   * This singleton ensures all Operations instances share the same Configuration,
   * reducing overhead and ensuring consistent Infisical access.
   *
   * Two-tier Infisical resolution:
   * - Project-specific: Auto-detected from cwd (e.g., spm.rescor.net)
   * - Core: core.rescor.net (fallback for common configuration)
   *
   * @returns {Promise<Configuration>} Initialized configuration
   * @static
   */
  static async getGlobalConfiguration() {
    if (!_globalConfiguration) {
      const { Configuration } = await import('@rescor-llc/core-config');
      _globalConfiguration = new Configuration({
        enableInfisical: true,  // Default ON
        requireInfisical: false,  // Soft-fail when unavailable
        enableCache: true,
        infisicalOptions: {
          // Project-specific projectId (auto-detected or from env)
          projectId: process.env.INFISICAL_PROJECT_ID,

          // Core projectId for shared configuration (core.rescor.net)
          coreProjectId: process.env.INFISICAL_CORE_PROJECT_ID,

          // Credentials
          clientId: process.env.INFISICAL_CLIENT_ID,
          clientSecret: process.env.INFISICAL_CLIENT_SECRET
        }
      });
      await _globalConfiguration.initialize();
    }
    return _globalConfiguration;
  }

  /**
   * Reset global configuration (for testing purposes)
   *
   * @returns {void}
   * @static
   * @private
   */
  static _resetGlobalConfiguration() {
    _globalConfiguration = null;
  }

  /**
   * @param {Object} options - Configuration options
   * @param {string} options.schema - Database schema name (e.g., 'TCDEV', 'TC', 'SPMDEV')
   * @param {Object} options.transforms - Transform configuration for row normalization
   * @param {Object} options.auditConfig - Audit configuration for query logging
   * @param {Object} options.recorder - Recorder instance for logging
   * @param {boolean} [options.useInfisicalFirst=true] - Use Infisical as primary credential source
   * @param {Configuration} [options.config] - Custom Configuration instance (overrides global)
   */
  constructor(options = {}) {
    this.schema = options.schema || null;
    this.transforms = options.transforms || null;
    this.auditConfig = options.auditConfig || null;
    this.recorder = options.recorder || null;
    this.handle = null; // Connection handle (set by connect())
    this.parameters = {}; // Connection parameters
    this._connected = false;

    // Store connection parameters for metadata
    this.hostname = options.hostname || null;
    this.port = options.port || null;
    this.database = options.database || null;
    this.user = options.user || null;

    // Infisical-first configuration
    this.useInfisicalFirst = options.useInfisicalFirst ?? true;  // Default ON
    this.config = options.config || null;  // Allow custom config override
  }

  /**
   * Get configuration instance (global or custom)
   *
   * @returns {Promise<Configuration>}
   * @protected
   */
  async _getConfig() {
    if (this.config) {
      return this.config;  // Custom config provided
    }
    return Operations.getGlobalConfiguration();  // Use global singleton
  }

  /**
   * Get qualified table name with schema
   *
   * @param {string} tableName - Unqualified table name
   * @returns {string} - Schema-qualified table name
   *
   * @example
   * operations.tableReference('TEST')  // 'TCDEV.TEST'
   */
  get tableReference() {
    if (!this.schema) {
      throw new Error('Schema not configured');
    }
    // Subclasses should override to provide table-specific references
    return this.schema;
  }

  /**
   * Get schema-qualified table name
   *
   * @param {string} tableName - Table name
   * @returns {string} - Qualified name
   */
  qualifyTable(tableName) {
    if (!this.schema) {
      return tableName;
    }
    return `${this.schema}.${tableName}`;
  }

  /**
   * Connect to database (abstract - must be implemented by subclass)
   *
   * @returns {Promise<void>}
   * @throws {Error} If not implemented
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from database (abstract - must be implemented by subclass)
   *
   * @returns {Promise<void>}
   * @throws {Error} If not implemented
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Execute a query (abstract - must be implemented by subclass)
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} - Query results
   * @throws {Error} If not implemented
   */
  async query(sql, params = []) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Check if connected
   *
   * @returns {boolean}
   */
  get isConnected() {
    return this._connected && this.handle !== null;
  }

  /**
   * Normalize database rows using transform system
   *
   * Applies transformations to raw database results:
   * - Lowercase column names
   * - Trim whitespace
   * - Parse JSON columns
   * - Custom field transformations
   *
   * @param {Array|Object} results - Database results (array or single row)
   * @param {Object} transforms - Transform configuration (optional)
   * @returns {Array|Object} - Normalized results
   *
   * @example
   * const raw = [{ TEST_ID: '  123  ', DATA: '{"foo":"bar"}' }];
   * const normalized = Operations.MassageResults(raw);
   * // [{ test_id: '123', data: { foo: 'bar' } }]
   */
  static MassageResults(results, transforms = null) {
    if (!results) {
      return results;
    }

    // If transforms has an apply() method, use it (Transforms instance)
    if (transforms && typeof transforms.apply === 'function') {
      return transforms.apply(results);
    }

    // Handle single object (convert to array, process, return first)
    const isArray = Array.isArray(results);
    const rows = isArray ? results : [results];

    const normalized = rows.map(row => {
      if (!row || typeof row !== 'object') {
        return row;
      }

      const normalized = {};

      for (const [key, value] of Object.entries(row)) {
        // Lowercase column names
        const lowerKey = key.toLowerCase();

        // Apply transforms if provided
        let normalizedValue = value;

        // Default: trim strings
        if (typeof normalizedValue === 'string') {
          normalizedValue = normalizedValue.trim();
        }

        // Try to parse JSON strings
        if (typeof normalizedValue === 'string' &&
            (normalizedValue.startsWith('{') || normalizedValue.startsWith('['))) {
          try {
            normalizedValue = JSON.parse(normalizedValue);
          } catch (err) {
            // Not valid JSON, keep as string
          }
        }

        // Apply custom transforms (legacy object-based approach)
        if (transforms && transforms[lowerKey]) {
          const transform = transforms[lowerKey];
          if (typeof transform === 'function') {
            normalizedValue = transform(normalizedValue, row);
          }
        }

        normalized[lowerKey] = normalizedValue;
      }

      return normalized;
    });

    return isArray ? normalized : normalized[0];
  }

  /**
   * Validate database identifier (table name, column name, etc.)
   *
   * Prevents SQL injection by validating identifier format.
   * Default implementation allows alphanumeric + underscore.
   * Subclasses can override for DB-specific rules.
   *
   * @param {string} identifier - Identifier to validate
   * @param {number} maxLength - Maximum length (default: 128)
   * @returns {boolean} - True if valid
   * @throws {Error} If invalid
   *
   * @example
   * Operations.validateIdentifier('MY_TABLE')  // OK
   * Operations.validateIdentifier(''; DROP TABLE USERS--')  // Throws
   */
  static validateIdentifier(identifier, maxLength = 128) {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier must be a non-empty string');
    }

    if (identifier.length > maxLength) {
      throw new Error(`Identifier exceeds maximum length of ${maxLength}`);
    }

    // Allow alphanumeric + underscore + dot (for qualified names like SCHEMA.TABLE)
    // Must start with letter or underscore (DB2 allows underscore)
    const validPattern = /^[A-Z_][A-Z0-9_.]*$/i;
    if (!validPattern.test(identifier)) {
      throw new Error(`Invalid identifier format: ${identifier}. Must start with letter/underscore, contain only letters/numbers/underscores/dots`);
    }

    return true;
  }

  /**
   * Log query execution (if recorder available)
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {number} duration - Execution time in ms
   * @param {string} status - Execution status ('success', 'error')
   */
  _logQuery(sql, params, duration, status) {
    if (!this.recorder) {
      return;
    }

    this.recorder.emit(8500, 'i', 'Query executed', {
      sql: this._maskSensitiveData(sql),
      params: this._maskSensitiveData(params),
      duration,
      status,
      schema: this.schema
    });
  }

  /**
   * Mask sensitive data in SQL/parameters
   *
   * @param {string|Array|Object} data - Data to mask
   * @returns {string|Array|Object} - Masked data
   */
  _maskSensitiveData(data) {
    if (typeof data === 'string') {
      // Mask password-related content
      return data.replace(/password\s*=\s*'[^']*'/gi, "password='***'")
                 .replace(/pwd\s*=\s*'[^']*'/gi, "pwd='***'")
                 .replace(/api[_-]?key\s*=\s*'[^']*'/gi, "api_key='***'");
    }

    if (Array.isArray(data)) {
      return data.map(item => this._maskSensitiveData(item));
    }

    if (data && typeof data === 'object') {
      const masked = {};
      for (const [key, value] of Object.entries(data)) {
        if (/password|pwd|secret|token|api[_-]?key/i.test(key)) {
          masked[key] = '***';
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }

    return data;
  }

  /**
   * Check database connection and throw if not connected
   *
   * @throws {DatabaseError} If not connected
   */
  checkConnection() {
    if (!this.isConnected) {
      throw new DatabaseError('database not connected');
    }
  }

  /**
   * Execute transaction (abstract - must be implemented by subclass)
   *
   * @param {Function} callback - Transaction callback function
   * @returns {Promise<*>} - Transaction result
   * @throws {Error} If not implemented
   */
  async transaction(callback) {
    throw new Error('transaction() must be implemented by subclass');
  }

  /**
   * Insert multiple rows using chunked multi-row INSERT statements.
   *
   * Sends rows in batches of `chunkSize` per INSERT, drastically reducing
   * network round-trips compared to individual per-row inserts. The table name
   * may be unqualified (auto-qualified via this.schema) or pre-qualified
   * (e.g. 'SESSION.BENCH_FINDING').
   *
   * Does NOT wrap in a transaction automatically. Wrap the call in
   * operations.transaction() if atomicity is required.
   *
   * @param {string}     table     - Table name (unqualified or 'SCHEMA.TABLE')
   * @param {string[]}   columns   - Column names in value-array order
   * @param {unknown[][]} rows     - Array of value arrays, one per row
   * @param {number}     chunkSize - Rows per INSERT statement (default 500)
   * @returns {Promise<number>} Total rows inserted
   *
   * @example
   * // Unqualified — auto-qualified to this.schema.TABLE
   * await operations.insertMany('FINDING', ['ID', 'LABEL'], rows);
   *
   * @example
   * // Pre-qualified — used as-is (useful for SESSION temp tables)
   * await operations.insertMany('SESSION.BENCH_FINDING', columns, rows);
   *
   * @example
   * // Transactional bulk load
   * await operations.transaction(() =>
   *   operations.insertMany('FINDING', columns, rows)
   * );
   */
  async insertMany(table, columns, rows, chunkSize = 500) {
    this.checkConnection();

    if (!columns || columns.length === 0) {
      throw new Error('insertMany: columns array must not be empty');
    }
    if (chunkSize < 1) {
      throw new Error('insertMany: chunkSize must be at least 1');
    }

    let qualifiedTable;
    if (table.includes('.')) {
      Operations.validateIdentifier(table);
      qualifiedTable = table;
    } else {
      Operations.validateIdentifier(table);
      qualifiedTable = this.qualifyTable(table);
    }

    for (const column of columns) {
      Operations.validateIdentifier(column);
    }

    if (!rows || rows.length === 0) {
      return 0;
    }

    const columnList      = columns.join(', ');
    const columnCount     = columns.length;
    const rowPlaceholders = `(${Array(columnCount).fill('?').join(', ')})`;
    const fullChunks      = Math.floor(rows.length / chunkSize);
    const remainder       = rows.length % chunkSize;
    let rowsInserted      = 0;

    if (fullChunks > 0) {
      const chunkValueList = Array(chunkSize).fill(rowPlaceholders).join(', ');
      const chunkSql = `INSERT INTO ${qualifiedTable} (${columnList}) VALUES ${chunkValueList}`;

      for (let chunk = 0; chunk < fullChunks; chunk++) {
        const flatParams = rows.slice(chunk * chunkSize, (chunk + 1) * chunkSize).flat();
        await this.query(chunkSql, flatParams);
        rowsInserted += chunkSize;
      }
    }

    if (remainder > 0) {
      const remainderValueList = Array(remainder).fill(rowPlaceholders).join(', ');
      const remainderSql = `INSERT INTO ${qualifiedTable} (${columnList}) VALUES ${remainderValueList}`;
      const flatParams   = rows.slice(fullChunks * chunkSize).flat();
      await this.query(remainderSql, flatParams);
      rowsInserted += remainder;
    }

    return rowsInserted;
  }

  /**
   * Get operation metadata
   *
   * @returns {Object} - Metadata about this operations instance
   */
  getMetadata() {
    return {
      schema: this.schema,
      connected: this.isConnected,
      hostname: this.hostname,
      port: this.port,
      database: this.database,
      hasTransforms: !!this.transforms,
      hasAudit: !!this.auditConfig,
      hasRecorder: !!this.recorder
    };
  }
}

/**
 * Database error classes
 *
 * These errors extend BaseError from core-utils, providing:
 * - Consistent error handling across RESCOR packages
 * - Error codes and metadata
 * - Original error preservation
 * - Stack trace capture
 */

export class DatabaseError extends BaseError {
  constructor(message, code = null, originalError = null) {
    super(message, 'DatabaseError', code, originalError);
  }
}

export class NoResults extends DatabaseError {
  constructor(message = 'No results found', code = null) {
    super(message, code);
    this.name = 'NoResults';
  }
}

export class DuplicateRecord extends DatabaseError {
  constructor(message = 'Record already exists', code = null) {
    super(message, code);
    this.name = 'DuplicateRecord';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message = 'Database connection failed', code = null, originalError = null) {
    super(message, code, originalError);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message = 'Query execution failed', code = null, originalError = null) {
    super(message, code, originalError);
    this.name = 'QueryError';
  }
}
