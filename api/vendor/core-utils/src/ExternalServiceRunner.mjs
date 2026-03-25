/**
 * ExternalServiceRunner - Monitor external services
 *
 * @module @rescor-llc/core-utils/ExternalServiceRunner
 *
 * Monitors external services (DB2, remote APIs, etc.) that cannot be started/stopped
 * but can be health checked.
 */

import { checkHttpEndpoint, checkTcpPort } from './HealthCheck.mjs';

export class ExternalServiceRunner {
  /**
   * Create an external service runner
   *
   * @param {ServiceDefinition} service - Service definition
   * @param {object} [options={}] - Runner options
   * @param {Recorder} [options.recorder] - Event recorder
   */
  constructor(service, options = {}) {
    this.service = service;
    this.recorder = options.recorder;
    this.state = 'external';
  }

  /**
   * Start operation (not supported for external services)
   * @returns {Promise<object>} Status result
   */
  async start() {
    if (this.recorder) {
      this.recorder.emit(11020, 'w', `Cannot start external service: ${this.service.name}`, {
        service: this.service.name
      });
    }

    // Check if already reachable
    const status = await this.status();

    return {
      success: status.healthy,
      service: this.service.name,
      state: 'external',
      healthy: status.healthy,
      message: status.healthy
        ? 'External service is reachable'
        : 'External service is not reachable'
    };
  }

  /**
   * Stop operation (not supported for external services)
   * @returns {Promise<object>} Status result
   */
  async stop() {
    if (this.recorder) {
      this.recorder.emit(11021, 'w', `Cannot stop external service: ${this.service.name}`, {
        service: this.service.name
      });
    }

    return {
      success: true,
      service: this.service.name,
      state: 'external',
      message: 'External services cannot be stopped'
    };
  }

  /**
   * Restart operation (not supported for external services)
   * @returns {Promise<object>} Status result
   */
  async restart() {
    if (this.recorder) {
      this.recorder.emit(11022, 'w', `Cannot restart external service: ${this.service.name}`, {
        service: this.service.name
      });
    }

    return await this.start();
  }

  /**
   * Get service status
   * @returns {Promise<object>} Status information
   */
  async status() {
    try {
      const healthCheck = this.service.getHealthCheckConfig();
      let healthy = false;
      let details = null;

      if (healthCheck.type === 'http' || healthCheck.type === 'https') {
        const url = `${healthCheck.type}://${healthCheck.host}:${healthCheck.port}${healthCheck.path || ''}`;
        const result = await checkHttpEndpoint({ url, timeout: healthCheck.timeout });
        healthy = result.healthy;
        details = result;
      } else if (healthCheck.type === 'tcp') {
        const result = await checkTcpPort({ host: healthCheck.host, port: healthCheck.port, timeout: healthCheck.timeout });
        healthy = result.healthy;
        details = result;
      } else {
        throw new Error(`Unsupported health check type: ${healthCheck.type}`);
      }

      if (this.recorder && healthy) {
        this.recorder.emit(11023, 'i', `External service reachable: ${this.service.name}`, {
          service: this.service.name,
          healthCheck: this.service.healthCheck
        });
      } else if (this.recorder && !healthy) {
        this.recorder.emit(11024, 'w', `External service unreachable: ${this.service.name}`, {
          service: this.service.name,
          healthCheck: this.service.healthCheck
        });
      }

      return {
        service: this.service.name,
        type: 'external',
        state: 'external',
        healthy,
        healthCheck: this.service.healthCheck,
        required: this.service.required,
        dependsOn: this.service.dependsOn,
        details
      };
    } catch (error) {
      if (this.recorder) {
        this.recorder.emit(11025, 'e', `External service check error: ${this.service.name}`, {
          service: this.service.name,
          error: error.message
        });
      }

      return {
        service: this.service.name,
        type: 'external',
        state: 'external',
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get service logs (not supported for external services)
   * @returns {Promise<string>} Empty string
   */
  async logs() {
    return 'External services do not provide logs';
  }

  /**
   * Wait for service to be healthy
   * @param {number} [timeout] - Timeout in milliseconds
   * @returns {Promise<boolean>}
   */
  async waitForHealthy(timeout) {
    const maxWait = timeout || this.service.startupTimeout;
    const interval = this.service.healthCheckInterval;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await this.status();
      if (status.healthy) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }
}
