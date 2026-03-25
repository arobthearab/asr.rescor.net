/**
 * Neo4jErrorHandler - Neo4j error code mapping and handling
 *
 * Provides:
 * - Neo4j error code to user-friendly message mapping
 * - Sensitive field masking in error messages
 * - Development vs. production error modes
 * - Error classification (connection, permission, data, etc.)
 */

import { DatabaseError, NoResults, DuplicateRecord, ConnectionError, QueryError } from './Operations.mjs';

/**
 * Neo4j error code mappings
 *
 * Maps Neo4j error codes to user-friendly messages
 * Error codes follow pattern: Neo.{Category}.{Classification}.{Title}
 */
const NEO4J_ERROR_MAPPINGS = {
  // Connection/Service errors
  'ServiceUnavailable': 'Database service unavailable',
  'SessionExpired': 'Database session expired',
  'Neo.TransientError.General.DatabaseUnavailable': 'Database temporarily unavailable',

  // Authentication errors
  'Neo.ClientError.Security.Unauthorized': 'Invalid credentials',
  'Neo.ClientError.Security.AuthenticationRateLimit': 'Too many authentication attempts',
  'Neo.ClientError.Security.TokenExpired': 'Authentication token expired',

  // Permission errors
  'Neo.ClientError.Security.Forbidden': 'Insufficient permissions',
  'Neo.ClientError.Security.AuthorizationExpired': 'Authorization expired',
  'Neo.ClientError.Security.CredentialsExpired': 'Credentials expired',

  // Constraint violations (data integrity)
  'Neo.ClientError.Schema.ConstraintValidationFailed': 'Constraint validation failed',
  'Neo.ClientError.Schema.ConstraintViolation': 'Unique constraint violation',
  'Neo.ClientError.Schema.IndexAlreadyExists': 'Index already exists',
  'Neo.ClientError.Schema.IndexDropFailed': 'Cannot drop index',
  'Neo.ClientError.Schema.ConstraintAlreadyExists': 'Constraint already exists',
  'Neo.ClientError.Schema.ConstraintDropFailed': 'Cannot drop constraint',

  // Syntax errors
  'Neo.ClientError.Statement.SyntaxError': 'Cypher syntax error',
  'Neo.ClientError.Statement.SemanticError': 'Cypher semantic error',
  'Neo.ClientError.Statement.ParameterMissing': 'Missing query parameter',
  'Neo.ClientError.Statement.TypeError': 'Type error in query',
  'Neo.ClientError.Statement.ArgumentError': 'Invalid query argument',
  'Neo.ClientError.Statement.EntityNotFound': 'Entity not found',

  // Transaction errors
  'Neo.TransientError.Transaction.DeadlockDetected': 'Transaction deadlock detected',
  'Neo.TransientError.Transaction.LockClientStopped': 'Transaction aborted',
  'Neo.TransientError.Transaction.Terminated': 'Transaction terminated',
  'Neo.TransientError.Transaction.Outdated': 'Transaction outdated',
  'Neo.ClientError.Transaction.InvalidBookmark': 'Invalid transaction bookmark',

  // Resource errors
  'Neo.TransientError.General.OutOfMemoryError': 'Insufficient memory',
  'Neo.TransientError.General.StackOverflowError': 'Stack overflow',
  'Neo.TransientError.Database.DatabaseLimitReached': 'Database limit reached',

  // Data errors
  'Neo.ClientError.Request.Invalid': 'Invalid request',
  'Neo.ClientError.Request.InvalidFormat': 'Invalid request format',
  'Neo.ClientError.Procedure.ProcedureNotFound': 'Procedure not found',
  'Neo.ClientError.Procedure.ProcedureCallFailed': 'Procedure call failed',

  // Database errors
  'Neo.ClientError.Database.DatabaseNotFound': 'Database not found',
  'Neo.ClientError.Database.ExistingDatabaseFound': 'Database already exists'
};

/**
 * Error type classification
 */
export const ERROR_TYPES = {
  CONNECTION: 'connection',
  AUTHENTICATION: 'authentication',
  PERMISSION: 'permission',
  DATA: 'data',
  SYNTAX: 'syntax',
  RESOURCE: 'resource',
  TRANSACTION: 'transaction',
  UNKNOWN: 'unknown'
};

/**
 * Neo4j error handler with code mapping and sensitive data masking
 *
 * @example
 * import { Neo4jErrorHandler } from '@rescor-llc/core-db';
 *
 * try {
 *   await operations.query('CREATE (n:Test {id: $id})', { id: 123 });
 * } catch (err) {
 *   const handled = Neo4jErrorHandler.handle(err, { isDevelopment: false });
 *   console.error(handled.userMessage);  // Safe for end users
 * }
 */
