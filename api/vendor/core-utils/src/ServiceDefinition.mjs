/**
 * ServiceDefinition - Represents a managed service configuration
 *
 * @module @rescor-llc/core-utils/ServiceDefinition
 *
 * Supports multiple service types:
 * - docker-compose: Services managed via docker-compose
 * - npm: Node.js apps run via npm scripts
 * - external: External services (health check only)
 */

export class ServiceDefinition {
  /**
   * Create a service definition
   *
   * @param {string} name - Service name (e.g., 'infisical', 'api')
   * @param {object} config - Service configuration
   * @param {string} config.type - Service type (docker-compose, npm, external)
   * @param {string} [config.service] - Docker compose service name
   * @param {string} [config.script] - npm script name
   * @param {string} [config.cwd] - Working directory
   * @param {string|object} [config.healthCheck] - Health check URL or config
   * @param {boolean} [config.required=true] - Is service critical?
   * @param {string[]} [config.dependsOn=[]] - Service dependencies
   * @param {object} [config.env={}] - Environment variables
   * @param {number} [config.startupTimeout=30000] - Startup timeout (ms)
   * @param {number} [config.healthCheckInterval=2000] - Health check interval (ms)
   */
  constructor(name, config) {
    this.name = name;
    this.type = config.type;
    this.service = config.service || name;
    this.script = config.script;
    this.cwd = config.cwd;
    this.healthCheck = config.healthCheck;
    this.required = config.required !== false; // Default true
    this.dependsOn = config.dependsOn || [];
    this.env = config.env || {};
    this.startupTimeout = config.startupTimeout || 30000;
    this.healthCheckInterval = config.healthCheckInterval || 2000;
    this.composePath = config.composePath; // Path to docker-compose.yml
    this.origin = config.origin || 'project'; // 'core' or 'project'

    // Validate configuration
    this.validate();
  }

  /**
   * Validate service configuration
   * @throws {Error} If configuration is invalid
   */
  validate() {
    const validTypes = ['docker-compose', 'npm', 'external'];
    if (!validTypes.includes(this.type)) {
      throw new Error(`Invalid service type '${this.type}' for ${this.name}. Must be one of: ${validTypes.join(', ')}`);
    }

    if (this.type === 'docker-compose' && !this.composePath) {
      throw new Error(`Service ${this.name}: docker-compose type requires 'composePath'`);
    }

    if (this.type === 'npm' && !this.script) {
      throw new Error(`Service ${this.name}: npm type requires 'script'`);
    }

    if (!this.healthCheck) {
      throw new Error(`Service ${this.name}: healthCheck is required`);
    }
  }

  /**
   * Parse health check configuration
   * @returns {object} Parsed health check config
   */
  getHealthCheckConfig() {
    if (typeof this.healthCheck === 'string') {
      // Parse URL-style health checks
      // Examples:
      //   http://localhost:3000/api/status
      //   tcp://thorium.rescor.net:50000
      const url = new URL(this.healthCheck);

      return {
        type: url.protocol.replace(':', ''),
        host: url.hostname,
        port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        timeout: this.healthCheckInterval
      };
    }

    // Already an object
    return {
      timeout: this.healthCheckInterval,
      ...this.healthCheck
    };
  }

  /**
   * Get absolute working directory
   * @param {string} projectRoot - Project root directory
   * @returns {string} Absolute path
   */
  getWorkingDirectory(projectRoot) {
    if (!this.cwd) {
      return projectRoot;
    }

    if (this.cwd.startsWith('/')) {
      return this.cwd;
    }

    return `${projectRoot}/${this.cwd}`;
  }

  /**
   * Check if this service depends on another
   * @param {string} serviceName - Service to check
   * @returns {boolean}
   */
  dependsOnService(serviceName) {
    return this.dependsOn.includes(serviceName);
  }

  /**
   * Get service metadata for display
   * @returns {object}
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      required: this.required,
      dependsOn: this.dependsOn,
      healthCheck: this.healthCheck,
      origin: this.origin
    };
  }

  /**
   * Create from YAML configuration
   * @param {string} name - Service name
   * @param {object} yaml - YAML configuration object
   * @returns {ServiceDefinition}
   */
  static fromYAML(name, yaml) {
    return new ServiceDefinition(name, yaml);
  }
}
