/**
 * ErrorHandler - IBM DB2 error code mapping and handling
 *
 * Provides:
 * - DB2 SQL code to user-friendly message mapping
 * - Sensitive field masking in error messages
 * - Development vs. production error modes
 * - Error classification (connection, permission, data, etc.)
 */

import { DatabaseError, NoResults, DuplicateRecord, ConnectionError, QueryError } from './Operations.mjs';

/**
 * DB2 SQL error code mappings
 *
 * Maps DB2 SQLCODE and SQLSTATE to user-friendly messages
 */
const DB2_ERROR_MAPPINGS = {
  // Connection errors (-1000 to -1099)
  'SQL1001N': 'Database system error',
  'SQL1024N': 'Database connection lost',
  'SQL1040W': 'Database command completed with warnings',

  // Authentication/Authorization errors (-5000 to -5999)
  'SQL0551N': 'Insufficient permissions to perform this operation',
  'SQL0552N': 'Operation not authorized',
  'SQL0553N': 'User lacks necessary privilege',

  // Data errors (-100 to -999)
  'SQL0100W': 'No data found',
  'SQL0204N': 'Object does not exist',
  'SQL0407N': 'Assignment of null to not null column is not allowed',
  'SQL0408N': 'A value is not valid',
  'SQL0420N': 'Character in value is not valid',
  'SQL0501N': 'Cursor is not open',
  'SQL0502N': 'Cursor already open',
  'SQL0530N': 'Foreign key constraint violation',
  'SQL0532N': 'Cannot delete due to dependent relationship',
  'SQL0601N': 'Object already exists',
  'SQL0668N': 'Operation not allowed for reason code',
  'SQL0803N': 'Duplicate key value violates unique constraint',
  'SQL0805N': 'Package not found',
  'SQL0911N': 'Transaction rolled back due to deadlock or timeout',
  'SQL0913N': 'Unsuccessful execution due to deadlock or timeout',

  // Syntax errors (-2000 to -2999)
  'SQL0104N': 'SQL syntax error',
  'SQL0117N': 'Number of values does not match number of columns',
  'SQL0206N': 'Column does not exist',
  'SQL0208N': 'Order by column not in result',

  // Resource errors (-9000 to -9999)
  'SQL0902N': 'Resource limit exceeded',
  'SQL0954N': 'Insufficient resources',
  'SQL0968N': 'Maximum number of log files',
  'SQL0973N': 'Table space is full'
};

/**
 * Error type classification
 */
const ERROR_TYPES = {
  CONNECTION: 'connection',
  AUTHENTICATION: 'authentication',
  PERMISSION: 'permission',
  DATA: 'data',
  SYNTAX: 'syntax',
  RESOURCE: 'resource',
  UNKNOWN: 'unknown'
};

/**
 * DB2 error handler with code mapping and sensitive data masking
 *
 * @example
 * import { ErrorHandler } from '@rescor-llc/core-db';
 *
 * try {
 *   await operations.query('INSERT ...');
 * } catch (err) {
 *   const handled = ErrorHandler.handle(err, { isDevelopment: false });
 *   console.error(handled.userMessage);  // Safe for end users
 * }
 */
