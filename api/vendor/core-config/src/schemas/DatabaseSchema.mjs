/**
 * DatabaseSchema - Standard database configuration schema
 *
 * Defines a reusable pattern for database connection configuration
 * with automatic connection string generation and validation.
 */

import { Schema } from '../Schema.mjs';
import { ClassifiedDatum } from '../ClassifiedDatum.mjs';

/**
 * Database configuration schema
 *
 * Provides standardized database configuration with:
 * - Hostname, port, database name
 * - Protocol (TCPIP by default)
 * - Credentials (user, password)
 * - Automatic connection string generation
 * - Optional connection testing
 *
 * @example
 * const dbSchema = new DatabaseSchema();
 * const db = await dbSchema.load(config);
 * console.log(db.connectionString);
 * // DATABASE=TESTDB;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=admin;PWD=secret
 */
export class DatabaseSchema extends Schema {
  /**
   * @param {Object} options - Schema options
   * @param {string} options.domain - Domain name (default: 'database')
   * @param {string} options.defaultHostname - Default hostname (default: 'localhost')
   * @param {string} options.defaultPort - Default port (default: '50000')
   * @param {string} options.defaultProtocol - Default protocol (default: 'TCPIP')
   */
  constructor(options = {}) {
    const domain = options.domain || 'database';
    const defaults = {
      hostname: options.defaultHostname || 'localhost',
      port: options.defaultPort || '50000',
      protocol: options.defaultProtocol || 'TCPIP'
    };

    super([
      ClassifiedDatum.setting(domain, 'hostname', {
        description: 'Database server hostname',
        default: defaults.hostname
      }),
      ClassifiedDatum.setting(domain, 'port', {
        description: 'Database server port',
        default: defaults.port
      }),
      ClassifiedDatum.setting(domain, 'database', {
        description: 'Database name',
        required: true
      }),
      ClassifiedDatum.setting(domain, 'protocol', {
        description: 'Connection protocol',
        default: defaults.protocol
      }),
      ClassifiedDatum.credential(domain, 'user', {
        description: 'Database user',
        required: true
      }),
      ClassifiedDatum.credential(domain, 'password', {
        description: 'Database password',
        required: true,
        rotation: 90 // Rotate every 90 days
      })
    ]);

    this.domain = domain;
    this.defaults = defaults;
  }

  /**
   * Convert to typed database configuration object
   *
   * @returns {Object} - Database configuration with typed fields
   * @returns {string} return.hostname - Database hostname
   * @returns {number} return.port - Database port (converted to number)
   * @returns {string} return.database - Database name
   * @returns {string} return.protocol - Connection protocol
   * @returns {string} return.user - Database user
   * @returns {string} return.password - Database password
   * @returns {string} return.connectionString - Full DB2 connection string
   */
  toTypedObject() {
    return {
      hostname: this.getValue(this.domain, 'hostname') || this.defaults.hostname,
      port: parseInt(this.getValue(this.domain, 'port') || this.defaults.port),
      database: this.getValue(this.domain, 'database'),
      protocol: this.getValue(this.domain, 'protocol') || this.defaults.protocol,
      user: this.getValue(this.domain, 'user'),
      password: this.getValue(this.domain, 'password'),

      // Computed properties
      connectionString: this.getConnectionString()
    };
  }

  /**
   * Build DB2 connection string
   *
   * @returns {string} - Complete DB2 connection string
   *
   * @example
   * schema.getConnectionString()
   * // 'DATABASE=TESTDB;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=admin;PWD=secret'
   */
  getConnectionString() {
    const hostname = this.getValue(this.domain, 'hostname') || this.defaults.hostname;
    const port = this.getValue(this.domain, 'port') || this.defaults.port;
    const database = this.getValue(this.domain, 'database');
    const protocol = this.getValue(this.domain, 'protocol') || this.defaults.protocol;
    const user = this.getValue(this.domain, 'user');
    const password = this.getValue(this.domain, 'password');

    return `DATABASE=${database};` +
           `HOSTNAME=${hostname};` +
           `PORT=${port};` +
           `PROTOCOL=${protocol};` +
           `UID=${user};` +
           `PWD=${password}`;
  }

  /**
   * Test database connection
   *
   * Attempts to open and close a connection to verify configuration.
   * Requires ibm_db package to be installed.
   *
   * @returns {Promise<boolean>} - True if connection successful
   *
   * @example
   * if (await dbSchema.testConnection()) {
   *   console.log('Database connection successful');
   * } else {
   *   console.error('Cannot connect to database');
   * }
   */
  async testConnection() {
    try {
      const ibmdb = await import('ibm_db');
      const conn = await ibmdb.open(this.getConnectionString());
      await conn.close();
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get connection info for logging (with masked credentials)
   *
   * @returns {Object} - Safe connection info for logging
   */
  getConnectionInfo() {
    return {
      hostname: this.getValue(this.domain, 'hostname') || this.defaults.hostname,
      port: parseInt(this.getValue(this.domain, 'port') || this.defaults.port),
      database: this.getValue(this.domain, 'database'),
      protocol: this.getValue(this.domain, 'protocol') || this.defaults.protocol,
      user: this.getValue(this.domain, 'user'),
      password: '***MASKED***'
    };
  }
}
