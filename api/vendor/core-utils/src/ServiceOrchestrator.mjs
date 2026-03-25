/**
 * ServiceOrchestrator - Coordinate service lifecycle with dependency resolution
 *
 * @module @rescor-llc/core-utils/ServiceOrchestrator
 *
 * Manages multiple services, resolves dependencies, and coordinates start/stop operations.
 */

import { ServiceRegistry } from './ServiceRegistry.mjs';
import { DockerComposeRunner } from './DockerComposeRunner.mjs';
import { NpmRunner } from './NpmRunner.mjs';
import { ExternalServiceRunner } from './ExternalServiceRunner.mjs';

export class ServiceOrchestrator {
  /**
   * Create a service orchestrator
   *
   * @param {string} projectRoot - Project root directory
   * @param {object} [options={}] - Orchestrator options
   * @param {Recorder} [options.recorder] - Event recorder
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.recorder = options.recorder;
    this.cleanupStale = options.cleanupStale !== false;
    this.registry = null;
    this.runners = new Map();
    this.protectedPids = new Set();
  }

  /**
   * Initialize orchestrator (load service registry)
   * @returns {Promise<ServiceOrchestrator>}
   */
  async initialize() {
    this.registry = await ServiceRegistry.load(this.projectRoot);

    if (this.recorder) {
      this.recorder.emit(11030, 'i', 'Service orchestrator initialized', {
        project: this.registry.projectName,
        serviceCount: this.registry.size,
        services: this.registry.getNames()
      });
    }

    return this;
  }

  /**
   * Create runner for a service
   * @param {ServiceDefinition} service - Service definition
   * @returns {object} Service runner
   * @private
   */
  _createRunner(service) {
    const runnerOptions = {
      recorder: this.recorder,
      cleanupStale: this.cleanupStale,
      protectedPids: this.protectedPids
    };

    switch (service.type) {
      case 'docker-compose':
        return new DockerComposeRunner(service, runnerOptions);
      case 'npm':
        return new NpmRunner(service, runnerOptions);
      case 'external':
        return new ExternalServiceRunner(service, runnerOptions);
      default:
        throw new Error(`Unknown service type: ${service.type}`);
    }
  }

  /**
   * Get or create runner for a service
   * @param {string} serviceName - Service name
   * @returns {object} Service runner
   * @private
   */
  _getRunner(serviceName) {
    if (!this.runners.has(serviceName)) {
      const service = this.registry.get(serviceName);
      if (!service) {
        throw new Error(`Service not found: ${serviceName}`);
      }
      this.runners.set(serviceName, this._createRunner(service));
    }
    return this.runners.get(serviceName);
  }

  /**
   * Start services (with dependency resolution)
   *
   * @param {string|string[]} [services] - Service name(s) or 'all'
   * @returns {Promise<object>} Start results
   */
  async start(services) {
    if (!this.registry) {
      await this.initialize();
    }

    // Determine which services to start
    let servicesToStart = [];

    if (!services || services === 'all') {
      // Start project-defined services and their transitive dependencies
      const projectServiceNames = this.registry.getProjectServiceNames();
      servicesToStart = this._resolveDependencies(projectServiceNames);
    } else if (Array.isArray(services)) {
      // Start specific services with their dependencies
      servicesToStart = this._resolveDependencies(services);
    } else {
      // Single service with dependencies
      servicesToStart = this._resolveDependencies([services]);
    }

    if (this.recorder) {
      this.recorder.emit(11031, 'i', 'Starting services', {
        services: servicesToStart.map(s => s.name),
        count: servicesToStart.length
      });
    }

    const results = [];

    // Start services in dependency order
    for (const service of servicesToStart) {
      try {
        const runner = this._getRunner(service.name);
        const result = await runner.start();
        results.push(result);

        // Protect this service's PID from future sibling cleanup
        if (result.success && result.pid) {
          this.protectedPids.add(result.pid);
          // Also protect child processes listening on this service's port
          const childPids = await this._findServiceChildPids(runner);
          for (const childPid of childPids) {
            this.protectedPids.add(childPid);
          }
        }

        // If required service fails, stop
        if (!result.success && service.required) {
          if (this.recorder) {
            this.recorder.emit(11032, 'e', 'Required service failed to start', {
              service: service.name
            });
          }
          // Stop already-started services
          await this._stopStarted(results);
          throw new Error(`Required service failed to start: ${service.name}`);
        }
      } catch (error) {
        if (this.recorder) {
          this.recorder.emit(11033, 'e', 'Service start error', {
            service: service.name,
            error: error.message
          });
        }
        results.push({
          success: false,
          service: service.name,
          error: error.message
        });

        // Stop on required service failure
        if (service.required) {
          await this._stopStarted(results);
          throw error;
        }
      }
    }

    return {
      success: results.every(r => r.success || !this.registry.get(r.service)?.required),
      results
    };
  }

