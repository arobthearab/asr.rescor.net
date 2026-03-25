/**
 * BaseError - Common base class for all RESCOR errors
 *
 * Provides consistent error structure across all packages:
 * - Error codes
 * - Metadata
 * - Stack traces
 * - Original error preservation
 */

/**
 * Base error class for RESCOR packages
 *
 * All module-specific errors should extend this class to ensure
 * consistent error handling across the system.
 *
 * @example
 * class DatabaseError extends BaseError {
 *   constructor(message, code = null) {
 *     super(message, 'DatabaseError', code);
 *   }
 * }
 */
export class BaseError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} name - Error name (defaults to class name)
   * @param {string|number} code - Error code (optional)
   * @param {Error} originalError - Original error that caused this (optional)
   * @param {Object} metadata - Additional error metadata (optional)
   */
  constructor(message, name = 'BaseError', code = null, originalError = null, metadata = {}) {
    super(message);

    // Set error name
    this.name = name || this.constructor.name;

    // Error code (can be string like 'SQL0803N' or number like 8001)
    this.code = code;

    // Original error if this wraps another error
    this.originalError = originalError;

    // Additional metadata
    this.metadata = metadata;

    // Timestamp
    this.timestamp = new Date();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging
   *
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      metadata: this.metadata,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }

  /**
   * Get user-friendly error message
   *
   * Subclasses can override to provide safe messages for end users
   * (hiding technical details in production)
   *
   * @param {boolean} includeDetails - Include technical details
   * @returns {string}
   */
  getUserMessage(includeDetails = false) {
    if (includeDetails) {
      return `${this.message}${this.code ? ` (${this.code})` : ''}`;
    }
    return this.message;
  }

  /**
   * Check if error is of specific type
   *
   * @param {string|Function} errorType - Error class or name
   * @returns {boolean}
   */
  is(errorType) {
    if (typeof errorType === 'string') {
      return this.name === errorType;
    }
    return this instanceof errorType;
  }
}

/**
 * Common error types that can be extended by any package
 */

export class ValidationError extends BaseError {
  constructor(message, code = null, field = null) {
    super(message, 'ValidationError', code, null, { field });
  }
}

export class NotFoundError extends BaseError {
  constructor(message = 'Resource not found', code = null, resource = null) {
    super(message, 'NotFoundError', code, null, { resource });
  }
}

export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication failed', code = null) {
    super(message, 'AuthenticationError', code);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message = 'Not authorized', code = null, requiredPermission = null) {
    super(message, 'AuthorizationError', code, null, { requiredPermission });
  }
}

export class TimeoutError extends BaseError {
  constructor(message = 'Operation timed out', code = null, timeoutMs = null) {
    super(message, 'TimeoutError', code, null, { timeoutMs });
  }
}

export class NetworkError extends BaseError {
  constructor(message = 'Network error', code = null, originalError = null) {
    super(message, 'NetworkError', code, originalError);
  }
}
