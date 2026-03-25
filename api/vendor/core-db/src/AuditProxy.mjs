/**
 * AuditProxy - Proxy wrapper for database operations with auditing and error handling
 *
 * Provides:
 * - Operation auditing (before/after/error logging)
 * - Error handling integration (ErrorHandler)
 * - Permission validation hooks
 * - Performance metrics
 * - Request context tracking
 *
 * @example
 * const ops = new DB2Operations({ schema: 'TCDEV', ... });
 * const proxied = AuditProxy.create(ops, {
 *   recorder,
 *   errorHandler: true,
 *   isDevelopment: false
 * });
 *
 * await proxied.connect();
 * const results = await proxied.query('SELECT ...');  // Automatically logged and error-handled
 */

import { ErrorHandler } from './ErrorHandler.mjs';

/**
 * AuditProxy - Proxy-based auditing and error handling for Operations
 *
 * Uses JavaScript Proxy to intercept all method calls on Operations instances
 */
export class AuditProxy {
  /**
   * Create proxied Operations instance
   *
   * @param {Operations} target - Operations instance to proxy
   * @param {Object} options - Proxy options
   * @param {Recorder} options.recorder - Recorder instance for logging
   * @param {boolean} options.errorHandler - Enable ErrorHandler integration (default: true)
   * @param {boolean} options.isDevelopment - Development mode (default: false)
   * @param {Function} options.beforeOperation - Hook called before operation
   * @param {Function} options.afterOperation - Hook called after operation
   * @param {Function} options.onError - Hook called on error
   * @param {Object} options.context - Request context (user, requestId, etc.)
   * @returns {Proxy<Operations>} - Proxied Operations instance
   */
  static create(target, options = {}) {
    const {
      recorder = null,
      errorHandler = true,
      isDevelopment = false,
      beforeOperation = null,
      afterOperation = null,
      onError = null,
      context = {}
    } = options;

    const proxyHandler = new AuditProxyHandler({
      target,
      recorder,
      errorHandler,
      isDevelopment,
      beforeOperation,
      afterOperation,
      onError,
      context
    });

    return new Proxy(target, proxyHandler);
  }
}

/**
 * AuditProxyHandler - Proxy handler implementing audit logic
 */