  /**
   * Stop services (in reverse dependency order)
   *
   * @param {string|string[]} [services] - Service name(s) or 'all'
   * @returns {Promise<object>} Stop results
   */
  async stop(services) {
    if (!this.registry) {
      await this.initialize();
    }

    // Determine which services to stop
    let servicesToStop = [];

    if (!services || services === 'all') {
      // Stop project services and their dependencies in reverse order
      const projectServiceNames = this.registry.getProjectServiceNames();
      servicesToStop = this._resolveDependencies(projectServiceNames).reverse();
    } else if (Array.isArray(services)) {
      servicesToStop = services.map(name => this.registry.get(name)).filter(Boolean);
      servicesToStop.reverse();
    } else {
      servicesToStop = [this.registry.get(services)].filter(Boolean);
    }

    if (this.recorder) {
      this.recorder.emit(11034, 'i', 'Stopping services', {
        services: servicesToStop.map(s => s.name),
        count: servicesToStop.length
      });
    }

    const results = [];

    // Stop services in reverse order
    for (const service of servicesToStop) {
      try {
        // Only stop if runner exists (service was started)
        if (this.runners.has(service.name)) {
          const runner = this._getRunner(service.name);
          const result = await runner.stop();
          results.push(result);
        }
      } catch (error) {
        if (this.recorder) {
          this.recorder.emit(11035, 'w', 'Service stop error', {
            service: service.name,
            error: error.message
          });
        }
        results.push({
          success: false,
          service: service.name,
          error: error.message
        });
      }
    }

    return {
      success: true,
      results
    };
  }

  /**
   * Restart services
   *
   * @param {string|string[]} [services] - Service name(s) or 'all'
   * @returns {Promise<object>} Restart results
   */
  async restart(services) {
    await this.stop(services);
    return await this.start(services);
  }

  /**
   * Get status of all services
   * @returns {Promise<object[]>} Status information
   */
  async status() {
    if (!this.registry) {
      await this.initialize();
    }

    const statuses = [];

    for (const service of this.registry.getAll()) {
      try {
        // Always check status (creates runner if needed)
        const runner = this._getRunner(service.name);
        const status = await runner.status();
        statuses.push(status);
      } catch (error) {
        statuses.push({
          service: service.name,
          type: service.type,
          state: 'error',
          healthy: false,
          error: error.message
        });
      }
    }

    return statuses;
  }

  /**
   * Get logs for a service
   *
   * @param {string} serviceName - Service name
   * @param {object} [options={}] - Log options
   * @returns {Promise<string>} Log output
   */
  async logs(serviceName, options = {}) {
    const runner = this._getRunner(serviceName);
    return await runner.logs(options);
  }

  /**
   * Resolve dependencies for services
   *
   * @param {string[]} serviceNames - Service names
   * @returns {ServiceDefinition[]} Services in dependency order
   * @private
   */
  _resolveDependencies(serviceNames) {
    const resolved = [];
    const visited = new Set();

    const resolve = (name) => {
      if (visited.has(name)) {
        return;
      }

      const service = this.registry.get(name);
      if (!service) {
        throw new Error(`Service not found: ${name}`);
      }

      visited.add(name);

      // Resolve dependencies first
      for (const depName of service.dependsOn) {
        resolve(depName);
      }

      resolved.push(service);
    };

    for (const name of serviceNames) {
      resolve(name);
    }

    return resolved;
  }

  /**
   * Stop services that were successfully started
   *
   * @param {object[]} results - Start results
   * @private
   */
  async _stopStarted(results) {
    const started = results
      .filter(r => r.success)
      .map(r => r.service)
      .reverse();

    for (const serviceName of started) {
      try {
        const runner = this._getRunner(serviceName);
        await runner.stop();
      } catch (error) {
        // Ignore stop errors during cleanup
      }
    }
  }

  /**
   * Find child PIDs of a running service (port listeners + process tree)
   *
   * @param {NpmRunner} runner - Service runner
   * @returns {Promise<number[]>} Child PIDs to protect
   * @private
   */
  async _findServiceChildPids(runner) {
    const pids = [];

    try {
      const portPids = await runner._findPortListenerPids(runner._getHealthCheckPort());
      for (const pid of portPids) {
        pids.push(pid);
      }
    } catch {
      // ignore — runner may not support port detection
    }

    return pids;
  }

  /**
   * Get service registry
   * @returns {ServiceRegistry}
   */
  getRegistry() {
    return this.registry;
  }
}
