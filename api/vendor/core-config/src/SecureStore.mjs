/*
    Abstract class to manage secrets and configuration information stored
    in external sources.

    Originally from spm.rescor.net - adapted for core.rescor.net

    Phase 1: Unified API using ClassifiedDatum/ClassifiedData
*/

import { Recorder } from '@rescor-llc/core-utils';
import { ClassifiedDatum, ClassifiedData } from './ClassifiedDatum.mjs';

class SecureStoreError extends Error {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {number} code
   * @param {string} message
   * @param {Error|null} [cause=null]
   */
  constructor(code, message, cause = null) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'SecureStoreError';
  }
}

// Legacy compatibility exports
class SecureItem {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} domain
   * @param {string} key
   * @param {*} value
   * @param {object} [metadata={}]
   */
  constructor(domain, key, value, metadata = {}) {
    this.domain = domain;
    this.key = key;
    this.value = value;
    this.metadata = metadata;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {string}
   */
  get fullKey() {
    return `${this.domain}:${this.key}`;
  }
}

class SecureItems {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {Array<{fullKey?:string,domain?:string,key?:string,value:*}>} [items=[]]
   */
  constructor(items = []) {
    this.map = new Map();

    for (const item of items) {
      this.map.set(item.fullKey || `${item.domain}:${item.key}`, item.value);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} domain
   * @param {string} key
   * @returns {*}
   */
  get(domain, key) {
    return this.map.get(`${domain}:${key}`);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} domain
   * @param {string} key
   * @param {*} value
   */
  set(domain, key, value) {
    this.map.set(`${domain}:${key}`, value);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} domain
   * @param {string} key
   * @returns {boolean}
   */
  has(domain, key) {
    return this.map.has(`${domain}:${key}`);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @returns {SecureItem[]}
   */
  toArray() {
    return Array.from(this.map.entries()).map(([fullKey, value]) => {
      const [domain, key] = fullKey.split(':');
      return new SecureItem(domain, key, value);
    });
  }
}

class SecureStore {
  /* -------------------------------------------------------------------------- */
  static CODES = Object.freeze({
    ABSTRACT_CALL: 10001,
    ALREADY_INITIALIZED: 10002,
    FORCED_INITIALIZATION: 10003,
    INITIALIZING: 10004,
    NOT_INITIALIZED: 10005,
    INITIALIZATION_FAILED: 10006,
    ACCESS_DENIED: 10007,
    NOT_FOUND: 10008,
    STORE_ERROR: 10009
  });

  /* -------------------------------------------------------------------------- */
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    if (new.target === SecureStore) {
      throw new SecureStoreError(
        SecureStore.CODES.ABSTRACT_CALL,
        'SecureStore is abstract and cannot be instantiated directly'
      );
    }

    this.log = options.recorder || new Recorder('SecureStore.log', this.constructor.name);
    this.initializeIfNot = options.initializeIfNot ?? false;
    this._initialized = false;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Does whatever is necessary to verify the security store is initialized
   * @returns {boolean}
   */
  get isInitialized() {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      'isInitialized getter must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Performs the actual work of secure store initialization
   * @returns {Promise<boolean>}
   */
  async _initialize() {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      '_initialize method must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Initialization of secret store - usually executed only once, but can
   * be used again to reset the store
   * @param {boolean} force - Force re-initialization
   * @returns {Promise<boolean>}
   */
  async initialize(force = false) {
    if (this.isInitialized && !force) {
      this.log.emit(SecureStore.CODES.ALREADY_INITIALIZED, 'i', 'Already initialized, skipping');
      return true;
    }

    if (this.isInitialized && force) {
      this.log.emit(SecureStore.CODES.FORCED_INITIALIZATION, 'w', 'Force re-initialization');
    } else {
      this.log.emit(SecureStore.CODES.INITIALIZING, 'i', 'Not initialized, initializing now');
    }

    try {
      const result = await this._initialize();
      this._initialized = result;
      return result;
    } catch (err) {
      this.log.emit(SecureStore.CODES.INITIALIZATION_FAILED, 'e', `Initialization failed: ${err.message}`);
      throw err;
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Soft check for initialization unless this.initializeIfNot = true or override is true
   * @param {boolean} override - Override initializeIfNot setting
   * @returns {Promise<SecureStore|null>}
   */
  async ready(override = null) {
    if (this.isInitialized) {
      return this;
    }

    if (this.initializeIfNot || override) {
      await this.initialize();
      return this;
    }

    this.log.emit(SecureStore.CODES.NOT_INITIALIZED, 'w', 'Store not initialized');
    return null;
  }

  // ============================================================================
  // UNIFIED API (Phase 1) - Accepts ClassifiedDatum or ClassifiedData
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * Get value(s) from the secure store
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<string|ClassifiedData>} - Value for single, ClassifiedData for collection
   */
  async get(data) {
    // Handle ClassifiedData (collection)
    if (data instanceof ClassifiedData) {
      for (const datum of data.items) {
        const value = await this._getSingle(datum);
        data.setValue(datum.domain, datum.key, value);
      }
      return data;
    }

    // Handle ClassifiedDatum (single)
    if (data instanceof ClassifiedDatum) {
      return this._getSingle(data);
    }

    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      'get() requires ClassifiedDatum or ClassifiedData'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Store value(s) in the secure store
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<SecureStore>}
   */
  async store(data) {
    // Handle ClassifiedData (collection)
    if (data instanceof ClassifiedData) {
      for (const datum of data.items) {
        // Value should be in ClassifiedData.values or datum.value
        const value = data.getValue(datum.domain, datum.key) || datum.value;
        if (value !== null && value !== undefined) {
          await this._storeSingle(datum.with(value));
        }
      }
      return this;
    }

    // Handle ClassifiedDatum (single)
    if (data instanceof ClassifiedDatum) {
      await this._storeSingle(data);
      return this;
    }

    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      'store() requires ClassifiedDatum or ClassifiedData'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear value(s) from the secure store
   * @param {ClassifiedDatum|ClassifiedData} data - Single datum or collection
   * @returns {Promise<SecureStore>}
   */
  async clear(data) {
    // Handle ClassifiedData (collection)
    if (data instanceof ClassifiedData) {
      for (const datum of data.items) {
        await this._clearSingle(datum);
      }
      return this;
    }

    // Handle ClassifiedDatum (single)
    if (data instanceof ClassifiedDatum) {
      await this._clearSingle(data);
      return this;
    }

    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      'clear() requires ClassifiedDatum or ClassifiedData'
    );
  }

  // ============================================================================
  // ABSTRACT METHODS - Subclasses implement these for single operations
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * Get a single classified datum (implemented by subclasses)
   * @param {ClassifiedDatum} datum
   * @returns {Promise<string|null>}
   * @protected
   */
  async _getSingle(datum) {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      '_getSingle method must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Store a single classified datum (implemented by subclasses)
   * @param {ClassifiedDatum} datum - Must have value set
   * @returns {Promise<void>}
   * @protected
   */
  async _storeSingle(datum) {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      '_storeSingle method must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear a single classified datum (implemented by subclasses)
   * @param {ClassifiedDatum} datum
   * @returns {Promise<void>}
   * @protected
   */
  async _clearSingle(datum) {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      '_clearSingle method must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * List all items in a domain (implemented by subclasses)
   * @param {string} domain - Optional domain filter
   * @returns {Promise<ClassifiedData>}
   * @protected
   */
  async _listByDomain(domain = null) {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      '_listByDomain method must be implemented by subclass'
    );
  }

  // ============================================================================
  // BACKWARD COMPATIBILITY - Legacy API (wrappers around unified API)
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use get(ClassifiedDatum.credential(domain, key)) instead
   */
  async getCredential(domain, key) {
    return this.get(ClassifiedDatum.credential(domain, key));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use get(ClassifiedDatum.setting(domain, key)) instead
   */
  async getConfiguration(domain, key) {
    return this.get(ClassifiedDatum.setting(domain, key));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use store(ClassifiedDatum.credential(domain, key).with(secret)) instead
   */
  async storeCredential(domain, key, secret) {
    return this.store(ClassifiedDatum.credential(domain, key).with(secret));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use store(ClassifiedDatum.setting(domain, key).with(value)) instead
   */
  async storeConfiguration(domain, key, value) {
    return this.store(ClassifiedDatum.setting(domain, key).with(value));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use clear(ClassifiedDatum.credential(domain, key)) instead
   */
  async clearCredential(domain, key) {
    return this.clear(ClassifiedDatum.credential(domain, key));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use clear(ClassifiedDatum.setting(domain, key)) instead
   */
  async clearConfiguration(domain, key) {
    return this.clear(ClassifiedDatum.setting(domain, key));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use _listByDomain(domain) instead
   */
  async listCredentials(domain = null) {
    return this._listByDomain(domain);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * @deprecated Use _listByDomain(domain) instead
   */
  async listConfiguration(domain = null) {
    return this._listByDomain(domain);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Gain access to the secret store if necessary (authentication, connection, etc.)
   * @returns {Promise<SecureStore>}
   */
  async access() {
    throw new SecureStoreError(
      SecureStore.CODES.ABSTRACT_CALL,
      'access method must be implemented by subclass'
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Helper: Determine if a key represents a sensitive credential
   * @param {string} key
   * @returns {boolean}
   */
  static isSensitiveKey(key) {
    const sensitivePatterns = ['password', 'secret', 'token', 'key', 'credential', 'api_key'];
    const lowerKey = key.toLowerCase();
    return sensitivePatterns.some(pattern => lowerKey.includes(pattern));
  }
}

export { SecureStore, SecureItem, SecureItems, SecureStoreError };
