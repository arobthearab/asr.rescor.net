/**
 * Configuration - High-level API for credential and configuration management
 *
 * Phase 2: Supports both unified API (ClassifiedDatum) and legacy API
 *
 * Uses CascadingStore with:
 * - MemoryStore (cache)
 * - InfisicalStore (primary)
 * - EnvironmentStore (fallback)
 */

// InfisicalStore is imported lazily to avoid dependency errors
import { EnvironmentStore } from './stores/EnvironmentStore.mjs';
import { MemoryStore } from './stores/MemoryStore.mjs';
import { CascadingStore } from './stores/CascadingStore.mjs';
import { ClassifiedDatum, ClassifiedData } from './ClassifiedDatum.mjs';
import { Recorder } from '@rescor-llc/core-utils';

export class Configuration {
  /* -------------------------------------------------------------------------- */
  static CODES = {
    INITIALIZING: 6000,
    INITIALIZED: 6001,
    GET_CONFIG: 6002,
    SET_CONFIG: 6003,
    DELETE_CONFIG: 6004,
    CONFIG_NOT_FOUND: 6005,
    INITIALIZATION_FAILED: 6006
  };

  /* -------------------------------------------------------------------------- */
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.log = options.recorder || new Recorder('configuration.log', 'Configuration');
    this.store = null;
    this._initialized = false;