export class ErrorHandler {
  /**
   * Handle a database error
   *
   * @param {Error} error - Original error
   * @param {Object} options - Handling options
   * @param {boolean} options.isDevelopment - Show technical details (default: false)
   * @param {string[]} options.sensitiveFields - Fields to mask in errors
   * @param {boolean} options.includeStack - Include stack trace (default: false)
   * @returns {Object} - Handled error with user/technical messages
   */
  static handle(error, options = {}) {
    const {
      isDevelopment = false,
      sensitiveFields = ['password', 'pwd', 'api_key', 'token', 'secret'],
      includeStack = false
    } = options;

    // Extract SQL code
    const sqlCode = error.code || error.sqlcode || error.state;
    const sqlState = error.sqlstate || error.state;

    // Get error type and mapping
    const errorType = this.classifyError(sqlCode, sqlState);
    const mappedMessage = this.mapError(sqlCode, sqlState);

    // Create appropriate error instance
    const handledError = this.createTypedError(
      error,
      errorType,
      mappedMessage,
      sqlCode
    );

    // Generate messages
    const userMessage = this.getUserMessage(handledError, isDevelopment);
    const technicalMessage = this.getTechnicalMessage(
      error,
      sqlCode,
      sqlState,
      isDevelopment
    );

    // Mask sensitive data
    const maskedUserMessage = this.maskSensitiveData(userMessage, sensitiveFields);
    const maskedTechnicalMessage = isDevelopment
      ? this.maskSensitiveData(technicalMessage, sensitiveFields)
      : null;

    return {
      error: handledError,
      type: errorType,
      code: sqlCode,
      state: sqlState,
      userMessage: maskedUserMessage,
      technicalMessage: maskedTechnicalMessage,
      stack: includeStack ? error.stack : null,
      timestamp: new Date()
    };
  }

  /**
   * Map SQL code to user-friendly message
   *
   * @param {string|number} sqlCode - SQL code
   * @param {string} sqlState - SQL state
   * @returns {string} - User-friendly message
   */
  static mapError(sqlCode, sqlState) {
    // Check explicit mapping
    if (sqlCode && DB2_ERROR_MAPPINGS[sqlCode]) {
      return DB2_ERROR_MAPPINGS[sqlCode];
    }

    // Check SQLSTATE pattern
    if (sqlState) {
      // Connection errors (08xxx)
      if (sqlState.startsWith('08')) {
        return 'Database connection error';
      }

      // Data exception (22xxx)
      if (sqlState.startsWith('22')) {
        return 'Invalid data format';
      }

      // Integrity constraint violation (23xxx)
      if (sqlState.startsWith('23')) {
        return 'Data integrity constraint violated';
      }

      // Invalid authorization (28xxx)
      if (sqlState.startsWith('28')) {
        return 'Authentication failed';
      }

      // Syntax error (42xxx)
      if (sqlState.startsWith('42')) {
        return 'SQL syntax error';
      }
    }

    return 'Database operation failed';
  }

