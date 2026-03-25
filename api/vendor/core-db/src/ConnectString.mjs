/**
 * ConnectString - IBM DB2 connection string builder
 *
 * Provides sophisticated connection string building with:
 * - Three-tier credential strategy (config → file → env)
 * - Integration with @rescor-llc/core-config
 * - Password file support (Docker secrets)
 * - Environment variable fallback
 * - Validation and error handling
 */

import { promises as fs } from 'fs';
import { ConnectionError } from './Operations.mjs';

/**
 * Build DB2 connection strings with flexible credential strategies
 *
 * @example
 * import { ConnectString } from '@rescor-llc/core-db';
 * import { Configuration } from '@rescor-llc/core-config';
 *
 * const builder = new ConnectString({
 *   hostname: 'localhost',
 *   port: 50000,
 *   database: 'TCDEV',
 *   protocol: 'TCPIP'
 * });
 *
 * // Load credentials from config
 * const connStr = await builder.build(config);
 *
 * // Or provide credentials directly
 * const connStr = builder.buildDirect('admin', 'password');
 */
export class ConnectString {
  /**
   * @param {Object} options - Connection parameters
   * @param {string} options.hostname - Database hostname
   * @param {number|string} options.port - Database port
   * @param {string} options.database - Database name
   * @param {string} options.protocol - Connection protocol (default: 'TCPIP')
   * @param {string} options.user - Database user (optional)
   * @param {string} options.password - Database password (optional)
   * @param {string} options.passwordFile - Path to password file (optional)
   */
  constructor(options = {}) {
    this.hostname = options.hostname || 'localhost';
    this.port = options.port || 50000;
    this.database = options.database;
    this.protocol = options.protocol || 'TCPIP';
    this.user = options.user || null;
    this.password = options.password || null;
    this.passwordFile = options.passwordFile || '/run/secrets/db_password';
  }

  /**
   * Build connection string with credential strategies
   *
   * Three-tier precedence:
   * 1. Configuration (via @rescor-llc/core-config DatabaseSchema)
   * 2. Password file (Docker secrets, Kubernetes secrets)
   * 3. Environment variables
   *
   * @param {Configuration} config - Configuration instance (optional)
   * @returns {Promise<string>} - DB2 connection string
   * @throws {ConnectionError} If credentials cannot be loaded
   *
   * @example
   * const connStr = await builder.build(config);
   */
  async build(config = null) {
    let user = this.user;
    let password = this.password;

    // If credentials not provided, use three-tier strategy
    if (!user || !password) {
      const creds = await this._loadCredentials(config);
      user = user || creds.user;
      password = password || creds.password;
    }

    if (!user || !password) {
      throw new ConnectionError('Database credentials not found. Tried: config, password file, environment variables');
    }

    return this.buildDirect(user, password);
  }

  /**
   * Build connection string with provided credentials
   *
   * @param {string} user - Database user
   * @param {string} password - Database password
   * @returns {string} - DB2 connection string
   *
   * @example
   * const connStr = builder.buildDirect('admin', 'password');
   * // 'DATABASE=TCDEV;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=admin;PWD=password'
   */
  buildDirect(user, password) {
    if (!this.database) {
      throw new ConnectionError('Database name is required');
    }

    if (!user || !password) {
      throw new ConnectionError('User and password are required');
    }

    return `DATABASE=${this.database};` +
           `HOSTNAME=${this.hostname};` +
           `PORT=${this.port};` +
           `PROTOCOL=${this.protocol};` +
           `UID=${user};` +
           `PWD=${password}`;
  }

  /**
   * Load credentials using three-tier strategy
   *
   * @param {Configuration} config - Configuration instance
   * @returns {Promise<{user: string, password: string}>} - Credentials
   * @private
   */
  async _loadCredentials(config) {
    // Tier 1: Configuration (@rescor-llc/core-config)
    if (config) {
      try {
        const creds = await this._loadFromConfig(config);
        if (creds.user && creds.password) {
          return creds;
        }
      } catch (err) {
        // Config failed, continue to tier 2
      }
    }

    // Tier 2: Password file (Docker secrets)
    try {
      const creds = await this._loadFromPasswordFile();
      if (creds.user && creds.password) {
        return creds;
      }
    } catch (err) {
      // File failed, continue to tier 3
    }

    // Tier 3: Environment variables
    const creds = this._loadFromEnvironment();
    return creds;
  }

