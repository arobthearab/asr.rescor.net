/**
 * EnvironmentProvider.mjs
 *
 * Environment variable secret store provider.
 *
 * Features:
 * - Reads from process.env
 * - Loads .env files if present
 * - Read-only (no write/delete operations)
 * - Fallback tier for local development
 *
 * @module @rescor-llc/core-config/providers/EnvironmentProvider
 */

import fs from 'fs';
import path from 'path';
import { SecretStoreProvider } from './SecretStoreProvider.mjs';

/**
 * Environment variable secret store provider.
 *
 * Provides read-only access to environment variables and .env files.
 * Useful as a fallback tier for local development.
 *
 * @class EnvironmentProvider
 * @extends SecretStoreProvider
 *
 * @example
 * const provider = new EnvironmentProvider({
 *   name: 'environment',
 *   envPath: '.env'
 * });
 *
 * await provider.connect({
 *   projectPrefix: 'TC',  // Read TC_DATABASE_HOSTNAME
 *   loadDotenv: true
 * });
 *
 * const hostname = await provider.getItem('database', 'hostname');
 * // Reads TC_DATABASE_HOSTNAME from process.env
 */
export class EnvironmentProvider extends SecretStoreProvider {
  /**
   * Create a new EnvironmentProvider instance.
   *
   * @param {Object} config - Provider configuration
   * @param {string} [config.envPath='.env'] - Path to .env file
   */
  constructor(config = {}) {
    super({ ...config, name: 'environment' });

    this.envPath = config.envPath || '.env';
    this.projectPrefix = null;
    this.env = { ...process.env };
  }

  /**
   * Connect to environment variables.
   *
   * @param {Object} config - Connection configuration
   * @param {string} [config.projectPrefix] - Project prefix (e.g., 'TC', 'SPM')
   * @param {boolean} [config.loadDotenv=true] - Load .env file if present
   * @param {string} [config.envPath] - Override .env file path
   * @returns {Promise<void>}
   */
  async connect(config = {}) {
    this.projectPrefix = config.projectPrefix || null;

    if (config.loadDotenv !== false) {
      const envPath = config.envPath || this.envPath;
      await this._loadDotenv(envPath);
    }

    this.connected = true;
  }

  /**
   * Load .env file into environment.
   *
   * @private
   * @param {string} envPath - Path to .env file
   * @returns {Promise<void>}
   */
  async _loadDotenv(envPath) {
    try {
      const fullPath = path.resolve(envPath);

      if (!fs.existsSync(fullPath)) {
        return; // .env doesn't exist, skip
      }

      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const line of content.split('\n')) {
        // Skip comments and empty lines
        if (!line || line.trim().startsWith('#')) {
          continue;
        }

        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const cleanKey = key.trim();
          const cleanValue = valueParts.join('=').trim();

          // Remove quotes if present
          const value = cleanValue.replace(/^["'](.*)["']$/, '$1');

          this.env[cleanKey] = value;
        }
      }
    } catch (err) {
      // Ignore errors loading .env
    }
  }

  /**
   * Disconnect from environment variables.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connected = false;
  }

  /**
   * Create a domain.
   *
   * Not supported for environment variables (read-only).
   *
   * @param {string} domain - Domain name
   * @returns {Promise<void>}
   * @throws {Error} Always throws - not supported
   */
  async createDomain(domain, options = {}) {
    throw new Error('EnvironmentProvider is read-only - createDomain not supported');
  }

  /**
   * Check if a domain exists.
   *
   * @param {string} domain - Domain name
   * @returns {Promise<boolean>}
   */
  async domainExists(domain) {
    this._ensureConnected();

    // Check if any env vars have this domain prefix
    const prefix = this._buildEnvPrefix(domain, '');
    return Object.keys(this.env).some(key => key.startsWith(prefix));
  }

  /**
   * Build environment variable name from domain and key.
   *
   * Format: {PROJECT}_{DOMAIN}_{KEY}
   * Examples:
   *   - TC_DATABASE_HOSTNAME
   *   - SPM_API_NVD_KEY
   *
   * @private
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {string} Environment variable name
   */
  _buildEnvKey(domain, key) {
    const parts = [];

    if (this.projectPrefix) {
      parts.push(this.projectPrefix.toUpperCase());
    }

    parts.push(domain.toUpperCase());
    parts.push(key.toUpperCase());

    return parts.join('_');
  }

  /**
   * Build environment variable prefix for a domain.
   *
   * @private
   * @param {string} domain - Domain name
   * @param {string} [suffix='_'] - Suffix to append
   * @returns {string} Environment variable prefix
   */
  _buildEnvPrefix(domain, suffix = '_') {
    const parts = [];

    if (this.projectPrefix) {
      parts.push(this.projectPrefix.toUpperCase());
    }

    parts.push(domain.toUpperCase());

    return parts.join('_') + suffix;
  }

