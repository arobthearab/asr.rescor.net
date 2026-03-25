/**
 * ClassifiedDatum - Represents a single classified data item
 *
 * Carries domain, key, value, and classification level with metadata
 */

/**
 * Data classification levels
 * Determines handling, caching, logging, and encryption policies
 */
export const Classified = Object.freeze({
  PUBLIC: 0,           // Openly shareable, no restrictions
  SETTING: 1,          // Non-sensitive configuration, can log (masked), longer cache
  PERSONAL: 2,         // PII data, GDPR/CCPA implications
  CREDENTIAL: 3,       // Passwords, API keys, tokens - never log, short cache, encrypted
  RESTRICTED: 4        // Requires approval, audit on access
});

/**
 * Single classified data item
 */
export class ClassifiedDatum {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} domain - Domain/namespace (e.g., 'database', 'api')
   * @param {string} key - Key within domain (e.g., 'password', 'hostname')
   * @param {number} classification - Classification level from Classified enum
   * @param {object} metadata - Additional metadata (ttl, owner, compliance tags, etc.)
   */
  constructor(domain, key, classification = Classified.SETTING, metadata = {}) {
    this.domain = domain;
    this.key = key;
    this.classification = classification;
    this.metadata = metadata;
    this.value = null; // Set by store.get() or with()
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get full key (domain:key)
   */
  get fullKey() {
    return `${this.domain}:${this.key}`;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if this is sensitive data (requires special handling)
   */
  get isSensitive() {
    return this.classification >= Classified.CREDENTIAL;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if this contains PII (GDPR/CCPA implications)
   */
  get isPII() {
    return this.classification === Classified.PERSONAL;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if this is publicly shareable
   */
  get isPublic() {
    return this.classification === Classified.PUBLIC;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get recommended TTL based on classification
   * @returns {number} TTL in milliseconds
   */
  get recommendedTTL() {
    const ttls = {
      [Classified.PUBLIC]: 86400000,      // 24 hours
      [Classified.SETTING]: 3600000,      // 1 hour
      [Classified.PERSONAL]: 1800000,     // 30 minutes
      [Classified.CREDENTIAL]: 300000,    // 5 minutes
      [Classified.RESTRICTED]: 60000      // 1 minute
    };
    return this.metadata.ttl || ttls[this.classification];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if this should be logged
   */
  get shouldLog() {
    // CREDENTIAL and RESTRICTED should not be logged
    return this.classification < Classified.CREDENTIAL;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if this should be encrypted at rest
   */
  get requiresEncryption() {
    return this.classification >= Classified.PERSONAL;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a copy with a value
   * @param {string} value - Value to set
   * @returns {ClassifiedDatum}
   */
  with(value) {
    const datum = new ClassifiedDatum(
      this.domain,
      this.key,
      this.classification,
      { ...this.metadata }
    );
    datum.value = value;
    return datum;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a copy with updated metadata
   * @param {object} metadata - Metadata to merge
   * @returns {ClassifiedDatum}
   */
  withMetadata(metadata) {
    return new ClassifiedDatum(
      this.domain,
      this.key,
      this.classification,
      { ...this.metadata, ...metadata }
    );
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convert to plain object (for serialization)
   * @returns {{domain:string,key:string,fullKey:string,classification:number,classificationName:string,metadata:object,value:*}}
   */
  toObject() {
    return {
      domain: this.domain,
      key: this.key,
      fullKey: this.fullKey,
      classification: this.classification,
      classificationName: this.classificationName,
      metadata: this.metadata,
      value: this.value
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get human-readable classification name
   * @returns {string}
   */
  get classificationName() {
    const names = {
      [Classified.PUBLIC]: 'PUBLIC',
      [Classified.SETTING]: 'SETTING',
      [Classified.PERSONAL]: 'PERSONAL',
      [Classified.CREDENTIAL]: 'CREDENTIAL',
      [Classified.RESTRICTED]: 'RESTRICTED'
    };
    return names[this.classification] || 'UNKNOWN';
  }

  // ============================================================================
  // Factory Methods (Convenience)
  // ============================================================================

  /* -------------------------------------------------------------------------- */
  /**
   * Create a public data item
   * @param {string} domain
   * @param {string} key
   * @param {object} [metadata={}]
   * @returns {ClassifiedDatum}
   */
  static public(domain, key, metadata = {}) {
    return new ClassifiedDatum(domain, key, Classified.PUBLIC, metadata);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a setting/configuration item
   * @param {string} domain
   * @param {string} key
   * @param {object} [metadata={}]
   * @returns {ClassifiedDatum}
   */
  static setting(domain, key, metadata = {}) {
    return new ClassifiedDatum(domain, key, Classified.SETTING, metadata);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a credential item (password, API key, token)
   * @param {string} domain
   * @param {string} key
   * @param {object} [metadata={}]
   * @returns {ClassifiedDatum}
   */
  static credential(domain, key, metadata = {}) {
    return new ClassifiedDatum(domain, key, Classified.CREDENTIAL, metadata);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a personal/PII item
   * @param {string} domain
   * @param {string} key
   * @param {object} [metadata={}]
   * @returns {ClassifiedDatum}
   */
  static personal(domain, key, metadata = {}) {
    return new ClassifiedDatum(domain, key, Classified.PERSONAL, metadata);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a restricted item
   * @param {string} domain
   * @param {string} key
   * @param {object} [metadata={}]
   * @returns {ClassifiedDatum}
   */
  static restricted(domain, key, metadata = {}) {
    return new ClassifiedDatum(domain, key, Classified.RESTRICTED, metadata);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Auto-detect classification from key name
   * @param {string} domain
   * @param {string} key
   * @param {object} metadata
   * @returns {ClassifiedDatum}
   */
  static auto(domain, key, metadata = {}) {
    const lowerKey = key.toLowerCase();

    // Credential patterns
    const credentialPatterns = ['password', 'pwd', 'secret', 'token', 'key', 'apikey', 'api_key'];
    if (credentialPatterns.some(pattern => lowerKey.includes(pattern))) {
      return ClassifiedDatum.credential(domain, key, metadata);
    }

    // PII patterns
    const piiPatterns = ['email', 'ssn', 'phone', 'address', 'dob', 'birthdate'];
    if (piiPatterns.some(pattern => lowerKey.includes(pattern))) {
      return ClassifiedDatum.personal(domain, key, metadata);
    }

    // Default to setting
    return ClassifiedDatum.setting(domain, key, metadata);
  }
}

/**
 * Collection of classified data items
 */
export class ClassifiedData {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {ClassifiedDatum[]} items - Array of ClassifiedDatum objects
   */
  constructor(items = []) {
    this.items = Array.isArray(items) ? items : [items];
    this.values = new Map(); // fullKey -> value
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Add a datum to the collection
   * @param {ClassifiedDatum} datum
   * @returns {ClassifiedData}
   */
  add(datum) {
    this.items.push(datum);
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Add multiple data
   * @param {ClassifiedDatum[]} data
   * @returns {ClassifiedData}
   */
  addAll(data) {
    this.items.push(...data);
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get datum by domain and key
   * @param {string} domain
   * @param {string} key
   * @returns {ClassifiedDatum|undefined}
   */
  get(domain, key) {
    return this.items.find(d => d.domain === domain && d.key === key);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get value for domain and key (from loaded values)
   * @param {string} domain
   * @param {string} key
   * @returns {string|null}
   */
  getValue(domain, key) {
    return this.values.get(`${domain}:${key}`) || null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set value for domain and key
   * @param {string} domain
   * @param {string} key
   * @param {string} value
   */
  setValue(domain, key, value) {
    this.values.set(`${domain}:${key}`, value);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all items with a specific classification
   * @param {number} classification
   * @returns {ClassifiedDatum[]}
   */
  byClassification(classification) {
    return this.items.filter(d => d.classification === classification);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all credential items
   * @returns {ClassifiedDatum[]}
   */
  get credentials() {
    return this.byClassification(Classified.CREDENTIAL);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all setting items
   * @returns {ClassifiedDatum[]}
   */
  get settings() {
    return this.byClassification(Classified.SETTING);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all personal/PII items
   * @returns {ClassifiedDatum[]}
   */
  get personal() {
    return this.byClassification(Classified.PERSONAL);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all sensitive items (CREDENTIAL or RESTRICTED)
   * @returns {ClassifiedDatum[]}
   */
  get sensitive() {
    return this.items.filter(d => d.isSensitive);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all items for a specific domain
   * @param {string} domain
   * @returns {ClassifiedDatum[]}
   */
  byDomain(domain) {
    return this.items.filter(d => d.domain === domain);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all domains
   * @returns {string[]}
   */
  get domains() {
    return [...new Set(this.items.map(d => d.domain))];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if collection has any values loaded
   * @returns {boolean}
   */
  get hasValues() {
    return this.values.size > 0;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Validate that all items have values
   * @throws {Error} If any required items are missing
   */
  validate() {
    const missing = this.items.filter(item => {
      if (!item.metadata.required) return false;
      const value = this.values.get(item.fullKey);
      return value === null || value === undefined;
    });

    if (missing.length > 0) {
      const missingKeys = missing.map(d => d.fullKey).join(', ');
      throw new Error(`Missing required configuration: ${missingKeys}`);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convert to object with values
   * @returns {object}
   */
  toObject() {
    const obj = {};
    for (const item of this.items) {
      if (!obj[item.domain]) {
        obj[item.domain] = {};
      }
      obj[item.domain][item.key] = this.values.get(item.fullKey) || null;
    }
    return obj;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get size of collection
   * @returns {number}
   */
  get size() {
    return this.items.length;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Iterate over items
   * @returns {Iterator<ClassifiedDatum>}
   */
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if item exists in collection
   * @param {string} domain
   * @param {string} key
   * @returns {boolean}
   */
  has(domain, key) {
    return this.items.some(d => d.domain === domain && d.key === key);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a new collection from subset
   * @param {function} predicate - Filter function
   * @returns {ClassifiedData}
   */
  filter(predicate) {
    return new ClassifiedData(this.items.filter(predicate));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Map over items
   * @param {function} mapper
   * @returns {Array}
   */
  map(mapper) {
    return this.items.map(mapper);
  }
}