export class Neo4jErrorHandler {
  /**
   * Handle a Neo4j error
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

    // Extract error code and message
    const errorCode = error.code || error.name || 'UNKNOWN';
    const originalMessage = error.message || 'Unknown error';

    // Map to user-friendly message
    const userMessage = this.mapError(errorCode);
    const errorType = this.classifyError(errorCode);

    // Build result object
    const result = {
      userMessage,
      errorType,
      errorCode,
      isDevelopment
    };

    // Add technical details in development mode
    if (isDevelopment) {
      result.technicalMessage = this._maskSensitiveData(originalMessage, sensitiveFields);
      result.originalError = error;

      if (includeStack && error.stack) {
        result.stack = error.stack;
      }
    }

    return result;
  }

  /**
   * Map Neo4j error code to user-friendly message
   *
   * @param {string} code - Neo4j error code or name
   * @returns {string} - User-friendly message
   */
  static mapError(code) {
    // Check exact match first
    if (NEO4J_ERROR_MAPPINGS[code]) {
      return NEO4J_ERROR_MAPPINGS[code];
    }

    // Try prefix match for Neo4j error codes
    const prefix = code.split('.').slice(0, -1).join('.');
    if (prefix && NEO4J_ERROR_MAPPINGS[prefix]) {
      return NEO4J_ERROR_MAPPINGS[prefix];
    }

    // Generic fallback
    return 'A database error occurred';
  }

  /**
   * Classify error type based on error code
   *
   * @param {string} code - Neo4j error code or name
   * @returns {string} - Error type (connection, authentication, etc.)
   */
  static classifyError(code) {
    // Service/Connection errors
    if (code.includes('ServiceUnavailable') ||
        code.includes('SessionExpired') ||
        code.includes('DatabaseUnavailable')) {
      return ERROR_TYPES.CONNECTION;
    }

    // Authentication errors
    if (code.includes('Security.Unauthorized') ||
        code.includes('Security.AuthenticationRateLimit') ||
        code.includes('TokenExpired') ||
        code.includes('CredentialsExpired')) {
      return ERROR_TYPES.AUTHENTICATION;
    }

    // Permission errors
    if (code.includes('Security.Forbidden') ||
        code.includes('Security.AuthorizationExpired')) {
      return ERROR_TYPES.PERMISSION;
    }

    // Syntax errors
    if (code.includes('Statement.SyntaxError') ||
        code.includes('Statement.SemanticError') ||
        code.includes('Statement.TypeError')) {
      return ERROR_TYPES.SYNTAX;
    }

    // Data integrity errors
    if (code.includes('Schema.Constraint') ||
        code.includes('Schema.Index') ||
        code.includes('Statement.EntityNotFound')) {
      return ERROR_TYPES.DATA;
    }

    // Transaction errors
    if (code.includes('Transaction')) {
      return ERROR_TYPES.TRANSACTION;
    }

    // Resource errors
    if (code.includes('OutOfMemoryError') ||
        code.includes('StackOverflowError') ||
        code.includes('DatabaseLimitReached')) {
      return ERROR_TYPES.RESOURCE;
    }

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Convert error to appropriate error class
   *
   * @param {Error} error - Original error
   * @param {Object} options - Conversion options
   * @returns {DatabaseError} - Typed error instance
   */
  static toTypedError(error, options = {}) {
    const handled = this.handle(error, options);
    const errorType = handled.errorType;
    const message = handled.isDevelopment ? handled.technicalMessage : handled.userMessage;
    const code = handled.errorCode;

    switch (errorType) {
      case ERROR_TYPES.CONNECTION:
        return new ConnectionError(message, code, error);

      case ERROR_TYPES.AUTHENTICATION:
      case ERROR_TYPES.PERMISSION:
        return new QueryError(message, code, error);

      case ERROR_TYPES.DATA:
        // Check if it's a constraint violation (duplicate)
        if (code.includes('ConstraintViolation') || code.includes('ConstraintAlreadyExists')) {
          return new DuplicateRecord(message, code);
        }
        // Check if it's a not found error
        if (code.includes('EntityNotFound') || code.includes('NotFound')) {
          return new NoResults(message, code);
        }
        return new QueryError(message, code, error);

      case ERROR_TYPES.SYNTAX:
      case ERROR_TYPES.TRANSACTION:
      case ERROR_TYPES.RESOURCE:
        return new QueryError(message, code, error);

      default:
        return new DatabaseError(message, code, error);
    }
  }

  /**
   * Mask sensitive data in error messages
   *
   * @param {string} message - Error message
   * @param {string[]} sensitiveFields - Fields to mask
   * @returns {string} - Masked message
   * @private
   */
  static _maskSensitiveData(message, sensitiveFields) {
    let masked = message;

    for (const field of sensitiveFields) {
      // Mask field=value patterns
      const regex = new RegExp(`${field}\\s*[:=]\\s*['\"]?([^'\"\\s,}]+)['\"]?`, 'gi');
      masked = masked.replace(regex, `${field}=***`);
    }

    // Mask connection strings with credentials
    masked = masked.replace(/bolt:\/\/([^:]+):([^@]+)@/gi, 'bolt://***:***@');
    masked = masked.replace(/neo4j:\/\/([^:]+):([^@]+)@/gi, 'neo4j://***:***@');

    return masked;
  }
}
