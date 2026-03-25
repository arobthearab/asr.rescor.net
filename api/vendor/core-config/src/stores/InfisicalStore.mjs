/**
 * InfisicalStore - Infisical-backed secret store (primary tier)
 *
 * Supports both local and external Infisical instances
 * Phase 2: Implements unified API with ClassifiedDatum
 */

// Import InfisicalSDK (named export, not default)
import { InfisicalSDK } from '@infisical/sdk';

import { SecureStore, SecureStoreError } from '../SecureStore.mjs';
import { ClassifiedDatum, ClassifiedData, Classified } from '../ClassifiedDatum.mjs';

export class InfisicalStore extends SecureStore {
  static CODES = {
    ...SecureStore.CODES,
    AUTH_FAILED: 10100,
    CONNECTION_FAILED: 10101,
    SECRET_NOT_FOUND: 10102,
    CREATE_FAILED: 10103,
    UPDATE_FAILED: 10104,
    DELETE_FAILED: 10105
  };

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

  constructor(options = {}) {
    super(options);

    // Infisical configuration
    this.mode = options.mode || process.env.INFISICAL_MODE || 'local';
    this.config = this._buildConfig(options);

    this.client = null;

    // Two-tier project resolution: project-specific → core
    this.projectId = options.projectId || process.env.INFISICAL_PROJECT_ID;
    this.coreProjectId = options.coreProjectId || process.env.INFISICAL_CORE_PROJECT_ID;
    this.projectName = options.projectName || this._detectProjectName();

    this.environment = options.environment || process.env.INFISICAL_ENVIRONMENT || 'dev';
    this.secretPath = options.secretPath || '/';
  }

  /**
   * Detect project name from current working directory
   * E.g., /path/to/spm.rescor.net → 'spm'
   *       /path/to/testingcenter.rescor.net → 'testingcenter'
   * @returns {string|null}
   */
  _detectProjectName() {
    const cwd = process.cwd();
    const match = cwd.match(/([^/]+)\.rescor\.net/);
    return match ? match[1] : null;
  }

  _buildConfig(options) {
    const configs = {
      local: {
        host: options.host || process.env.INFISICAL_HOST || 'http://localhost:8080',
        clientId: options.clientId || process.env.INFISICAL_CLIENT_ID,
        clientSecret: options.clientSecret || process.env.INFISICAL_CLIENT_SECRET
      },
      external: {
        host: options.externalHost || process.env.INFISICAL_EXTERNAL_HOST || 'https://app.infisical.com',
        clientId: options.externalClientId || process.env.INFISICAL_EXTERNAL_CLIENT_ID,
        clientSecret: options.externalClientSecret || process.env.INFISICAL_EXTERNAL_CLIENT_SECRET
      }
    };

    return configs[this.mode];
  }

  get isInitialized() {
    return this._initialized && this.client !== null;
  }

  async _initialize() {
    try {
      // Create Infisical client
      this.client = new InfisicalSDK({
        siteUrl: this.config.host
        // logLevel removed - LogLevel not properly exported from CommonJS module
      });

      // Authenticate with Universal Auth
      await this.client.auth().universalAuth.login({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret
      });

      this.log.emit(InfisicalStore.CODES.INITIALIZING, 'i',
        `Infisical initialized (mode: ${this.mode}, host: ${this.config.host})`);

      return true;
    } catch (err) {
      this.log.emit(InfisicalStore.CODES.AUTH_FAILED, 'e',
        `Infisical authentication failed: ${err.message}`);
      throw new SecureStoreError(InfisicalStore.CODES.AUTH_FAILED,
        'Failed to initialize Infisical', err);
    }
  }

