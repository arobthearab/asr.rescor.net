/**
 * Health Check Utilities
 *
 * Provides standardized health checking for services with retry logic,
 * timeout handling, and aggregation capabilities.
 *
 * @example
 * // Single service check
 * const dbHealth = await checkDatabase({
 *   query: () => db.query('SELECT 1'),
 *   timeout: 3000
 * });
 *
 * // Aggregate multiple checks
 * const aggregator = new HealthAggregator();
 * aggregator.addCheck('database', checkDatabase);
 * aggregator.addCheck('redis', checkRedis);
 * const overall = await aggregator.check();
 */

/**
 * Health check result
 * @typedef {object} HealthCheckResult
 * @property {boolean} healthy - Overall health status
 * @property {string} status - Status string ('UP', 'DOWN', 'DEGRADED')
 * @property {string} [message] - Optional message
 * @property {number} latency - Check latency in milliseconds
 * @property {*} [data] - Optional additional data
 * @property {Error} [error] - Error object if check failed
 */

/**
 * Check TCP port reachability with timeout
 * @param {object} options - Check options
 * @param {string} options.host - Hostname or IP
 * @param {number} options.port - Port number
 * @param {number} [options.timeout=3000] - Timeout in milliseconds
 * @returns {Promise<HealthCheckResult>}
 */
export async function checkTcpPort({ host, port, timeout = 3000 }) {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Try to fetch (most portable way to check TCP)
    const url = `http://${host}:${port}`;
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    }).catch(() => null); // Ignore errors, we just want to know if it's reachable

    clearTimeout(timeoutId);

    const latency = Date.now() - start;

    return {
      healthy: true,
      status: 'UP',
      message: `Port ${port} is reachable`,
      latency,
      data: { host, port, reachable: true }
    };
  } catch (err) {
    const latency = Date.now() - start;

    return {
      healthy: false,
      status: 'DOWN',
      message: err.name === 'AbortError' ? 'Connection timeout' : err.message,
      latency,
      data: { host, port, reachable: false },
      error: err
    };
  }
}

/**
 * Check HTTP endpoint health
 * @param {object} options - Check options
 * @param {string} options.url - Health endpoint URL
 * @param {number} [options.timeout=5000] - Timeout in milliseconds
 * @param {object} [options.expectedStatus=200] - Expected HTTP status code
 * @param {Function} [options.validator] - Optional response validator function
 * @returns {Promise<HealthCheckResult>}
 */
export async function checkHttpEndpoint({ url, timeout = 5000, expectedStatus = 200, validator }) {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout)
    });

    const latency = Date.now() - start;

    if (response.status !== expectedStatus) {
      return {
        healthy: false,
        status: 'DEGRADED',
        message: `Unexpected status: ${response.status}`,
        latency,
        data: { url, status: response.status }
      };
    }

    // Optional custom validation
    if (validator) {
      const body = await response.json();
      const valid = validator(body);

      if (!valid) {
        return {
          healthy: false,
          status: 'DEGRADED',
          message: 'Health check validation failed',
          latency,
          data: { url, body }
        };
      }
    }

    return {
      healthy: true,
      status: 'UP',
      message: 'Endpoint is healthy',
      latency,
      data: { url, status: response.status }
    };
  } catch (err) {
    const latency = Date.now() - start;

    return {
      healthy: false,
      status: 'DOWN',
      message: err.name === 'AbortError' ? 'Request timeout' : err.message,
      latency,
      data: { url },
      error: err
    };
  }
}

/**
 * Check database connection health
 * @param {object} options - Check options
 * @param {Function} options.query - Query function that returns a promise
 * @param {number} [options.timeout=3000] - Timeout in milliseconds
 * @param {string} [options.testQuery='SELECT 1'] - Test query description
 * @returns {Promise<HealthCheckResult>}
 */
export async function checkDatabase({ query, timeout = 3000, testQuery = 'SELECT 1' }) {
  const start = Date.now();

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeout)
    );

    const result = await Promise.race([query(), timeoutPromise]);

    const latency = Date.now() - start;

    return {
      healthy: true,
      status: 'UP',
      message: 'Database is connected',
      latency,
      data: { query: testQuery, connected: true }
    };
  } catch (err) {
    const latency = Date.now() - start;

    return {
      healthy: false,
      status: 'DOWN',
      message: `Database error: ${err.message}`,
      latency,
      data: { query: testQuery, connected: false },
      error: err
    };
  }
}

/**
 * Check memory usage health
 * @param {object} options - Check options
 * @param {number} [options.thresholdPercent=90] - Threshold percentage (0-100)
 * @returns {HealthCheckResult}
 */
