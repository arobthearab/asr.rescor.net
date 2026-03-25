/**
 * StoreSetup.mjs
 *
 * Parser and validator for .store-setup YAML files.
 *
 * Handles centralized secret store configuration files that define:
 * - Store provider (infisical, aws-sm, environment, etc.)
 * - Connection settings
 * - Domain/key structure
 * - Templates
 *
 * @module @rescor-llc/core-config/StoreSetup
 */

import fs from 'fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
import { getProvider } from './providers/index.mjs';

/**
 * Store setup configuration.
 *
 * Represents a parsed .store-setup-[project].yaml file.
 *
 * @class StoreSetup
 *
 * @example
 * const setup = await StoreSetup.load('core.rescor.net');
 * console.log(setup.storeName);  // 'infisical'
 * console.log(setup.items);      // { database: [...], api: [...] }
 *
 * const provider = setup.createProvider();
 * await provider.connect(setup.getConnectionConfig());
 */
export class StoreSetup {
  /**
   * Create a new StoreSetup instance.
   *
   * @param {Object} data - Raw YAML data
   * @param {string} [filePath] - Source file path
   */
  constructor(data = {}, filePath = null) {
    this.filePath = filePath;
    this.storeName = data['store-name'] || 'infisical';
    this.type = data.type || 'default';
    this.connection = data.connection || {};
    this.items = data.items || {};

    // Validation errors
    this.errors = [];
  }

