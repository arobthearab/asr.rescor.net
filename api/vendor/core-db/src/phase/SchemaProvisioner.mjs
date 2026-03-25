/**
 * SchemaProvisioner - SQL execution for schema setup and management
 *
 * Handles SQL execution for:
 * - Schema creation
 * - Table creation from DDL files
 * - Data population from SQL files
 * - Schema verification
 * - Backup and restore operations
 *
 * Supports:
 * - File-based SQL execution
 * - Transaction management
 * - Error handling and rollback
 * - Progress tracking
 *
 * @example
 * import { SchemaProvisioner } from '@rescor-llc/core-db/phase';
 *
 * const provisioner = new SchemaProvisioner(operations);
 * await provisioner.createSchema('TCDEV');
 * await provisioner.executeFile('schemas/tc/tables.sql');
 */

import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * SchemaProvisioner - Executes SQL for schema management
 */
export class SchemaProvisioner {
  /**
   * @param {Operations} operations - Database operations instance
   * @param {Object} options - Configuration options
   * @param {Recorder} options.recorder - Recorder for logging
   * @param {string} options.sqlDirectory - Base directory for SQL files
   * @param {boolean} options.useTransactions - Wrap operations in transactions (default: true)
   */
  constructor(operations, options = {}) {
    this.operations = operations;
    this.recorder = options.recorder || null;
    this.sqlDirectory = options.sqlDirectory || null;
    this.useTransactions = options.useTransactions !== false;

    // Track execution progress
    this.progress = {
      filesExecuted: 0,
      statementsExecuted: 0,
      errors: []
    };
  }

  /**
   * Create a new schema
   *
   * @param {string} schemaName - Schema name to create
   * @returns {Promise<void>}
   */
  async createSchema(schemaName) {
    this._log(8010, 'i', 'Creating schema', { schema: schemaName });

    const sql = `CREATE SCHEMA ${schemaName}`;

    try {
      await this.operations.query(sql);
      this._log(8011, 'i', 'Schema created successfully', { schema: schemaName });
    } catch (err) {
      // Ignore error if schema already exists
      if (err.code && (err.code.includes('601') || err.code.includes('already exists'))) {
        this._log(8012, 'w', 'Schema already exists', { schema: schemaName });
      } else {
        this._log(8013, 'e', 'Schema creation failed', { schema: schemaName, error: err.message });
        throw err;
      }
    }
  }

  /**
   * Drop a schema
   *
   * @param {string} schemaName - Schema name to drop
   * @param {Object} options - Drop options
   * @param {boolean} options.cascade - Drop all objects in schema (default: false)
   * @param {boolean} options.restrict - Only drop if empty (default: true)
   * @returns {Promise<void>}
   */
  async dropSchema(schemaName, options = {}) {
    const { cascade = false, restrict = true } = options;

    this._log(8014, 'w', 'Dropping schema', { schema: schemaName, cascade, restrict });

    // Safety check: require explicit cascade or restrict
    if (!cascade && !restrict) {
      throw new Error('Must specify either cascade or restrict when dropping schema');
    }

    const clause = cascade ? 'CASCADE' : 'RESTRICT';
    const sql = `DROP SCHEMA ${schemaName} ${clause}`;

    try {
      await this.operations.query(sql);
      this._log(8015, 'i', 'Schema dropped successfully', { schema: schemaName });
    } catch (err) {
      this._log(8016, 'e', 'Schema drop failed', { schema: schemaName, error: err.message });
      throw err;
    }
  }

  /**
   * Check if schema exists
   *
   * @param {string} schemaName - Schema name to check
   * @returns {Promise<boolean>} - True if schema exists
   */
  async schemaExists(schemaName) {
    const sql = `
      SELECT 1 FROM SYSCAT.SCHEMATA
      WHERE SCHEMANAME = ?
    `;

    try {
      const results = await this.operations.query(sql, [schemaName.toUpperCase()]);
      return results && results.length > 0;
    } catch (err) {
      this._log(8017, 'e', 'Schema existence check failed', { schema: schemaName, error: err.message });
      throw err;
    }
  }