export function checkMemory({ thresholdPercent = 90 } = {}) {
  const usage = process.memoryUsage();
  const totalMem = usage.heapTotal;
  const usedMem = usage.heapUsed;
  const percentUsed = (usedMem / totalMem) * 100;

  const healthy = percentUsed < thresholdPercent;

  return {
    healthy,
    status: healthy ? 'UP' : 'DEGRADED',
    message: healthy ? 'Memory usage is normal' : `Memory usage high: ${percentUsed.toFixed(1)}%`,
    latency: 0,
    data: {
      heapUsed: usedMem,
      heapTotal: totalMem,
      percentUsed: percentUsed.toFixed(2),
      external: usage.external,
      rss: usage.rss
    }
  };
}

/**
 * Check disk space health
 * @param {object} options - Check options
 * @param {string} options.path - Path to check
 * @param {number} [options.thresholdPercent=90] - Threshold percentage (0-100)
 * @returns {Promise<HealthCheckResult>}
 */
export async function checkDisk({ path, thresholdPercent = 90 }) {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Use df command (works on Unix-like systems)
    const { stdout } = await execAsync(`df -k "${path}"`);
    const lines = stdout.trim().split('\n');
    const dataLine = lines[1]; // Second line has the data
    const parts = dataLine.split(/\s+/);
    const percentUsed = parseInt(parts[4].replace('%', ''));

    const healthy = percentUsed < thresholdPercent;

    return {
      healthy,
      status: healthy ? 'UP' : 'DEGRADED',
      message: healthy ? 'Disk space is sufficient' : `Disk usage high: ${percentUsed}%`,
      latency: 0,
      data: {
        path,
        percentUsed,
        threshold: thresholdPercent
      }
    };
  } catch (err) {
    return {
      healthy: false,
      status: 'DOWN',
      message: `Failed to check disk space: ${err.message}`,
      latency: 0,
      data: { path },
      error: err
    };
  }
}

/**
 * Health Check Aggregator
 * Aggregates multiple health checks into a single status
 */
export class HealthAggregator {
  constructor() {
    this.checks = new Map();
  }

  /**
   * Add a health check
   * @param {string} name - Check name
   * @param {Function} checkFn - Async function that returns HealthCheckResult
   */
  addCheck(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * Remove a health check
   * @param {string} name - Check name
   */
  removeCheck(name) {
    this.checks.delete(name);
  }

  /**
   * Run all health checks
   * @param {object} options - Options
   * @param {boolean} [options.parallel=true] - Run checks in parallel
   * @returns {Promise<object>} Aggregated health result
   */
  async check({ parallel = true } = {}) {
    const timestamp = new Date().toISOString();
    const results = {};

    if (parallel) {
      // Run all checks in parallel
      const promises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
        try {
          results[name] = await checkFn();
        } catch (err) {
          results[name] = {
            healthy: false,
            status: 'DOWN',
            message: `Check failed: ${err.message}`,
            latency: 0,
            error: err
          };
        }
      });

      await Promise.all(promises);
    } else {
      // Run checks sequentially
      for (const [name, checkFn] of this.checks.entries()) {
        try {
          results[name] = await checkFn();
        } catch (err) {
          results[name] = {
            healthy: false,
            status: 'DOWN',
            message: `Check failed: ${err.message}`,
            latency: 0,
            error: err
          };
        }
      }
    }

    // Aggregate status
    const allHealthy = Object.values(results).every(r => r.healthy);
    const anyUnhealthy = Object.values(results).some(r => !r.healthy);
    const someDegraded = Object.values(results).some(r => r.status === 'DEGRADED');

    let overallStatus;
    if (allHealthy) {
      overallStatus = 'UP';
    } else if (someDegraded && !anyUnhealthy) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'DOWN';
    }

    return {
      status: overallStatus,
      timestamp,
      checks: results,
      healthy: allHealthy
    };
  }

  /**
   * Get health status as HTTP response format
   * @returns {Promise<object>} Response object with status code and body
   */
  async toHttpResponse() {
    const health = await this.check();

    let statusCode;
    switch (health.status) {
      case 'UP':
        statusCode = 200;
        break;
      case 'DEGRADED':
        statusCode = 503; // Service Unavailable but partially working
        break;
      case 'DOWN':
        statusCode = 503;
        break;
      default:
        statusCode = 500;
    }

    return {
      statusCode,
      body: health
    };
  }
}

export default {
  checkTcpPort,
  checkHttpEndpoint,
  checkDatabase,
  checkMemory,
  checkDisk,
  HealthAggregator
};