    // Store options for lazy initialization
    this.options = {
      enableCache: options.enableCache ?? true,
      cacheTTL: options.cacheTTL || 3600000, // 1 hour
      enableInfisical: options.enableInfisical ?? true,
      requireInfisical: options.requireInfisical ?? false,
      infisicalOptions: options.infisicalOptions || {},
      envPrefix: options.envPrefix || 'RESCOR',
      ...options
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Indicates whether configuration is initialized.
   * @returns {boolean}
   */
  get isInitialized() {
    return this._initialized && this.store !== null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Initialize the configuration system
   * @returns {Promise<Configuration>}
   */
  async initialize() {
    if (this._initialized) {
      this.log.emit(Configuration.CODES.INITIALIZED, 'i', 'Already initialized');
      return this;
    }

    this.log.emit(Configuration.CODES.INITIALIZING, 'i', 'Initializing configuration system');

    try {
      // If a custom store was provided, use it directly
      if (this.options.store) {
        this.store = this.options.store;
        this._initialized = true;
        this.log.emit(Configuration.CODES.INITIALIZED, 'i', 'Using custom store');
        return this;
      }

      const stores = [];
      let cacheStore = null;
      let primaryStore = null;

      // 1. Memory cache (optional)
      if (this.options.enableCache) {
        cacheStore = new MemoryStore({
          ttl: this.options.cacheTTL,
          recorder: this.log
        });
      }

      // 2. Infisical (primary, if enabled)
      if (this.options.enableInfisical) {
        try {
          // Lazy import to avoid dependency errors when @infisical/sdk is not installed
          const { InfisicalStore } = await import('./stores/InfisicalStore.mjs');
          primaryStore = new InfisicalStore({
            ...this.options.infisicalOptions,
            recorder: this.log
          });
          stores.push(primaryStore);

          this.log.emit(Configuration.CODES.INITIALIZING, 'i', 'Infisical store configured');
        } catch (err) {
          this.log.emit(Configuration.CODES.INITIALIZING, 'w',
            `Infisical initialization failed: ${err.message}, continuing with fallbacks`);

          if (this.options.requireInfisical) {
            this.log.emit(Configuration.CODES.INITIALIZATION_FAILED, 'e',
              `Infisical is required but initialization failed: ${err.message}`);
            throw err;
          }
        }
      }

      // 3. Environment variables (fallback)
      const envStore = new EnvironmentStore({
        prefix: this.options.envPrefix,
        recorder: this.log
      });
      stores.push(envStore);

      // Create cascading store
      this.store = new CascadingStore({
        stores,
        cacheStore,
        primaryStore,
        recorder: this.log
      });

      await this.store.initialize();

      this._initialized = true;
      this.log.emit(Configuration.CODES.INITIALIZED, 'i', 'Configuration system initialized');

      return this;
    } catch (err) {
      this.log.emit(Configuration.CODES.INITIALIZATION_FAILED, 'e',
        `Configuration initialization failed: ${err.message}`);
      throw err;
    }
  }

  // ============================================================================
  // UNIFIED API - Accepts ClassifiedDatum or ClassifiedData
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * Get value(s) using ClassifiedDatum or ClassifiedData
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<string|ClassifiedData>}
   */
  async get(data) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.store.get(data);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Store value(s) using ClassifiedDatum or ClassifiedData
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<Configuration>}
   */
  async set(data) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.store.store(data);
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear value(s) using ClassifiedDatum or ClassifiedData
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<Configuration>}
   */
  async clear(data) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.store.clear(data);
    return this;
  }

  // ============================================================================
  // LEGACY API - Backward compatibility (domain/key strings)
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * Get configuration value (legacy API)
   * @param {string} domain - Domain/namespace
   * @param {string} key - Configuration key
   * @param {Object} options - Options
   * @returns {Promise<string|null>}
   */
  async getConfig(domain, key, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const value = await this.store.getConfiguration(domain, key);

      if (value === null && options.throwOnMissing) {
        throw new Error(`Configuration ${domain}.${key} not found`);
      }

      if (value !== null) {
        this.log.emit(Configuration.CODES.GET_CONFIG, 'd',
          `Retrieved ${domain}.${key}`);
      } else {
        this.log.emit(Configuration.CODES.CONFIG_NOT_FOUND, 'd',
          `Configuration ${domain}.${key} not found`);
      }

      return value;
    } catch (err) {
      this.log.emit(Configuration.CODES.GET_CONFIG, 'e',
        `Failed to get ${domain}.${key}: ${err.message}`);

      if (options.throwOnMissing) {
        throw err;
      }

      return options.default || null;
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set configuration value (legacy API)
   * @param {string} domain - Domain/namespace
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @returns {Promise<Configuration>}
   */
  async setConfig(domain, key, value) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.store.storeConfiguration(domain, key, value);

    this.log.emit(Configuration.CODES.SET_CONFIG, 'i',
      `Set ${domain}.${key}`);

    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Delete configuration value (legacy API)
   * @param {string} domain - Domain/namespace
   * @param {string} key - Configuration key
   * @returns {Promise<Configuration>}
   */
  async deleteConfig(domain, key) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.store.clearConfiguration(domain, key);

    this.log.emit(Configuration.CODES.DELETE_CONFIG, 'i',
      `Deleted ${domain}.${key}`);

    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * List all configuration in a domain (legacy API)
   * @param {string} domain - Domain to list (optional)
   * @returns {Promise<ClassifiedData>}
   */
  async listConfig(domain = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.store._listByDomain(domain);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convenience: Get database configuration
   * @returns {Promise<string|null>}
   */
  async getDb2User() {
    return this.getConfig('database', 'user');
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {Promise<string|null>}
   */
  async getDb2Password() {
    return this.getConfig('database', 'password');
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {Promise<string|null>}
   */
  async getDb2Database() {
    return this.getConfig('database', 'database');
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {Promise<string|null>}
   */
  async getDb2Host() {
    return this.getConfig('database', 'hostname');
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {Promise<string|null>}
   */
  async getDb2Port() {
    return this.getConfig('database', 'port', { default: '50000' });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convenience: Build DB2 connection string
   * @returns {Promise<string>}
   */
  async getDb2ConnectionString() {
    const host = await this.getDb2Host();
    const port = await this.getDb2Port();
    const database = await this.getDb2Database();
    const user = await this.getDb2User();
    const password = await this.getDb2Password();

    return `DATABASE=${database};HOSTNAME=${host};PORT=${port};PROTOCOL=TCPIP;UID=${user};PWD=${password}`;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convenience: Get current phase
   * @returns {Promise<string|null>}
   */
  async getCurrentPhase() {
    return this.getConfig('app', 'phase', { default: 'DEV' });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convenience: Set current phase
   * @param {string} phase
   * @returns {Promise<Configuration>}
   */
  async setCurrentPhase(phase) {
    return this.setConfig('app', 'phase', phase);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Legacy compatibility: getCredential
   * @param {string} domain
   * @param {string} key
   * @param {Object} [options]
   * @returns {Promise<string|null>}
   */
  async getCredential(domain, key, options) {
    return this.getConfig(domain, key, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Legacy compatibility: setCredential
   * @param {string} domain
   * @param {string} key
   * @param {string} value
   * @returns {Promise<Configuration>}
   */
  async setCredential(domain, key, value) {
    return this.setConfig(domain, key, value);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Legacy compatibility: deleteCredential
   * @param {string} domain
   * @param {string} key
   * @returns {Promise<Configuration>}
   */
  async deleteCredential(domain, key) {
    return this.deleteConfig(domain, key);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get information about the configuration system
   * @returns {{initialized:boolean,stores:object|null,options:object}}
   */
  getInfo() {
    return {
      initialized: this.isInitialized,
      stores: this.store ? this.store.getStoreInfo() : null,
      options: {
        enableCache: this.options.enableCache,
        cacheTTL: this.options.cacheTTL,
        enableInfisical: this.options.enableInfisical,
        envPrefix: this.options.envPrefix
      }
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Invalidate cache
   * @returns {Promise<void>}
   */
  async invalidateCache() {
    if (this.isInitialized && this.store) {
      await this.store.invalidateCache();
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Prune expired cache entries
   * @returns {Promise<number>}
   */
  async pruneCache() {
    if (this.isInitialized && this.store) {
      return this.store.pruneCache();
    }
    return 0;
  }
}

// Export singleton instance
export const config = new Configuration();

// Export class for custom instances
export default Configuration;