  /**
   * Get all possible environment variable names for fallback.
   *
   * Tries:
   * 1. Project-specific: TC_DATABASE_HOSTNAME
   * 2. Generic: DATABASE_HOSTNAME
   *
   * @private
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {string[]} Array of env var names to try
   */
  _getAllPossibleEnvKeys(domain, key) {
    const keys = [];

    // Project-specific (if prefix set)
    if (this.projectPrefix) {
      keys.push(this._buildEnvKey(domain, key));
    }

    // Generic (no prefix)
    keys.push(`${domain.toUpperCase()}_${key.toUpperCase()}`);

    return keys;
  }

  /**
   * Set (create or update) a secret item.
   *
   * Not supported for environment variables (read-only).
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @param {string} value - Item value
   * @param {string} [type='secret'] - Item type
   * @returns {Promise<void>}
   * @throws {Error} Always throws - not supported
   */
  async setItem(domain, key, value, type = 'secret', options = {}) {
    throw new Error('EnvironmentProvider is read-only - setItem not supported');
  }

  /**
   * Get a secret item value with fallback.
   *
   * Tries:
   * 1. Project-specific (TC_DATABASE_HOSTNAME)
   * 2. Generic (DATABASE_HOSTNAME)
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<string|null>} Item value, or null if not found
   */
  async getItem(domain, key) {
    this._ensureConnected();

    const possibleKeys = this._getAllPossibleEnvKeys(domain, key);

    for (const envKey of possibleKeys) {
      const value = this.env[envKey];
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return null;
  }

  /**
   * Delete a secret item.
   *
   * Not supported for environment variables (read-only).
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<boolean>}
   * @throws {Error} Always throws - not supported
   */
  async deleteItem(domain, key) {
    throw new Error('EnvironmentProvider is read-only - deleteItem not supported');
  }

  /**
   * List all domains.
   *
   * @returns {Promise<string[]>} Array of domain names
   */
  async listDomains() {
    this._ensureConnected();

    const domains = new Set();

    for (const envKey of Object.keys(this.env)) {
      // Parse domain from env key
      const parts = envKey.split('_');

      if (parts.length < 2) continue;

      // If project prefix set, expect format: PREFIX_DOMAIN_KEY
      // Otherwise, expect format: DOMAIN_KEY
      const domainIndex = this.projectPrefix ? 1 : 0;

      if (parts.length > domainIndex) {
        domains.add(parts[domainIndex].toLowerCase());
      }
    }

    return Array.from(domains).sort();
  }

  /**
   * List all keys in a domain.
   *
   * @param {string} domain - Domain name
   * @returns {Promise<Object[]>} Array of items with { key, type } properties
   */
  async listKeys(domain) {
    this._ensureConnected();

    const items = [];
    const prefix = this._buildEnvPrefix(domain);

    for (const envKey of Object.keys(this.env)) {
      if (envKey.startsWith(prefix)) {
        const key = envKey.substring(prefix.length).toLowerCase();

        // Detect type from key name (heuristic)
        const type = this._detectType(key);

        items.push({ key, type });
      }
    }

    return items.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Detect item type from key name.
   *
   * @private
   * @param {string} key - Item key
   * @returns {string} 'secret' or 'configuration'
   */
  _detectType(key) {
    const secretPatterns = [
      'password', 'pwd', 'secret', 'token', 'key', 'credential'
    ];

    const lowerKey = key.toLowerCase();
    for (const pattern of secretPatterns) {
      if (lowerKey.includes(pattern)) {
        return 'secret';
      }
    }

    return 'configuration';
  }

  /**
   * Export all secrets from the store (for backup).
   *
   * @returns {Promise<Object>} Backup data structure
   */
  async exportAll() {
    this._ensureConnected();

    const domains = {};

    for (const envKey of Object.keys(this.env)) {
      const parts = envKey.split('_');

      if (parts.length < 2) continue;

      const domainIndex = this.projectPrefix ? 1 : 0;

      if (parts.length <= domainIndex) continue;

      const domain = parts[domainIndex].toLowerCase();
      const key = parts.slice(domainIndex + 1).join('_').toLowerCase();
      const type = this._detectType(key);

      if (!domains[domain]) {
        domains[domain] = {};
      }

      domains[domain][key] = {
        value: this.env[envKey],
        type
      };
    }

    return {
      provider: 'environment',
      timestamp: new Date().toISOString(),
      projectPrefix: this.projectPrefix,
      domains
    };
  }

  /**
   * Import secrets into the store (for restore).
   *
   * Not supported for environment variables (read-only).
   *
   * @param {Object} data - Backup data
   * @param {Object} [options] - Import options
   * @returns {Promise<Object>}
   * @throws {Error} Always throws - not supported
   */
  async importAll(data, options = {}) {
    throw new Error('EnvironmentProvider is read-only - importAll not supported');
  }

  /**
   * Validate connection and credentials.
   *
   * @returns {Promise<Object>} Validation result
   */
  async validate() {
    if (!this.connected) {
      return {
        valid: false,
        message: 'Not connected to environment',
        details: {}
      };
    }

    const envCount = Object.keys(this.env).length;

    return {
      valid: true,
      message: 'Connected to environment variables',
      details: {
        projectPrefix: this.projectPrefix,
        envCount,
        envPath: this.envPath
      }
    };
  }

  /**
   * Get provider capabilities.
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
      'validate',
      'read-only'
    ];
  }
}

export default EnvironmentProvider;