  /**
   * Load credentials from @rescor-llc/core-config
   *
   * @param {Configuration} config - Configuration instance
   * @returns {Promise<{user: string, password: string}>}
   * @private
   */
  async _loadFromConfig(config) {
    try {
      // Dynamic import to avoid circular dependency
      const { DatabaseSchema } = await import('@rescor-llc/core-config');

      const schema = new DatabaseSchema({ domain: 'database' });
      const dbConfig = await schema.load(config);

      return {
        user: dbConfig.user,
        password: dbConfig.password
      };
    } catch (err) {
      return { user: null, password: null };
    }
  }

  /**
   * Load credentials from password file
   *
   * Supports Docker secrets pattern: /run/secrets/db_password
   * File format: one line with "user:password"
   *
   * @returns {Promise<{user: string, password: string}>}
   * @private
   */
  async _loadFromPasswordFile() {
    try {
      const content = await fs.readFile(this.passwordFile, 'utf8');
      const trimmed = content.trim();

      // Format: "user:password"
      if (trimmed.includes(':')) {
        const [user, password] = trimmed.split(':', 2);
        return { user: user.trim(), password: password.trim() };
      }

      // Format: just password (user from env or instance)
      return {
        user: process.env.DB2_USER || this.user,
        password: trimmed
      };
    } catch (err) {
      return { user: null, password: null };
    }
  }

  /**
   * Load credentials from environment variables
   *
   * Checks multiple variable name patterns:
   * - DB2_USER, DB2_PASSWORD
   * - DATABASE_USER, DATABASE_PASSWORD
   * - <DATABASE>_USER, <DATABASE>_PASSWORD (e.g., TCDEV_USER)
   *
   * @returns {{user: string, password: string}}
   * @private
   */
  _loadFromEnvironment() {
    // Standard DB2 variables
    let user = process.env.DB2_USER;
    let password = process.env.DB2_PASSWORD;

    // Generic database variables
    if (!user) user = process.env.DATABASE_USER;
    if (!password) password = process.env.DATABASE_PASSWORD;

    // Database-specific variables (e.g., TCDEV_USER)
    if (!user && this.database) {
      user = process.env[`${this.database}_USER`];
    }
    if (!password && this.database) {
      password = process.env[`${this.database}_PASSWORD`];
    }

    return { user, password };
  }

  /**
   * Get masked connection string for logging
   *
   * @returns {string} - Connection string with masked credentials
   */
  getMasked() {
    return `DATABASE=${this.database};` +
           `HOSTNAME=${this.hostname};` +
           `PORT=${this.port};` +
           `PROTOCOL=${this.protocol};` +
           `UID=***;` +
           `PWD=***`;
  }

  /**
   * Validate connection parameters
   *
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.hostname) {
      errors.push('Hostname is required');
    }

    if (!this.port) {
      errors.push('Port is required');
    }

    if (!this.database) {
      errors.push('Database name is required');
    }

    if (!this.protocol) {
      errors.push('Protocol is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create ConnectString from DatabaseSchema config
   *
   * @param {Object} dbConfig - Database configuration from DatabaseSchema.load()
   * @returns {ConnectString}
   *
   * @example
   * const template = new LocalDatabaseTemplate();
   * await template.apply(config);
   * const dbConfig = await template.schema.load(config);
   *
   * const builder = ConnectString.fromDatabaseConfig(dbConfig);
   * const connStr = builder.buildDirect(dbConfig.user, dbConfig.password);
   */
  static fromDatabaseConfig(dbConfig) {
    return new ConnectString({
      hostname: dbConfig.hostname,
      port: dbConfig.port,
      database: dbConfig.database,
      protocol: dbConfig.protocol,
      user: dbConfig.user,
      password: dbConfig.password
    });
  }

  /**
   * Create ConnectString from environment variables
   *
   * @returns {ConnectString}
   */
  static fromEnvironment() {
    return new ConnectString({
      hostname: process.env.DB2_HOSTNAME || 'localhost',
      port: process.env.DB2_PORT || 50000,
      database: process.env.DB2_DATABASE,
      protocol: process.env.DB2_PROTOCOL || 'TCPIP',
      user: process.env.DB2_USER,
      password: process.env.DB2_PASSWORD
    });
  }
}