class AuditProxyHandler {
  constructor(options) {
    this.target = options.target;
    this.recorder = options.recorder;
    this.errorHandler = options.errorHandler;
    this.isDevelopment = options.isDevelopment;
    this.beforeOperation = options.beforeOperation;
    this.afterOperation = options.afterOperation;
    this.onError = options.onError;
    this.context = options.context;

    // Track operation metrics
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalDuration: 0
    };
  }

  /**
   * Proxy trap for method calls
   */
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);

    // Only intercept methods (not properties)
    if (typeof value !== 'function') {
      return value;
    }

    // Don't intercept internal methods
    if (prop.startsWith('_')) {
      return value.bind(target);
    }

    // Don't intercept getters
    if (prop === 'isConnected' || prop === 'getMetadata') {
      return value.bind(target);
    }

    // Intercept and audit operation methods
    return this._createAuditedMethod(prop, value);
  }

  /**
   * Create audited version of method
   *
   * @param {string} methodName - Method name
   * @param {Function} originalMethod - Original method
   * @returns {Function} - Audited method
   */
  _createAuditedMethod(methodName, originalMethod) {
    const handler = this;

    return async function (...args) {
      const startTime = Date.now();
      const operationId = handler._generateOperationId();

      // Build operation context
      const operationContext = {
        operationId,
        methodName,
        args: handler._sanitizeArgs(args),
        context: handler.context,
        timestamp: new Date()
      };

      try {
        // Before operation hook
        if (handler.beforeOperation) {
          await handler.beforeOperation(operationContext);
        }

        // Log operation start
        handler._logOperationStart(operationContext);

        // Execute operation
        const result = await originalMethod.apply(handler.target, args);

        // Calculate duration
        const duration = Date.now() - startTime;

        // Update metrics
        handler.metrics.totalOperations++;
        handler.metrics.successfulOperations++;
        handler.metrics.totalDuration += duration;

        // After operation hook
        if (handler.afterOperation) {
          await handler.afterOperation(operationContext, result, duration);
        }

        // Log operation success
        handler._logOperationSuccess(operationContext, duration, result);

        return result;

      } catch (err) {
        // Calculate duration
        const duration = Date.now() - startTime;

        // Update metrics
        handler.metrics.totalOperations++;
        handler.metrics.failedOperations++;
        handler.metrics.totalDuration += duration;

        // Handle error via ErrorHandler
        let handledError = err;
        if (handler.errorHandler) {
          const handled = ErrorHandler.handle(err, {
            isDevelopment: handler.isDevelopment,
            includeStack: handler.isDevelopment
          });

          handledError = handled.error;

          // Log detailed error information
          handler._logOperationError(operationContext, duration, handled);
        } else {
          // Log basic error
          handler._logOperationError(operationContext, duration, { error: err });
        }

        // Error hook
        if (handler.onError) {
          await handler.onError(operationContext, handledError, duration);
        }

        // Re-throw handled error
        throw handledError;
      }
    };
  }

  /**
   * Generate unique operation ID
   */
  _generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  _sanitizeArgs(args) {
    if (!args || args.length === 0) {
      return [];
    }

    return args.map(arg => {
      if (typeof arg === 'string') {
        // Mask potential passwords/secrets
        return arg.replace(/password\s*=\s*'[^']*'/gi, "password='***'")
                  .replace(/pwd\s*=\s*'[^']*'/gi, "pwd='***'");
      }
      if (Array.isArray(arg)) {
        // Don't log parameter values (might contain sensitive data)
        return `<${arg.length} params>`;
      }
      if (typeof arg === 'object' && arg !== null) {
        // Mask sensitive object properties
        const sanitized = { ...arg };
        for (const key of Object.keys(sanitized)) {
          if (/password|pwd|secret|token|api[_-]?key/i.test(key)) {
            sanitized[key] = '***';
          }
        }
        return sanitized;
      }
      return arg;
    });
  }

  /**
   * Log operation start
   */
  _logOperationStart(operationContext) {
    if (!this.recorder) return;

    this.recorder.emit(8600, 'i', 'Database operation started', {
      operationId: operationContext.operationId,
      method: operationContext.methodName,
      schema: this.target.schema,
      context: operationContext.context
    });
  }

  /**
   * Log operation success
   */
  _logOperationSuccess(operationContext, duration, result) {
    if (!this.recorder) return;

    const resultSummary = this._summarizeResult(result);

    this.recorder.emit(8601, 'i', 'Database operation succeeded', {
      operationId: operationContext.operationId,
      method: operationContext.methodName,
      schema: this.target.schema,
      duration,
      result: resultSummary,
      context: operationContext.context
    });
  }

  /**
   * Log operation error
   */
  _logOperationError(operationContext, duration, handledError) {
    if (!this.recorder) return;

    const errorInfo = handledError.technicalMessage
      ? {
          userMessage: handledError.userMessage,
          technicalMessage: handledError.technicalMessage,
          type: handledError.type,
          code: handledError.code,
          state: handledError.state
        }
      : {
          message: handledError.error?.message || handledError.message,
          name: handledError.error?.name || handledError.name
        };

    this.recorder.emit(8602, 'e', 'Database operation failed', {
      operationId: operationContext.operationId,
      method: operationContext.methodName,
      schema: this.target.schema,
      duration,
      error: errorInfo,
      context: operationContext.context
    });
  }

  /**
   * Summarize result for logging (avoid logging large datasets)
   */
  _summarizeResult(result) {
    if (result === null || result === undefined) {
      return null;
    }

    if (Array.isArray(result)) {
      return {
        type: 'array',
        length: result.length,
        sample: result.length > 0 ? result[0] : null
      };
    }

    if (typeof result === 'object') {
      return {
        type: 'object',
        keys: Object.keys(result)
      };
    }

    return result;
  }

  /**
   * Get proxy metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageDuration: this.metrics.totalOperations > 0
        ? this.metrics.totalDuration / this.metrics.totalOperations
        : 0,
      successRate: this.metrics.totalOperations > 0
        ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100
        : 0
    };
  }
}

/**
 * Convenience function to wrap Operations with audit proxy
 *
 * @param {Operations} operations - Operations instance
 * @param {Object} options - Proxy options
 * @returns {Proxy<Operations>} - Proxied instance
 */
export function withAudit(operations, options = {}) {
  return AuditProxy.create(operations, options);
}
