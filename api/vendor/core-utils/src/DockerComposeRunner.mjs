/**
 * DockerComposeRunner - Manage docker-compose services
 *
 * @module @rescor-llc/core-utils/DockerComposeRunner
 *
 * Runs docker-compose services using VitalSigns for health monitoring
 * and state management.
 */

import { createDockerComposeServiceSign } from './VitalSignHelpers.mjs';
import { checkHttpEndpoint, checkTcpPort } from './HealthCheck.mjs';

export class DockerComposeRunner {
  /**
   * Create a docker-compose service runner
   *
   * @param {ServiceDefinition} service - Service definition
   * @param {object} [options={}] - Runner options
   * @param {Recorder} [options.recorder] - Event recorder
   */
  constructor(service, options = {}) {
    this.service = service;
    this.recorder = options.recorder;
    this.vitalSign = null;
    this.state = 'stopped';
  }

  /**
   * Initialize VitalSign for this service
   * @private
   */
  _initializeVitalSign() {
    if (this.vitalSign) {
      return this.vitalSign;
    }

    const healthCheck = this.service.getHealthCheckConfig();
    const composePath = this.service.composePath;
    const cwd = composePath.substring(0, composePath.lastIndexOf('/'));

    this.vitalSign = createDockerComposeServiceSign({
      name: this.service.name,
      host: healthCheck.host || 'localhost',
      port: healthCheck.port || 80,
      cwd,
      startServices: [this.service.service],
      stopServices: [this.service.service],
      checkTimeoutMs: healthCheck.timeout || 2000,
      retryDelayMs: this.service.healthCheckInterval
    });

    return this.vitalSign;
  }

  /**
   * Start the service
   * @returns {Promise<object>} Status result
   */
  async start() {
    try {
      this._initializeVitalSign();

      if (this.recorder) {
        this.recorder.emit(11000, 'i', `Starting docker-compose service: ${this.service.name}`, {
          service: this.service.name,
          type: 'docker-compose'
        });
      }

      // Execute start action (first attempt)
      const startAction = this.vitalSign.getAction('start');
      if (!startAction) {
        throw new Error(`No start action defined for ${this.service.name}`);
      }

      const startResult = await startAction({ attempt: 1 });

      // Check if service is healthy
      const checkAction = this.vitalSign.getAction('check');
      const result = checkAction ? await checkAction() : { state: 'success' };

      if (result.state === 'success') {
        this.state = 'running';

        if (this.recorder) {
          this.recorder.emit(11001, 'i', `Service started successfully: ${this.service.name}`, {
            service: this.service.name,
            duration: result.elapsed
          });
        }

        return {
          success: true,
          service: this.service.name,
          state: 'running',
          elapsed: result.elapsed
        };
      } else {
        this.state = 'failed';

        if (this.recorder) {
          this.recorder.emit(11002, 'e', `Service failed to start: ${this.service.name}`, {
            service: this.service.name,
            error: result.error
          });
        }

        return {
          success: false,
          service: this.service.name,
          state: 'failed',
          error: result.error
        };
      }
    } catch (error) {
      this.state = 'failed';

      if (this.recorder) {
        this.recorder.emit(11002, 'e', `Service start error: ${this.service.name}`, {
          service: this.service.name,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Stop the service
   * @returns {Promise<object>} Status result
   */
  async stop() {
    try {
      this._initializeVitalSign();

      if (this.recorder) {
        this.recorder.emit(11003, 'i', `Stopping docker-compose service: ${this.service.name}`, {
          service: this.service.name
        });
      }

      // Execute stop action
      const stopAction = this.vitalSign.getAction('stop');
      if (!stopAction) {
        throw new Error(`No stop action defined for ${this.service.name}`);
      }

      const result = await stopAction();

      if (result.state === 'success' || result.state === 'soft-fail') {
        this.state = 'stopped';

        if (this.recorder) {
          this.recorder.emit(11004, 'i', `Service stopped successfully: ${this.service.name}`, {
            service: this.service.name,
            duration: result.elapsed
          });
        }

        return {
          success: true,
          service: this.service.name,
          state: 'stopped',
          elapsed: result.elapsed
        };
      } else {
        if (this.recorder) {
          this.recorder.emit(11005, 'w', `Service stop warning: ${this.service.name}`, {
            service: this.service.name,
            error: result.error
          });
        }

        return {
          success: false,
          service: this.service.name,
          state: 'unknown',
          error: result.error
        };
      }
    } catch (error) {
      if (this.recorder) {
        this.recorder.emit(11005, 'w', `Service stop error: ${this.service.name}`, {
          service: this.service.name,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Restart the service
   * @returns {Promise<object>} Status result
   */
  async restart() {
    if (this.recorder) {
      this.recorder.emit(11006, 'i', `Restarting service: ${this.service.name}`, {
        service: this.service.name
      });
    }

    await this.stop();
    return await this.start();
  }

  /**
   * Get service status
   * @returns {Promise<object>} Status information
   */
  async status() {
    try {
      this._initializeVitalSign();

      const checkAction = this.vitalSign.getAction('check');
      const result = checkAction ? await checkAction() : { state: 'unknown' };
      const healthy = result.state === 'success';

      return {
        service: this.service.name,
        type: 'docker-compose',
        state: healthy ? 'running' : 'stopped',
        healthy,
        healthCheck: this.service.healthCheck,
        required: this.service.required,
        dependsOn: this.service.dependsOn,
        details: result
      };
    } catch (error) {
      return {
        service: this.service.name,
        type: 'docker-compose',
        state: 'error',
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get service logs
   * @param {object} [options={}] - Log options
   * @param {boolean} [options.follow=false] - Follow logs
   * @param {number} [options.tail=100] - Number of lines
   * @returns {Promise<string>} Log output
   */
  async logs(options = {}) {
    const { follow = false, tail = 100 } = options;

    const composePath = this.service.composePath;
    const cwd = composePath.substring(0, composePath.lastIndexOf('/'));

    const { runCommand } = await import('./VitalSignHelpers.mjs');

    const args = [
      'logs',
      follow ? '-f' : '',
      `--tail=${tail}`,
      this.service.service
    ].filter(Boolean);

    try {
      const result = await runCommand('docker-compose', args, { cwd });
      return result.stdout || result.stderr || '';
    } catch (error) {
      throw new Error(`Failed to get logs for ${this.service.name}: ${error.message}`);
    }
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
