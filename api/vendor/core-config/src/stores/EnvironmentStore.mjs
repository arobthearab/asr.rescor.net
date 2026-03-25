/**
 * EnvironmentStore - Environment variable backed secret store
 *
 * Reads from process.env with configurable prefix
 * Convention: {PREFIX}_{DOMAIN}_{KEY} (e.g., RESCOR_DATABASE_PASSWORD)
 */

import { SecureStore, SecureStoreError } from '../SecureStore.mjs';
import { ClassifiedDatum, ClassifiedData } from '../ClassifiedDatum.mjs';

export class EnvironmentStore extends SecureStore {
  constructor(options = {}) {
    super(options);

    this.prefix = options.prefix || process.env.RESCOR_ENV_PREFIX || 'RESCOR';
    this.separator = options.separator || '_';
    this._initialized = true; // Always initialized (process.env always exists)
  }

  get isInitialized() {
    return true; // Always available
  }

  async _initialize() {
    this.log.emit(SecureStore.CODES.INITIALIZING, 'i',
      `Environment store initialized (prefix: ${this.prefix})`);
    return true;
  }

  async access() {
    return this; // Always accessible
  }

  /**
   * Build environment variable name from domain and key
   * Example: database, password -> RESCOR_DATABASE_PASSWORD
   */
  _buildEnvKey(domain, key) {
    return `${this.prefix}${this.separator}${domain.toUpperCase()}${this.separator}${key.toUpperCase()}`;
  }

  /**
   * Parse environment variable name back to domain and key
   * Example: RESCOR_DATABASE_PASSWORD -> { domain: 'database', key: 'password' }
   */
  _parseEnvKey(envKey) {
    const withoutPrefix = envKey.replace(new RegExp(`^${this.prefix}${this.separator}`), '');
    const parts = withoutPrefix.split(this.separator);

    if (parts.length < 2) {
      return null;
    }

    return {
      domain: parts[0].toLowerCase(),
      key: parts.slice(1).join(this.separator).toLowerCase()
    };
  }

  // ============================================================================
  // UNIFIED API IMPLEMENTATION
  // ============================================================================

  /**
   * Get a single classified datum from environment
   * @param {ClassifiedDatum} datum
   * @returns {Promise<string|null>}
   */
  async _getSingle(datum) {
    const envKey = this._buildEnvKey(datum.domain, datum.key);
    const value = process.env[envKey];

    if (value !== undefined) {
      this.log.emit(10310, 'd',
        `Retrieved ${datum.fullKey} from environment (${envKey}, ${datum.classificationName})`);
      return value;
    }

    this.log.emit(10311, 'd', `Environment variable ${envKey} not found`);
    return null;
  }

  /**
   * Store a single classified datum - NOT SUPPORTED (read-only)
   * @param {ClassifiedDatum} datum
   */
  async _storeSingle(datum) {
    this.log.emit(10300, 'w',
      `Cannot store ${datum.fullKey} - environment variables are read-only`);
    throw new SecureStoreError(
      SecureStore.CODES.STORE_ERROR,
      'Environment variables cannot be modified at runtime. Use .env file or set before process start.'
    );
  }

  /**
   * Clear a single classified datum - NOT SUPPORTED (read-only)
   * @param {ClassifiedDatum} datum
   */
  async _clearSingle(datum) {
    this.log.emit(10320, 'w',
      `Cannot clear ${datum.fullKey} - environment variables are read-only`);
    throw new SecureStoreError(
      SecureStore.CODES.STORE_ERROR,
      'Environment variables cannot be cleared at runtime'
    );
  }

  /**
   * List all items in a domain
   * @param {string} domain - Optional domain filter
   * @returns {Promise<ClassifiedData>}
   */
  async _listByDomain(domain = null) {
    const items = [];
    const prefixPattern = new RegExp(`^${this.prefix}${this.separator}`);

    for (const [envKey, value] of Object.entries(process.env)) {
      if (!prefixPattern.test(envKey)) {
        continue;
      }

      const parsed = this._parseEnvKey(envKey);
      if (!parsed) {
        continue;
      }

      // Filter by domain if specified
      if (domain && parsed.domain !== domain.toLowerCase()) {
        continue;
      }

      // Auto-detect classification from key name
      const datum = ClassifiedDatum.auto(parsed.domain, parsed.key, {
        source: 'environment',
        envKey
      });
      datum.value = value;

      items.push(datum);
    }

    this.log.emit(10330, 'd', `Listed ${items.length} environment variables`);
    return new ClassifiedData(items);
  }
}