  async access() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this;
  }

  /**
   * Build secret key from domain and key
   * Note: Infisical secret names cannot contain slashes, so we use underscores
   */
  _buildSecretPath(domain, key) {
    return `${domain}_${key}`.toUpperCase();
  }

  /**
   * Get all possible key names including aliases
   * @param {string} domain
   * @param {string} key
   * @returns {string[]} Array of secret keys to try ([primary, ...aliases])
   */
  _getAllPossibleKeys(domain, key) {
    const fullKey = `${domain}.${key}`;
    const primaryKey = this._buildSecretPath(domain, key);
    const keys = [primaryKey];

    // Add aliases if defined
    const aliases = InfisicalStore.KEY_ALIASES[fullKey];
    if (aliases) {
      for (const alias of aliases) {
        keys.push(this._buildSecretPath(domain, alias));
      }
    }

    return keys;
  }

  /**
   * Get secret type from classification
   * Infisical supports 'shared' or 'personal' types
   */
  _getSecretType(classification) {
    // When using Machine Identity (Universal Auth), all secrets must be 'shared'
    // Machine Identity cannot create 'personal' secrets
    // See: https://infisical.com/docs/documentation/platform/identities/universal-auth
    return 'shared';
  }

  // ============================================================================
  // UNIFIED API IMPLEMENTATION
  // ============================================================================

  /**
   * Get a single classified datum from Infisical with two-tier resolution
   *
   * Resolution order:
   * 1. Try project-specific projectId (e.g., spm.rescor.net) with all key aliases
   * 2. Fall back to core projectId (core.rescor.net) with all key aliases
   *
   * Key alias support: Tries primary key first, then aliases
   * Example: database.user → DATABASE_USER, DATABASE_UID
   *
   * @param {ClassifiedDatum} datum
   * @returns {Promise<string|null>}
   */
  async _getSingle(datum) {
    await this.access();

    const possibleKeys = this._getAllPossibleKeys(datum.domain, datum.key);

    // Helper to try all key aliases in a project
    const tryProject = async (projectId, projectLabel) => {
      for (const secretKey of possibleKeys) {
        try {
          const secret = await this.client.secrets().getSecret({
            secretName: secretKey,
            projectId: projectId,
            environment: this.environment
          });

          this.log.emit(10210, 'd',
            `Retrieved ${datum.fullKey} from Infisical ${projectLabel} as ${secretKey}`);
          return secret.secretValue;
        } catch (err) {
          // Not found with this key, try next alias
          if (err.message?.includes('not found') || err.statusCode === 404) {
            continue;
          }

          // Other errors should be logged but not thrown (graceful degradation)
          this.log.emit(10212, 'w',
            `Failed to retrieve ${secretKey} from ${projectLabel}: ${err.message}`);
        }
      }

      // None of the aliases found
      return null;
    };

    // Tier 1: Try project-specific projectId first
    if (this.projectId) {
      const result = await tryProject(this.projectId, `project-specific (${this.projectName || 'unknown'})`);
      if (result !== null) {
        return result;
      }

      this.log.emit(10211, 'd',
        `Secret ${datum.fullKey} not found in project-specific (tried ${possibleKeys.join(', ')}), trying core...`);
    }

    // Tier 2: Fall back to core projectId
    if (this.coreProjectId) {
      const result = await tryProject(this.coreProjectId, 'core (core.rescor.net)');
      if (result !== null) {
        return result;
      }

      this.log.emit(10214, 'd',
        `Secret ${datum.fullKey} not found in core either (tried ${possibleKeys.join(', ')})`);
      return null;
    }

    // No projectId or coreProjectId configured
    this.log.emit(10215, 'd',
      `No projectId or coreProjectId configured, cannot retrieve ${datum.fullKey}`);
    return null;
  }

  /**
   * Store a single classified datum in Infisical
   * @param {ClassifiedDatum} datum - Must have value set
   */
  async _storeSingle(datum) {
    await this.access();

    const secretKey = this._buildSecretPath(datum.domain, datum.key);
    const secretType = this._getSecretType(datum.classification);

    try {
      // Try to update first (more efficient if exists)
      try {
        await this.client.secrets().updateSecret(secretKey, {
          projectId: this.projectId,
          environment: this.environment,
          secretValue: datum.value,
          type: secretType
        });

        this.log.emit(10200, 'd',
          `Updated ${datum.fullKey} in Infisical (${datum.classificationName}, type: ${secretType})`);
      } catch (updateErr) {
        // If update fails, create new secret
        await this.client.secrets().createSecret(secretKey, {
          projectId: this.projectId,
          environment: this.environment,
          secretValue: datum.value,
          type: secretType
        });

        this.log.emit(10201, 'd',
          `Created ${datum.fullKey} in Infisical (${datum.classificationName}, type: ${secretType})`);
      }
    } catch (err) {
      this.log.emit(InfisicalStore.CODES.CREATE_FAILED, 'e',
        `Failed to store ${datum.fullKey}: ${err.message}`);
      throw new SecureStoreError(InfisicalStore.CODES.CREATE_FAILED,
        `Failed to store secret ${datum.fullKey}`, err);
    }
  }

  /**
   * Clear a single classified datum from Infisical
   * @param {ClassifiedDatum} datum
   */
  async _clearSingle(datum) {
    await this.access();

    const secretKey = this._buildSecretPath(datum.domain, datum.key);

    try {
      await this.client.secrets().deleteSecret(secretKey, {
        projectId: this.projectId,
        environment: this.environment
      });

      this.log.emit(10220, 'i', `Deleted ${datum.fullKey} from Infisical`);
    } catch (err) {
      this.log.emit(InfisicalStore.CODES.DELETE_FAILED, 'e',
        `Failed to delete ${datum.fullKey}: ${err.message}`);
      throw new SecureStoreError(InfisicalStore.CODES.DELETE_FAILED,
        `Failed to delete secret ${datum.fullKey}`, err);
    }
  }

  /**
   * List all items in a domain
   * @param {string} domain - Optional domain filter
   * @returns {Promise<ClassifiedData>}
   */
  async _listByDomain(domain = null) {
    await this.access();

    try {
      const secrets = await this.client.secrets().list({
        projectId: this.projectId,
        environment: this.environment,
        path: domain ? `${this.secretPath}${domain}` : this.secretPath
      });

      const items = secrets.map(secret => {
        // Parse domain and key from secret path
        const fullPath = secret.secretKey.replace(this.secretPath, '');
        const parts = fullPath.split('/');
        const parsedDomain = parts.length > 1 ? parts[0] : 'default';
        const parsedKey = parts.length > 1 ? parts.slice(1).join('/') : parts[0];

        // Auto-detect classification from key name
        const datum = ClassifiedDatum.auto(parsedDomain, parsedKey, {
          created: secret.createdAt,
          modified: secret.updatedAt,
          source: 'infisical'
        });
        datum.value = secret.secretValue;

        return datum;
      });

      this.log.emit(10230, 'd', `Listed ${items.length} secrets from Infisical`);
      return new ClassifiedData(items);
    } catch (err) {
      this.log.emit(10231, 'e', `Failed to list secrets: ${err.message}`);
      throw new SecureStoreError(InfisicalStore.CODES.STORE_ERROR,
        'Failed to list secrets', err);
    }
  }
}
