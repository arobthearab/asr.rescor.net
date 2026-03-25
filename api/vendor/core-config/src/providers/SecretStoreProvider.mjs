/**
 * SecretStoreProvider.mjs
 *
 * Abstract base class for secret store providers.
 * All concrete providers (Infisical, AWS, Azure, etc.) must implement this interface.
 *
 * @module @rescor-llc/core-config/providers/SecretStoreProvider
 */

/**
 * Abstract base class for secret storage providers.
 *
 * Provides a unified interface for managing secrets across different backends:
 * - Infisical
 * - AWS Secrets Manager
 * - AWS Systems Manager Parameter Store
 * - Azure Key Vault
 * - Environment variables (.env files)
 *
 * @abstract
 * @class SecretStoreProvider
 *
 * @example
 * class InfisicalProvider extends SecretStoreProvider {
 *   async connect(config) {
 *     this.client = new InfisicalSDK({ siteUrl: config.host });
 *     await this.client.auth().universalAuth.login({
 *       clientId: config.auth.clientId,
 *       clientSecret: config.auth.clientSecret
 *     });
 *   }
 *
 *   async setItem(domain, key, value, type) {
 *     await this.client.secrets().create({
 *       projectId: this.projectId,
 *       environment: this.environment,
 *       secretPath: `/${domain}`,
 *       secretKey: key,
 *       secretValue: value
 *     });
 *   }
 * }
 */
export class SecretStoreProvider {
  /**
   * Create a new SecretStoreProvider instance.
   *
   * @param {Object} config - Provider-specific configuration
   * @param {string} config.name - Provider name (e.g., 'infisical', 'aws-sm')
   * @param {Object} [config.connection] - Connection settings (host, credentials, etc.)
   * @param {string} [config.projectId] - Project/workspace identifier
   * @param {string} [config.environment] - Environment name (dev, uat, prod)
   */
  constructor(config = {}) {
    if (new.target === SecretStoreProvider) {
      throw new TypeError('Cannot construct SecretStoreProvider instances directly - must subclass');
    }

    this.name = config.name || 'unknown';
    this.config = config;
    this.connected = false;
  }

  /**
   * Connect to the secret store backend.
   *
   * Must be called before any other operations.
   *
   * @abstract
   * @param {Object} config - Connection configuration (provider-specific)
   * @returns {Promise<void>}
   * @throws {Error} If connection fails
   *
   * @example
   * // Infisical
   * await provider.connect({
   *   host: 'http://localhost:3000',
   *   auth: {
   *     clientId: '...',
   *     clientSecret: '...'
   *   },
   *   projectId: '612c1f10-3c10-470b-901a-23e02baf1ced',
   *   environment: 'dev'
   * });
   *
   * // AWS Secrets Manager
   * await provider.connect({
   *   region: 'us-east-1',
   *   credentials: {
   *     accessKeyId: '...',
   *     secretAccessKey: '...'
   *   }
   * });
   */
  async connect(config) {
    throw new Error(`${this.constructor.name} must implement connect(config)`);
  }

  /**
   * Disconnect from the secret store backend.
   *
   * Cleanup resources, close connections, etc.
   *
   * @abstract
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error(`${this.constructor.name} must implement disconnect()`);
  }

  /**
   * Create a new domain (namespace/folder) in the secret store.
   *
   * Domains organize secrets into logical groups (e.g., 'database', 'api', 'idp').
   *
   * @abstract
   * @param {string} domain - Domain name to create
   * @param {Object} [options] - Provider-specific options
   * @returns {Promise<void>}
   * @throws {Error} If domain creation fails
   *
   * @example
   * await provider.createDomain('database');
   * await provider.createDomain('api', { description: 'API credentials' });
   */
  async createDomain(domain, options = {}) {
    throw new Error(`${this.constructor.name} must implement createDomain(domain, options)`);
  }

  /**
   * Check if a domain exists.
   *
   * @abstract
   * @param {string} domain - Domain name to check
   * @returns {Promise<boolean>} True if domain exists
   */
  async domainExists(domain) {
    throw new Error(`${this.constructor.name} must implement domainExists(domain)`);
  }

  /**
   * Set (create or update) a secret item.
   *
   * @abstract
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @param {string} value - Item value
   * @param {string} [type='secret'] - Item type ('secret' or 'configuration')
   * @param {Object} [options] - Provider-specific options
   * @returns {Promise<void>}
   * @throws {Error} If item cannot be set
   *
   * @example
   * await provider.setItem('database', 'hostname', 'thorium.rescor.net', 'configuration');
   * await provider.setItem('database', 'password', 'MicroFails1', 'secret');
   */
  async setItem(domain, key, value, type = 'secret', options = {}) {
    throw new Error(`${this.constructor.name} must implement setItem(domain, key, value, type, options)`);
  }

