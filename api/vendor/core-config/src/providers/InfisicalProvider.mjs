/**
 * InfisicalProvider.mjs
 *
 * Infisical secret store provider implementation.
 *
 * Features:
 * - Universal Auth authentication
 * - Two-tier project resolution (project-specific → core)
 * - Key aliases for backward compatibility
 * - Domain organization
 * - Export/import for backup/restore
 *
 * @module @rescor-llc/core-config/providers/InfisicalProvider
 */

import { InfisicalSDK } from '@infisical/sdk';
import { SecretStoreProvider } from './SecretStoreProvider.mjs';

/**
 * Infisical secret store provider.
 *
 * Connects to Infisical (local or external) and manages secrets using Universal Auth.
 *
 * @class InfisicalProvider
 * @extends SecretStoreProvider
 *
 * @example
 * const provider = new InfisicalProvider({
 *   name: 'infisical',
 *   mode: 'local'
 * });
 *
 * await provider.connect({
 *   host: 'http://localhost:3000',
 *   auth: {
 *     clientId: '...',
 *     clientSecret: '...'
 *   },
 *   projectId: '612c1f10-3c10-470b-901a-23e02baf1ced',
 *   environment: 'dev',
 *   coreProjectId: 'CORE_PROJECT_ID'  // Optional fallback
 * });
 *
 * await provider.setItem('database', 'hostname', 'thorium.rescor.net', 'configuration');
 * const hostname = await provider.getItem('database', 'hostname');
 */
export class InfisicalProvider extends SecretStoreProvider {
  /**
   * Key aliases for backward compatibility with existing Infisical data
   * Maps standard key names to alternative names in Infisical
   */
  static KEY_ALIASES = {
    'database.user': ['uid'],       // DATABASE_USER → DATABASE_UID
    'database.password': ['pwd'],   // DATABASE_PASSWORD → DATABASE_PWD
    'neo4j.user': ['username'],     // NEO4J_USER → NEO4J_USERNAME
    'neo4j.password': ['pwd']       // NEO4J_PASSWORD → NEO4J_PWD
  };

  /**
   * Create a new InfisicalProvider instance.
   *
   * @param {Object} config - Provider configuration
   * @param {string} [config.mode='local'] - 'local' or 'external'
   */
  constructor(config = {}) {
    super({ ...config, name: 'infisical' });

    this.mode = config.mode || 'local';
    this.client = null;

    // Two-tier project resolution
    this.projectId = null;
    this.coreProjectId = null;
    this.environment = 'dev';
    this.secretPath = '/';
  }

  /**
   * Connect to Infisical.
   *
   * @param {Object} config - Connection configuration
   * @param {string} config.host - Infisical host URL
   * @param {Object} config.auth - Authentication credentials
   * @param {string} config.auth.clientId - Universal Auth client ID
   * @param {string} config.auth.clientSecret - Universal Auth client secret
   * @param {string} config.projectId - Project ID
   * @param {string} [config.environment='dev'] - Environment name
   * @param {string} [config.coreProjectId] - Core project ID for fallback
   * @returns {Promise<void>}
   */
  async connect(config) {
    try {
      // Create Infisical client
      this.client = new InfisicalSDK({
        siteUrl: config.host
      });

      // Authenticate with Universal Auth
      await this.client.auth().universalAuth.login({
        clientId: config.auth.clientId,
        clientSecret: config.auth.clientSecret
      });

      // Store connection details
      this.projectId = config.projectId;
      this.coreProjectId = config.coreProjectId || null;
      this.environment = config.environment || 'dev';
      this.secretPath = config.secretPath || '/';

      this.connected = true;
    } catch (err) {
      throw new Error(`Failed to connect to Infisical: ${err.message}`);
    }
  }

  /**
   * Disconnect from Infisical.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Create a domain.
   *
   * Note: Infisical doesn't have explicit "domains" - they're implemented
   * as path prefixes in secret names (e.g., database_hostname).
   *
   * @param {string} domain - Domain name
   * @returns {Promise<void>}
   */
  async createDomain(domain, options = {}) {
    this._ensureConnected();
    // No-op for Infisical - domains are implicit in secret naming
  }

