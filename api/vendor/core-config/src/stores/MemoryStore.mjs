/**
 * MemoryStore - In-memory secret store
 *
 * Used for:
 * - Testing/mocking
 * - Caching layer in CascadingStore
 * - Temporary storage
 *
 * Phase 1: Implements unified API with ClassifiedDatum
 */

import { SecureStore } from '../SecureStore.mjs';
import { ClassifiedDatum, ClassifiedData, Classified } from '../ClassifiedDatum.mjs';

export class MemoryStore extends SecureStore {
  constructor(options = {}) {
    super(options);

    this.storage = new Map(); // domain:key -> { value, metadata }
    this.ttl = options.ttl || 3600000; // Default 1 hour TTL
    this.enableTTL = options.enableTTL ?? true;
    this._initialized = true;
  }

  get isInitialized() {
    return this._initialized;
  }

  async _initialize() {
    this.storage.clear();
    this.log.emit(SecureStore.CODES.INITIALIZING, 'i', 'Memory store initialized');
    return true;
  }

  async access() {
    return this;
  }

  /**
   * Build storage key from domain and key
   */
  _buildKey(domain, key) {
    return `${domain}:${key}`;
  }

  /**
   * Check if cached item has expired
   */
  _isExpired(metadata) {
    if (!this.enableTTL || !metadata.expires) {
      return false;
    }
    return Date.now() > metadata.expires;
  }

  // ============================================================================
  // UNIFIED API IMPLEMENTATION
  // ============================================================================

  /**
   * Get a single classified datum from memory
   * @param {ClassifiedDatum} datum
   * @returns {Promise<string|null>}
   */
  async _getSingle(datum) {
    const storageKey = this._buildKey(datum.domain, datum.key);
    const cached = this.storage.get(storageKey);

    if (!cached) {
      this.log.emit(10410, 'd', `Memory cache miss for ${datum.fullKey}`);
      return null;
    }

    // Check expiration
    if (this._isExpired(cached.metadata)) {
      this.storage.delete(storageKey);
      this.log.emit(10411, 'd', `Memory cache expired for ${datum.fullKey}`);
      return null;
    }

    this.log.emit(10412, 'd', `Memory cache hit for ${datum.fullKey} (${datum.classificationName})`);
    return cached.value;
  }

  /**
   * Store a single classified datum in memory
   * @param {ClassifiedDatum} datum - Must have value set
   */
  async _storeSingle(datum) {
    const storageKey = this._buildKey(datum.domain, datum.key);

    // Use classification-specific TTL
    const ttl = datum.recommendedTTL;

    const metadata = {
      stored: Date.now(),
      expires: this.enableTTL ? Date.now() + ttl : null,
      source: 'memory',
      classification: datum.classification,
      classificationName: datum.classificationName
    };

    this.storage.set(storageKey, { value: datum.value, metadata });

    this.log.emit(10400, 'd',
      `Stored ${datum.fullKey} in memory (${datum.classificationName}, TTL: ${ttl}ms)`);
  }

  /**
   * Clear a single classified datum from memory
   * @param {ClassifiedDatum} datum
   */
  async _clearSingle(datum) {
    const storageKey = this._buildKey(datum.domain, datum.key);
    const existed = this.storage.delete(storageKey);

    this.log.emit(10420, 'd',
      `Cleared ${datum.fullKey} from memory (existed: ${existed})`);
  }

  /**
   * Clear all cached items
   */
  async clearAll() {
    const count = this.storage.size;
    this.storage.clear();
    this.log.emit(10421, 'i', `Cleared all ${count} items from memory`);
    return this;
  }

  /**
   * Prune expired items
   */
  async prune() {
    let pruned = 0;

    for (const [storageKey, cached] of this.storage.entries()) {
      if (this._isExpired(cached.metadata)) {
        this.storage.delete(storageKey);
        pruned++;
      }
    }

    this.log.emit(10422, 'd', `Pruned ${pruned} expired items from memory`);
    return pruned;
  }

  /**
   * List all items in a domain
   * @param {string} domain - Optional domain filter
   * @returns {Promise<ClassifiedData>}
   */
  async _listByDomain(domain = null) {
    const items = [];

    for (const [storageKey, cached] of this.storage.entries()) {
      // Skip expired items
      if (this._isExpired(cached.metadata)) {
        continue;
      }

      const [itemDomain, itemKey] = storageKey.split(':');

      // Filter by domain if specified
      if (domain && itemDomain !== domain) {
        continue;
      }

      // Create ClassifiedDatum with stored classification
      const classification = cached.metadata.classification || Classified.SETTING;
      const datum = new ClassifiedDatum(itemDomain, itemKey, classification, cached.metadata);
      datum.value = cached.value;

      items.push(datum);
    }

    this.log.emit(10430, 'd', `Listed ${items.length} items from memory`);
    return new ClassifiedData(items);
  }

  /**
   * Get statistics about memory store
   */
  getStats() {
    let expired = 0;
    let active = 0;

    for (const cached of this.storage.values()) {
      if (this._isExpired(cached.metadata)) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.storage.size,
      active,
      expired,
      ttl: this.ttl,
      enableTTL: this.enableTTL
    };
  }
}