  /**
   * Get a secret item value.
   *
   * @abstract
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<string|null>} Item value, or null if not found
   *
   * @example
   * const hostname = await provider.getItem('database', 'hostname');
   */
  async getItem(domain, key) {
    throw new Error(`${this.constructor.name} must implement getItem(domain, key)`);
  }

  /**
   * Delete a secret item.
   *
   * @abstract
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<boolean>} True if item was deleted, false if not found
   *
   * @example
   * await provider.deleteItem('database', 'old_password');
   */
  async deleteItem(domain, key) {
    throw new Error(`${this.constructor.name} must implement deleteItem(domain, key)`);
  }

  /**
   * List all domains.
   *
   * @abstract
   * @returns {Promise<string[]>} Array of domain names
   *
   * @example
   * const domains = await provider.listDomains();
   * // ['database', 'api', 'idp']
   */
  async listDomains() {
    throw new Error(`${this.constructor.name} must implement listDomains()`);
  }

  /**
   * List all keys in a domain.
   *
   * @abstract
   * @param {string} domain - Domain name
   * @returns {Promise<Object[]>} Array of items with { key, type } properties
   *
   * @example
   * const items = await provider.listKeys('database');
   * // [
   * //   { key: 'hostname', type: 'configuration' },
   * //   { key: 'password', type: 'secret' }
   * // ]
   */
  async listKeys(domain) {
    throw new Error(`${this.constructor.name} must implement listKeys(domain)`);
  }

  /**
   * Export all secrets from the store (for backup).
   *
   * @abstract
   * @returns {Promise<Object>} Backup data structure
   *
   * @example
   * const backup = await provider.exportAll();
   * // {
   * //   provider: 'infisical',
   * //   timestamp: '2026-02-20T12:00:00Z',
   * //   domains: {
   * //     database: {
   * //       hostname: { value: 'thorium.rescor.net', type: 'configuration' },
   * //       password: { value: 'MicroFails1', type: 'secret' }
   * //     }
   * //   }
   * // }
   */
  async exportAll() {
    throw new Error(`${this.constructor.name} must implement exportAll()`);
  }

  /**
   * Import secrets into the store (for restore).
   *
   * @abstract
   * @param {Object} data - Backup data structure from exportAll()
   * @param {Object} [options] - Import options
   * @param {boolean} [options.overwrite=false] - Overwrite existing items
   * @param {boolean} [options.dryRun=false] - Show what would be imported without applying
   * @returns {Promise<Object>} Import summary { created, updated, skipped, errors }
   *
   * @example
   * const summary = await provider.importAll(backup, { overwrite: true });
   * // { created: 5, updated: 2, skipped: 0, errors: 0 }
   */
  async importAll(data, options = {}) {
    throw new Error(`${this.constructor.name} must implement importAll(data, options)`);
  }

  /**
   * Validate connection and credentials.
   *
   * @abstract
   * @returns {Promise<Object>} Validation result { valid, message, details }
   *
   * @example
   * const result = await provider.validate();
   * // { valid: true, message: 'Connected to Infisical', details: { ... } }
   */
  async validate() {
    throw new Error(`${this.constructor.name} must implement validate()`);
  }

  /**
   * Get provider metadata.
   *
   * Returns information about the provider (name, version, capabilities, etc.).
   *
   * @returns {Object} Provider metadata
   *
   * @example
   * const meta = provider.getMetadata();
   * // {
   * //   name: 'infisical',
   * //   version: '1.0.0',
   * //   capabilities: ['domains', 'types', 'export', 'import'],
   * //   connected: true
   * // }
   */
  getMetadata() {
    return {
      name: this.name,
      type: this.constructor.name,
      connected: this.connected,
      capabilities: this._getCapabilities()
    };
  }

  /**
   * Get provider capabilities.
   *
   * Override in subclasses to specify supported features.
   *
   * @protected
   * @returns {string[]} Array of capability names
   */
  _getCapabilities() {
    return [
      'connect',
      'domains',
      'items',
      'list',
      'export',
      'import',
      'validate'
    ];
  }

  /**
   * Check if provider is connected.
   *
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Ensure provider is connected.
   *
   * Helper method that throws if not connected.
   *
   * @protected
   * @throws {Error} If not connected
   */
  _ensureConnected() {
    if (!this.connected) {
      throw new Error(`${this.constructor.name} is not connected - call connect() first`);
    }
  }
}

export default SecretStoreProvider;
