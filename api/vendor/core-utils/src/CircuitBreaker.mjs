/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascade failures by stopping requests to failing services
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 *
 * @example
 * const breaker = new CircuitBreaker('database', {
 *   failureThreshold: 5,      // Open after 5 failures
 *   windowMs: 60000,          // In 60 second window
 *   resetTimeoutMs: 30000     // Try recovery after 30 seconds
 * });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await database.query('SELECT 1');
 *   });
 * } catch (err) {
 *   if (err.name === 'CircuitBreakerOpenError') {
 *     // Circuit is open, use fallback
 *     return getCachedData();
 *   }
 *   throw err;
 * }
 */

export class CircuitBreakerOpenError extends Error {
  constructor(serviceName, openedAt) {
    super(`Circuit breaker OPEN for service: ${serviceName} (opened at ${openedAt.toISOString()})`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.openedAt = openedAt;
  }
}

export class CircuitBreaker {
  /**
   * Create a circuit breaker
   * @param {string} serviceName - Name of the service being protected
   * @param {object} options - Configuration options
   * @param {number} options.failureThreshold - Number of failures before opening (default: 5)
   * @param {number} options.windowMs - Time window for counting failures (default: 60000ms)
   * @param {number} options.resetTimeoutMs - Time to wait before trying again (default: 30000ms)
   * @param {number} options.successThreshold - Successes needed to close from half-open (default: 2)
   */
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.windowMs = options.windowMs || 60000;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;
    this.successThreshold = options.successThreshold || 2;

    // State tracking
    this.failures = [];
    this.successes = 0;
    this.openedAt = null;
    this.nextAttemptAt = null;

    // Statistics
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0
    };
  }

  /**
   * Get current state
   * @returns {string} Current state (CLOSED, OPEN, HALF_OPEN)
   */
  getState() {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.nextAttemptAt && Date.now() >= this.nextAttemptAt) {
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    return this.state;
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   * @throws {CircuitBreakerOpenError} If circuit is open
   */
  async execute(fn) {
    this.stats.totalCalls++;

    const state = this.getState();

    // Reject if circuit is open
    if (state === 'OPEN') {
      this.stats.totalRejected++;
      throw new CircuitBreakerOpenError(this.serviceName, this.openedAt);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Record a successful call
   * @private
   */
  onSuccess() {
    this.stats.totalSuccesses++;

    if (this.state === 'HALF_OPEN') {
      this.successes++;

      // Close circuit if we've had enough successes
      if (this.successes >= this.successThreshold) {
        this.close();
      }
    }

    // Clean up old failures
    this.cleanup();
  }

  /**
   * Record a failed call
   * @private
   */
  onFailure() {
    this.stats.totalFailures++;
    this.failures.push(Date.now());
    this.cleanup();

    // Open circuit if failure threshold exceeded
    const recentFailures = this.failures.filter(
      t => Date.now() - t < this.windowMs
    );

    if (recentFailures.length >= this.failureThreshold) {
      this.open();
    }
  }

  /**
   * Force circuit to OPEN state
   */
  open() {
    if (this.state === 'OPEN') return;

    this.state = 'OPEN';
    this.openedAt = new Date();
    this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
    this.successes = 0;
  }

  /**
   * Force circuit to CLOSED state
   */
  close() {
    this.state = 'CLOSED';
    this.openedAt = null;
    this.nextAttemptAt = null;
    this.successes = 0;
    this.failures = [];
  }

  /**
   * Force circuit to HALF_OPEN state (for testing)
   */
  halfOpen() {
    this.state = 'HALF_OPEN';
    this.successes = 0;
  }

  /**
   * Remove old failure timestamps outside the window
   * @private
   */
  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    this.failures = this.failures.filter(t => t > cutoff);
  }

  /**
   * Get circuit breaker statistics
   * @returns {object} Statistics object
   */
  getStats() {
    const state = this.getState();

    return {
      serviceName: this.serviceName,
      state,
      openedAt: this.openedAt,
      nextAttemptAt: state === 'OPEN' ? new Date(this.nextAttemptAt) : null,
      recentFailures: this.failures.filter(t => Date.now() - t < this.windowMs).length,
      successesInHalfOpen: this.successes,
      stats: { ...this.stats }
    };
  }

  /**
   * Reset all statistics and state
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.successes = 0;
    this.openedAt = null;
    this.nextAttemptAt = null;
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0
    };
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers by service name
 */
export class CircuitBreakerManager {
  constructor(defaultOptions = {}) {
    this.breakers = new Map();
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a circuit breaker for a service
   * @param {string} serviceName - Service name
   * @param {object} options - Optional configuration (uses defaults if not provided)
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getBreaker(serviceName, options = null) {
    if (!this.breakers.has(serviceName)) {
      const breakerOptions = options || this.defaultOptions;
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, breakerOptions));
    }
    return this.breakers.get(serviceName);
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {string} serviceName - Service name
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   */
  async execute(serviceName, fn) {
    const breaker = this.getBreaker(serviceName);
    return breaker.execute(fn);
  }

  /**
   * Get statistics for all circuit breakers
   * @returns {Array<object>} Array of statistics objects
   */
  getAllStats() {
    return Array.from(this.breakers.values()).map(breaker => breaker.getStats());
  }

  /**
   * Get statistics for a specific service
   * @param {string} serviceName - Service name
   * @returns {object|null} Statistics object or null if breaker doesn't exist
   */
  getStats(serviceName) {
    const breaker = this.breakers.get(serviceName);
    return breaker ? breaker.getStats() : null;
  }

  /**
   * Reset a specific circuit breaker
   * @param {string} serviceName - Service name
   */
  reset(serviceName) {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Check if any circuit breakers are open
   * @returns {boolean} True if any breakers are open
   */
  hasOpenCircuits() {
    for (const breaker of this.breakers.values()) {
      if (breaker.getState() === 'OPEN') {
        return true;
      }
    }
    return false;
  }
}

export default CircuitBreaker;