  /**
   * Load a store setup file.
   *
   * @param {string} projectOrPath - Project name (e.g., 'core.rescor.net') or file path
   * @param {Object} [options] - Load options
   * @param {string} [options.basePath] - Base directory for .store-setup files
   * @returns {Promise<StoreSetup>} Parsed setup
   * @throws {Error} If file cannot be read or parsed
   *
   * @example
   * // Load by project name (searches in project-stores/)
   * const setup = await StoreSetup.load('core.rescor.net');
   *
   * // Load by absolute path
   * const setup = await StoreSetup.load('/path/to/.store-setup-custom.yaml');
   *
   * // Load with custom base path
   * const setup = await StoreSetup.load('testingcenter.rescor.net', {
   *   basePath: '/custom/project-stores'
   * });
   */
  static async load(projectOrPath, options = {}) {
    let filePath;

    // Check if projectOrPath is an absolute path
    if (path.isAbsolute(projectOrPath) || projectOrPath.includes('/')) {
      filePath = projectOrPath;
    } else {
      // Treat as project name - construct path
      const basePath = options.basePath || StoreSetup.getDefaultBasePath();
      filePath = path.join(basePath, `.store-setup-${projectOrPath}.yaml`);
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = yaml.load(content);

      return new StoreSetup(data, filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Store setup file not found: ${filePath}`);
      }

      throw new Error(`Failed to load store setup: ${err.message}`);
    }
  }

  /**
   * Save store setup to file.
   *
   * @param {string} [filePath] - File path (defaults to this.filePath)
   * @returns {Promise<void>}
   *
   * @example
   * const setup = new StoreSetup({
   *   'store-name': 'infisical',
   *   type: 'default',
   *   connection: { ... },
   *   items: { ... }
   * });
   *
   * await setup.save('/path/to/.store-setup-core.rescor.net.yaml');
   */
  async save(filePath = null) {
    const targetPath = filePath || this.filePath;

    if (!targetPath) {
      throw new Error('No file path specified for save');
    }

    const data = this.toYAML();

    // Ensure directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    await fs.writeFile(targetPath, data, 'utf-8');

    this.filePath = targetPath;
  }

  /**
   * Get default base path for store setup files.
   *
   * Looks for core.rescor.net/project-stores/ relative to current directory.
   *
   * @returns {string} Default base path
   */
  static getDefaultBasePath() {
    const cwd = process.cwd();
    const TARGET = 'core.rescor.net';
    const SUBDIR = 'project-stores';

    // If we're inside core.rescor.net already, use its project-stores/
    if (cwd.includes(TARGET)) {
      const coreRoot = cwd.substring(0, cwd.indexOf(TARGET) + TARGET.length);
      return path.join(coreRoot, SUBDIR);
    }

    // Walk up from CWD looking for a Repositories directory that
    // contains core.rescor.net/project-stores/.
    const candidates = new Set();

    let cursor = cwd;
    while (true) {
      if (cursor.endsWith('/Repositories') || cursor.endsWith('\\Repositories')) {
        candidates.add(cursor);
      }
      const next = path.resolve(cursor, '..');
      if (next === cursor) {
        break;
      }
      cursor = next;
    }

    candidates.add(path.resolve(homedir(), 'Repositories'));

    try {
      for (const volumeName of readdirSync('/Volumes')) {
        candidates.add(path.resolve('/Volumes', volumeName, 'Repositories'));
      }
    } catch {
      // /Volumes not present (Linux, etc.)
    }

    for (const root of candidates) {
      const candidate = path.join(root, TARGET, SUBDIR);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // Final fallback: sibling of CWD (original behavior)
    const result = path.join(path.dirname(cwd), TARGET, SUBDIR);
    return result;
  }

  /**
   * Validate store setup.
   *
   * Checks for:
   * - Valid store provider
   * - Required connection fields
   * - Item structure
   *
   * @returns {boolean} True if valid
   */
  validate() {
    this.errors = [];

    // Check store name
    if (!this.storeName) {
      this.errors.push('Missing store-name');
    }

    // Check type
    if (!['default', 'project'].includes(this.type)) {
      this.errors.push(`Invalid type '${this.type}' - must be 'default' or 'project'`);
    }

    // Validate items structure
    for (const [domain, items] of Object.entries(this.items)) {
      if (!Array.isArray(items)) {
        this.errors.push(`Items for domain '${domain}' must be an array`);
        continue;
      }

      for (const item of items) {
        if (!item.key) {
          this.errors.push(`Item in domain '${domain}' missing 'key'`);
        }

        if (!item.type || !['secret', 'configuration'].includes(item.type)) {
          this.errors.push(`Item '${item.key}' in domain '${domain}' has invalid type '${item.type}'`);
        }
      }
    }

    return this.errors.length === 0;
  }

  /**
   * Get validation errors.
   *
   * @returns {string[]} Array of error messages
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Create provider instance from this setup.
   *
   * @returns {SecretStoreProvider} Provider instance
   *
   * @example
   * const setup = await StoreSetup.load('core.rescor.net');
   * const provider = setup.createProvider();
   * await provider.connect(setup.getConnectionConfig());
   */
  createProvider() {
    const ProviderClass = getProvider(this.storeName);
    return new ProviderClass({ name: this.storeName });
  }

  /**
   * Get connection configuration for provider.
   *
   * Extracts connection details from setup and resolves environment variables.
   * Transforms YAML structure to provider-expected format.
   * For project stores, inherits missing values from core.rescor.net.
   *
   * @returns {Promise<Object>} Connection config
   *
   * @example
   * const config = await setup.getConnectionConfig();
   * // {
   * //   host: 'http://localhost:3000',
   * //   auth: { clientId: '...', clientSecret: '...' },
   * //   projectId: '612c1f10-...',
   * //   environment: 'dev'
   * // }
   */
  async getConnectionConfig() {
    let resolved = this._resolveEnvVars(this.connection);

    // For project stores, inherit missing connection details from core
    if (this.type === 'project') {
      try {
        const coreSetup = await StoreSetup.load('core.rescor.net');
        const coreConnection = this._resolveEnvVars(coreSetup.connection);

        // Inherit host, credentials if not specified in project
        if (!resolved.host && coreConnection.host) {
          resolved.host = coreConnection.host;
        }

        if (!resolved.credentials && coreConnection.credentials) {
          resolved.credentials = coreConnection.credentials;
        }

        if (!resolved['core-project-id'] && coreConnection['project-id']) {
          resolved['core-project-id'] = coreConnection['project-id'];
        }
      } catch (err) {
        // Core setup not found - continue without inheritance
      }
    }

    // Transform YAML structure to provider-expected format
    // YAML: credentials.client-id → Provider: auth.clientId
    if (resolved.credentials) {
      resolved.auth = {
        clientId: resolved.credentials['client-id'] || resolved.credentials.clientId,
        clientSecret: resolved.credentials['client-secret'] || resolved.credentials.clientSecret
      };
      delete resolved.credentials;
    }

    // Convert kebab-case to camelCase
    if (resolved['project-id']) {
      resolved.projectId = resolved['project-id'];
      delete resolved['project-id'];
    }

    if (resolved['core-project-id']) {
      resolved.coreProjectId = resolved['core-project-id'];
      delete resolved['core-project-id'];
    }

    if (resolved['auth-type']) {
      delete resolved['auth-type']; // Not needed by provider
    }

    return resolved;
  }

  /**
   * Resolve environment variables in connection config.
   *
   * Replaces ${ENV:VAR_NAME} with process.env.VAR_NAME.
   *
   * @private
   * @param {Object} obj - Object with possible env var references
   * @returns {Object} Resolved object
   */
  _resolveEnvVars(obj) {
    if (typeof obj !== 'object' || obj === null) {
      if (typeof obj === 'string') {
        return this._resolveEnvString(obj);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._resolveEnvVars(item));
    }

    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = this._resolveEnvVars(value);
    }

    return resolved;
  }

  /**
   * Resolve environment variable in string.
   *
   * @private
   * @param {string} str - String with possible ${ENV:VAR_NAME} pattern
   * @returns {string} Resolved string
   */
  _resolveEnvString(str) {
    return str.replace(/\$\{ENV:([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || '';
    });
  }

  /**
   * Get all items as flat list.
   *
   * @returns {Object[]} Array of { domain, key, type, description, default }
   *
   * @example
   * const items = setup.getAllItems();
   * // [
   * //   { domain: 'database', key: 'hostname', type: 'configuration', ... },
   * //   { domain: 'database', key: 'password', type: 'secret', ... }
   * // ]
   */
  getAllItems() {
    const flatItems = [];

    for (const [domain, items] of Object.entries(this.items)) {
      for (const item of items) {
        flatItems.push({
          domain,
          key: item.key,
          type: item.type,
          description: item.description || null,
          default: item.default || null
        });
      }
    }

    return flatItems;
  }

  /**
   * Get items by domain.
   *
   * @param {string} domain - Domain name
   * @returns {Object[]} Array of items
   */
  getItemsByDomain(domain) {
    return this.items[domain] || [];
  }

  /**
   * Add an item to the setup.
   *
   * @param {string} domain - Domain name
   * @param {Object} item - Item definition
   * @param {string} item.key - Item key
   * @param {string} item.type - Item type ('secret' or 'configuration')
   * @param {string} [item.description] - Item description
   * @param {string} [item.default] - Default value
   *
   * @example
   * setup.addItem('database', {
   *   key: 'hostname',
   *   type: 'configuration',
   *   description: 'Database hostname',
   *   default: 'localhost'
   * });
   */
  addItem(domain, item) {
    if (!this.items[domain]) {
      this.items[domain] = [];
    }

    this.items[domain].push(item);
  }

  /**
   * Remove an item from the setup.
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {boolean} True if item was removed
   */
  removeItem(domain, key) {
    if (!this.items[domain]) {
      return false;
    }

    const index = this.items[domain].findIndex(item => item.key === key);

    if (index === -1) {
      return false;
    }

    this.items[domain].splice(index, 1);

    // Remove domain if empty
    if (this.items[domain].length === 0) {
      delete this.items[domain];
    }

    return true;
  }

  /**
   * Convert to YAML string.
   *
   * @returns {string} YAML content
   */
  toYAML() {
    const data = {
      'store-name': this.storeName,
      type: this.type,
      connection: this.connection,
      items: this.items
    };

    return yaml.dump(data, {
      indent: 2,
      lineWidth: 100,
      noRefs: true
    });
  }

  /**
   * Convert to JSON.
   *
   * @returns {Object} JSON-serializable object
   */
  toJSON() {
    return {
      storeName: this.storeName,
      type: this.type,
      connection: this.connection,
      items: this.items
    };
  }

  /**
   * Get summary string.
   *
   * @returns {string} Human-readable summary
   */
  toString() {
    const itemCount = this.getAllItems().length;
    const domainCount = Object.keys(this.items).length;

    return `StoreSetup(${this.storeName}, ${this.type}, ${domainCount} domains, ${itemCount} items)`;
  }
}

export default StoreSetup;