  /**
   * Check if a domain exists.
   *
   * @param {string} domain - Domain name
   * @returns {Promise<boolean>}
   */
  async domainExists(domain) {
    this._ensureConnected();

    try {
      const secrets = await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: this.secretPath
      });

      // Check if any secrets have this domain prefix
      const prefix = `${domain.toUpperCase()}_`;
      return secrets.some(secret => secret.secretKey.startsWith(prefix));
    } catch (err) {
      return false;
    }
  }

  /**
   * Build secret key from domain and key.
   *
   * Infisical secret names cannot contain slashes, so we use underscores.
   *
   * @private
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {string} Secret key (e.g., "DATABASE_HOSTNAME")
   */
  _buildSecretKey(domain, key) {
    return `${domain}_${key}`.toUpperCase();
  }

  /**
   * Get all possible key names including aliases.
   *
   * @private
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {string[]} Array of secret keys to try ([primary, ...aliases])
   */
  _getAllPossibleKeys(domain, key) {
    const fullKey = `${domain}.${key}`;
    const primaryKey = this._buildSecretKey(domain, key);
    const keys = [primaryKey];

    // Add aliases if defined
    const aliases = InfisicalProvider.KEY_ALIASES[fullKey];
    if (aliases) {
      for (const alias of aliases) {
        keys.push(this._buildSecretKey(domain, alias));
      }
    }

    return keys;
  }

  /**
   * Get secret type from item type.
   *
   * Note: When using Machine Identity (Universal Auth), all secrets must be 'shared'.
   *
   * @private
   * @param {string} type - Item type ('secret' or 'configuration')
   * @returns {string} Infisical secret type
   */
  _getSecretType(type) {
    // Machine Identity can only create 'shared' secrets
    return 'shared';
  }

  /**
   * Set (create or update) a secret item.
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @param {string} value - Item value
   * @param {string} [type='secret'] - Item type
   * @returns {Promise<void>}
   */
  async setItem(domain, key, value, type = 'secret', options = {}) {
    this._ensureConnected();

    const secretKey = this._buildSecretKey(domain, key);
    const secretType = this._getSecretType(type);

    try {
      // Try to update first (more efficient if exists)
      try {
        await this.client.secrets().updateSecret(secretKey, {
          projectId: this.projectId,
          environment: this.environment,
          secretValue: value,
          type: secretType
        });
      } catch (updateErr) {
        // If update fails, create new secret
        await this.client.secrets().createSecret(secretKey, {
          projectId: this.projectId,
          environment: this.environment,
          secretValue: value,
          type: secretType
        });
      }
    } catch (err) {
      throw new Error(`Failed to set ${domain}.${key}: ${err.message}`);
    }
  }

  /**
   * Get a secret item value with two-tier resolution.
   *
   * Resolution order:
   * 1. Try project-specific projectId with all key aliases
   * 2. Fall back to core projectId with all key aliases
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<string|null>} Item value, or null if not found
   */
  async getItem(domain, key) {
    this._ensureConnected();

    const possibleKeys = this._getAllPossibleKeys(domain, key);

    // Helper to try all key aliases in a project
    const tryProject = async (projectId) => {
      for (const secretKey of possibleKeys) {
        try {
          const secret = await this.client.secrets().getSecret({
            secretName: secretKey,
            projectId: projectId,
            environment: this.environment
          });

          return secret.secretValue;
        } catch (err) {
          // Not found with this key, try next alias
          if (err.message?.includes('not found') || err.statusCode === 404) {
            continue;
          }

          // Other errors should be ignored (graceful degradation)
        }
      }

      // None of the aliases found
      return null;
    };

    // Tier 1: Try project-specific projectId first
    if (this.projectId) {
      const result = await tryProject(this.projectId);
      if (result !== null) {
        return result;
      }
    }

    // Tier 2: Fall back to core projectId
    if (this.coreProjectId) {
      const result = await tryProject(this.coreProjectId);
      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  /**
   * Delete a secret item.
   *
   * @param {string} domain - Domain name
   * @param {string} key - Item key
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteItem(domain, key) {
    this._ensureConnected();

    const secretKey = this._buildSecretKey(domain, key);

    try {
      await this.client.secrets().deleteSecret(secretKey, {
        projectId: this.projectId,
        environment: this.environment
      });

      return true;
    } catch (err) {
      if (err.message?.includes('not found') || err.statusCode === 404) {
        return false;
      }

      throw new Error(`Failed to delete ${domain}.${key}: ${err.message}`);
    }
  }

  /**
   * List all domains.
   *
   * @returns {Promise<string[]>} Array of domain names
   */
  async listDomains() {
    this._ensureConnected();

    try {
      const secrets = await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: this.secretPath
      });

      // Extract unique domain prefixes
      const domains = new Set();
      for (const secret of secrets) {
        const parts = secret.secretKey.split('_');
        if (parts.length > 1) {
          domains.add(parts[0].toLowerCase());
        }
      }

      return Array.from(domains).sort();
    } catch (err) {
      throw new Error(`Failed to list domains: ${err.message}`);
    }
  }

  /**
   * List all keys in a domain.
   *
   * @param {string} domain - Domain name
   * @returns {Promise<Object[]>} Array of items with { key, type } properties
   */
  async listKeys(domain) {
    this._ensureConnected();

    try {
      const secrets = await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: this.secretPath
      });

      const prefix = `${domain.toUpperCase()}_`;
      const items = [];

      for (const secret of secrets) {
        if (secret.secretKey.startsWith(prefix)) {
          const key = secret.secretKey.substring(prefix.length).toLowerCase();

          // Detect type from key name (heuristic)
          const type = this._detectType(key);

          items.push({ key, type });
        }
      }

      return items.sort((a, b) => a.key.localeCompare(b.key));
    } catch (err) {
      throw new Error(`Failed to list keys in ${domain}: ${err.message}`);
    }
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

    try {
      const secrets = await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: this.secretPath
      });

      const domains = {};

      for (const secret of secrets) {
        const parts = secret.secretKey.split('_');
        if (parts.length < 2) continue;

        const domain = parts[0].toLowerCase();
        const key = parts.slice(1).join('_').toLowerCase();
        const type = this._detectType(key);

        if (!domains[domain]) {
          domains[domain] = {};
        }

        domains[domain][key] = {
          value: secret.secretValue,
          type
        };
      }

      return {
        provider: 'infisical',
        timestamp: new Date().toISOString(),
        projectId: this.projectId,
        environment: this.environment,
        domains
      };
    } catch (err) {
      throw new Error(`Failed to export secrets: ${err.message}`);
    }
  }

  /**
   * Import secrets into the store (for restore).
   *
   * @param {Object} data - Backup data from exportAll()
   * @param {Object} [options] - Import options
   * @param {boolean} [options.overwrite=false] - Overwrite existing items
   * @param {boolean} [options.dryRun=false] - Preview without applying
   * @returns {Promise<Object>} Summary { created, updated, skipped, errors }
   */
  async importAll(data, options = {}) {
    this._ensureConnected();

    const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const { overwrite = false, dryRun = false } = options;

    for (const [domain, items] of Object.entries(data.domains)) {
      for (const [key, item] of Object.entries(items)) {
        try {
          // Check if item exists
          const exists = await this.getItem(domain, key);

          if (exists && !overwrite) {
            summary.skipped++;
            continue;
          }

          if (!dryRun) {
            await this.setItem(domain, key, item.value, item.type);
          }

          if (exists) {
            summary.updated++;
          } else {
            summary.created++;
          }
        } catch (err) {
          summary.errors++;
        }
      }
    }

    return summary;
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
        message: 'Not connected to Infisical',
        details: {}
      };
    }

    try {
      // Try to list secrets to verify access
      await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: this.secretPath
      });

      return {
        valid: true,
        message: 'Connected to Infisical',
        details: {
          projectId: this.projectId,
          coreProjectId: this.coreProjectId,
          environment: this.environment,
          mode: this.mode
        }
      };
    } catch (err) {
      return {
        valid: false,
        message: `Validation failed: ${err.message}`,
        details: { error: err.message }
      };
    }
  }

  /**
   * Get provider capabilities.
   *
   * @protected
   * @returns {string[]} Array of capability names
   */
  _getCapabilities() {
    return [
      ...super._getCapabilities(),
      'two-tier-resolution',
      'key-aliases'
    ];
  }
}

export default InfisicalProvider;