  /**
   * Execute SQL file
   *
   * @param {string} filePath - Path to SQL file (relative to sqlDirectory if set)
   * @param {Object} options - Execution options
   * @param {Object} options.variables - SQL variable substitutions
   * @param {boolean} options.continueOnError - Continue if statement fails (default: false)
   * @returns {Promise<Object>} - Execution results
   */
  async executeFile(filePath, options = {}) {
    const { variables = {}, continueOnError = false } = options;

    // Resolve file path
    const resolvedPath = this.sqlDirectory
      ? join(this.sqlDirectory, filePath)
      : resolve(filePath);

    this._log(8020, 'i', 'Executing SQL file', { file: resolvedPath });

    try {
      // Read SQL file
      const sqlContent = await readFile(resolvedPath, 'utf-8');

      // Apply variable substitutions
      const processedSQL = this._substituteVariables(sqlContent, variables);

      // Split into statements
      const statements = this._splitStatements(processedSQL);

      this._log(8021, 'i', 'Executing SQL statements', {
        file: resolvedPath,
        statementCount: statements.length
      });

      // Execute statements
      const results = await this._executeStatements(statements, { continueOnError });

      this.progress.filesExecuted++;

      this._log(8022, 'i', 'SQL file executed successfully', {
        file: resolvedPath,
        statementsExecuted: results.successCount,
        statementsFailed: results.errorCount
      });

      return results;

    } catch (err) {
      this._log(8023, 'e', 'SQL file execution failed', { file: resolvedPath, error: err.message });
      this.progress.errors.push({ file: resolvedPath, error: err.message });
      throw err;
    }
  }

  /**
   * Execute multiple SQL files in sequence
   *
   * @param {string[]} filePaths - Array of SQL file paths
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Combined execution results
   */
  async executeFiles(filePaths, options = {}) {
    const results = {
      totalFiles: filePaths.length,
      successfulFiles: 0,
      failedFiles: 0,
      totalStatements: 0,
      errors: []
    };

    for (const filePath of filePaths) {
      try {
        const fileResults = await this.executeFile(filePath, options);
        results.successfulFiles++;
        results.totalStatements += fileResults.successCount;
      } catch (err) {
        results.failedFiles++;
        results.errors.push({ file: filePath, error: err.message });

        if (!options.continueOnError) {
          throw err;
        }
      }
    }

    return results;
  }

  /**
   * Execute SQL statements with transaction support
   *
   * @param {string[]} statements - Array of SQL statements
   * @param {Object} options - Execution options
   * @param {boolean} options.continueOnError - Continue if statement fails (default: false)
   * @returns {Promise<Object>} - Execution results
   */
  async _executeStatements(statements, options = {}) {
    const { continueOnError = false } = options;

    const results = {
      successCount: 0,
      errorCount: 0,
      errors: []
    };

    // Use transaction if enabled and available
    if (this.useTransactions && this.operations.transaction) {
      try {
        await this.operations.transaction(async () => {
          for (const sql of statements) {
            try {
              await this.operations.query(sql);
              results.successCount++;
              this.progress.statementsExecuted++;
            } catch (err) {
              results.errorCount++;
              results.errors.push({ sql, error: err.message });

              if (!continueOnError) {
                throw err;
              }
            }
          }
        });
      } catch (err) {
        this._log(8024, 'e', 'Transaction failed, rolling back', { error: err.message });
        throw err;
      }
    } else {
      // Execute without transaction
      for (const sql of statements) {
        try {
          await this.operations.query(sql);
          results.successCount++;
          this.progress.statementsExecuted++;
        } catch (err) {
          results.errorCount++;
          results.errors.push({ sql, error: err.message });

          if (!continueOnError) {
            throw err;
          }
        }
      }
    }

    return results;
  }

  /**
   * Split SQL content into individual statements
   *
   * @param {string} sql - SQL content
   * @returns {string[]} - Array of SQL statements
   */
  _splitStatements(sql) {
    // Remove comments
    const withoutComments = sql
      .replace(/--.*$/gm, '')  // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments

    // Split on semicolons (basic implementation)
    const statements = withoutComments
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    return statements;
  }

  /**
   * Substitute variables in SQL
   *
   * @param {string} sql - SQL content
   * @param {Object} variables - Variable substitutions
   * @returns {string} - Processed SQL
   */
  _substituteVariables(sql, variables) {
    let processed = sql;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      processed = processed.replace(regex, value);
    }

    return processed;
  }

  /**
   * Get execution progress
   *
   * @returns {Object} - Progress information
   */
  getProgress() {
    return {
      ...this.progress,
      totalErrors: this.progress.errors.length
    };
  }

  /**
   * Reset execution progress
   */
  resetProgress() {
    this.progress = {
      filesExecuted: 0,
      statementsExecuted: 0,
      errors: []
    };
  }

  /**
   * Log event
   *
   * @param {number} code - Event code
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  _log(code, level, message, data = {}) {
    if (this.recorder) {
      this.recorder.emit(code, level, message, data);
    }
  }
}