  /**
   * Classify error type
   *
   * @param {string|number} sqlCode - SQL code
   * @param {string} sqlState - SQL state
   * @returns {string} - Error type
   */
  static classifyError(sqlCode, sqlState) {
    // Check SQLSTATE
    if (sqlState) {
      if (sqlState.startsWith('08')) return ERROR_TYPES.CONNECTION;
      if (sqlState.startsWith('28')) return ERROR_TYPES.AUTHENTICATION;
      if (sqlState.startsWith('42')) return ERROR_TYPES.SYNTAX;
      if (sqlState.startsWith('23')) return ERROR_TYPES.DATA;
    }

    // Check SQL code patterns
    if (sqlCode) {
      const code = String(sqlCode);

      if (code.includes('551') || code.includes('552') || code.includes('553')) {
        return ERROR_TYPES.PERMISSION;
      }

      if (code.includes('803') || code.includes('530') || code.includes('532')) {
        return ERROR_TYPES.DATA;
      }

      if (code.includes('104') || code.includes('206')) {
        return ERROR_TYPES.SYNTAX;
      }

      if (code.includes('902') || code.includes('954')) {
        return ERROR_TYPES.RESOURCE;
      }

      if (code.includes('1001') || code.includes('1024')) {
        return ERROR_TYPES.CONNECTION;
      }
    }

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Create typed error instance
   *
   * @param {Error} original - Original error
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @param {string|number} code - SQL code
   * @returns {DatabaseError} - Typed error
   */
  static createTypedError(original, type, message, code) {
    switch (type) {
      case ERROR_TYPES.CONNECTION:
        return new ConnectionError(message, code, original);

      case ERROR_TYPES.DATA:
        if (code && String(code).includes('803')) {
          return new DuplicateRecord(message, code);
        }
        if (code && String(code).includes('100')) {
          return new NoResults(message, code);
        }
        return new DatabaseError(message, code, original);

      default:
        return new QueryError(message, code, original);
    }
  }

  /**
   * Get user-friendly message
   *
   * @param {Error} error - Error instance
   * @param {boolean} isDevelopment - Include details
   * @returns {string} - User message
   */
  static getUserMessage(error, isDevelopment) {
    if (isDevelopment && error.code) {
      return `${error.message} (${error.code})`;
    }
    return error.message;
  }

  /**
   * Get technical message for developers
   *
   * @param {Error} error - Original error
   * @param {string|number} sqlCode - SQL code
   * @param {string} sqlState - SQL state
   * @param {boolean} isDevelopment - Show details
   * @returns {string} - Technical message
   */
  static getTechnicalMessage(error, sqlCode, sqlState, isDevelopment) {
    if (!isDevelopment) {
      return null;
    }

    const parts = [];

    if (error.message) {
      parts.push(`Message: ${error.message}`);
    }

    if (sqlCode) {
      parts.push(`SQLCODE: ${sqlCode}`);
    }

    if (sqlState) {
      parts.push(`SQLSTATE: ${sqlState}`);
    }

    if (error.sql) {
      parts.push(`SQL: ${error.sql}`);
    }

    return parts.join(' | ');
  }

  /**
   * Mask sensitive data in error messages
   *
   * @param {string} message - Error message
   * @param {string[]} sensitiveFields - Fields to mask
   * @returns {string} - Masked message
   */
  static maskSensitiveData(message, sensitiveFields) {
    if (!message) {
      return message;
    }

    let masked = message;

    for (const field of sensitiveFields) {
      // Mask field=value patterns
      const regex = new RegExp(`${field}\\s*=\\s*'([^']*)'`, 'gi');
      masked = masked.replace(regex, `${field}='***'`);

      // Mask field: value patterns
      const colonRegex = new RegExp(`${field}:\\s*([^,}\\s]+)`, 'gi');
      masked = masked.replace(colonRegex, `${field}: ***`);

      // Mask "field" = "value" patterns
      const quotedRegex = new RegExp(`"${field}"\\s*=\\s*"([^"]*)"`, 'gi');
      masked = masked.replace(quotedRegex, `"${field}" = "***"`);
    }

    return masked;
  }

  /**
   * Check if error is retryable
   *
   * @param {Error} error - Error to check
   * @returns {boolean} - True if operation can be retried
   */
  static isRetryable(error) {
    const code = String(error.code || error.sqlcode || '');

    // Deadlock/timeout - can retry
    if (code.includes('911') || code.includes('913')) {
      return true;
    }

    // Connection lost - can retry
    if (code.includes('1024') || code.includes('30080')) {
      return true;
    }

    // Resource limit - might be transient
    if (code.includes('954')) {
      return true;
    }

    return false;
  }

  /**
   * Get recommended action for error
   *
   * @param {Error} error - Error instance
   * @returns {string} - Recommended action
   */
  static getRecommendedAction(error) {
    const code = String(error.code || error.sqlcode || '');

    if (code.includes('803')) {
      return 'Record already exists. Use UPDATE instead of INSERT, or check for existing record first.';
    }

    if (code.includes('530') || code.includes('532')) {
      return 'Foreign key constraint violation. Ensure referenced record exists.';
    }

    if (code.includes('551') || code.includes('552')) {
      return 'Insufficient permissions. Contact database administrator to grant necessary privileges.';
    }

    if (code.includes('911') || code.includes('913')) {
      return 'Deadlock or timeout detected. Retry the operation.';
    }

    if (code.includes('204')) {
      return 'Object does not exist. Verify table/column names and schema.';
    }

    if (code.includes('1024')) {
      return 'Database connection lost. Reconnect and retry.';
    }

    return 'Review error details and contact support if issue persists.';
  }
}

/**
 * Export error type constants
 */
export { ERROR_TYPES };
